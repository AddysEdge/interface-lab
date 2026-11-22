/**
 * Live feedback thread for a published component.
 *
 * - Live: useQuery subscribes to the component's feedback; other users' posts
 *   and deletions appear without a reload.
 * - Persisted ids: a post shows immediately under a temporary id, then is
 *   replaced by the record the server action returns (src/shared/feedbackThread.ts),
 *   so it can be replied to or deleted right away.
 * - Idempotent: each submit carries a clientRequestId; a retry after a network
 *   error returns the original record instead of posting twice.
 */
import { useMemo, useState, type FormEvent } from 'react'
import { AuthOverlay, useAuth, useQuery } from 'deepspace'
import { MessageSquare, Reply, Send, Trash2 } from 'lucide-react'
import { Button, ConfirmModal, Textarea, useToast } from '../ui'
import { callAction } from '@/lib/api'
import {
  addPending,
  buildThreads,
  canDelete,
  canReply,
  confirmPending,
  createTempId,
  EMPTY_LOCAL,
  failPending,
  markRemoved,
  mergeThread,
  newRequestId,
  unmarkRemoved,
  type FeedbackItem,
  type LocalThreadState,
} from '@/shared/feedbackThread'
import { LIMITS } from '@/shared/limits'
import type { FeedbackData } from '@/shared/types'

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (!Number.isFinite(seconds) || seconds < 45) return 'just now'
  const units: Array<[number, string]> = [[60, 'minute'], [3600, 'hour'], [86400, 'day'], [2592000, 'month']]
  let label = 'minute'
  let size = 60
  for (const [unitSize, unitLabel] of units) if (seconds >= unitSize) [size, label] = [unitSize, unitLabel]
  const value = Math.floor(seconds / size)
  return `${value} ${label}${value === 1 ? '' : 's'} ago`
}

export function FeedbackSection({ componentId, componentOwnerId }: { componentId: string; componentOwnerId: string }) {
  const { isSignedIn, userId } = useAuth()
  const { error: toastError, success } = useToast()
  const { records, status } = useQuery<FeedbackData>('feedback', {
    where: { componentId },
    orderBy: 'createdAt',
    orderDir: 'asc',
    limit: 500,
  })
  const [local, setLocal] = useState<LocalThreadState>(EMPTY_LOCAL)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<FeedbackItem | null>(null)
  const [showAuth, setShowAuth] = useState(false)

  const live: FeedbackItem[] = useMemo(
    () =>
      records.map((r) => ({
        recordId: r.recordId,
        componentId: r.data.componentId,
        parentId: r.data.parentId ?? '',
        body: r.data.body,
        authorId: r.data.authorId,
        authorName: r.data.authorName,
        createdAt: r.createdAt,
      })),
    [records],
  )
  const items = useMemo(() => mergeThread(live, local), [live, local])
  const threads = useMemo(() => buildThreads(items), [items])
  const count = items.filter((item) => !item.pending).length

  /** Returns true when the post was accepted (the caller then clears its form). */
  async function submit(body: string, parentId: string): Promise<boolean> {
    if (!userId) return false
    const requestId = newRequestId()
    const tempId = createTempId()
    setLocal((s) =>
      addPending(s, { recordId: tempId, componentId, parentId, body, authorId: userId, authorName: 'You', createdAt: new Date().toISOString() }),
    )
    const params = { componentId, parentId: parentId || null, body, clientRequestId: requestId }
    let result = await callAction<{ feedback: FeedbackItem; notification: string }>('createFeedback', params)
    // One automatic retry for transport failures; the request id makes it safe.
    if (!result.success && result.code === 'network') result = await callAction('createFeedback', params)
    if (result.success) {
      setLocal((s) => confirmPending(s, tempId, result.data.feedback))
      if (parentId) setReplyTo(null)
      return true
    }
    setLocal((s) => failPending(s, tempId))
    toastError('Feedback not posted', result.error)
    return false
  }

  async function remove(item: FeedbackItem) {
    setConfirmDelete(null)
    setLocal((s) => markRemoved(s, item.recordId))
    const result = await callAction('deleteFeedback', { id: item.recordId })
    if (!result.success) {
      setLocal((s) => unmarkRemoved(s, item.recordId))
      toastError('Could not delete feedback', result.error)
    } else {
      success('Feedback deleted')
    }
  }

  return (
    <section aria-labelledby="feedback-heading" className="rounded-xl border border-border bg-card p-4 sm:p-6" data-testid="feedback-section">
      <h2 id="feedback-heading" className="flex items-center gap-2 text-lg font-semibold">
        <MessageSquare className="size-5" aria-hidden /> Feedback
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground" data-testid="feedback-count">{count}</span>
      </h2>

      {status === 'loading' ? (
        <div className="mt-4 space-y-3" aria-busy="true" aria-label="Loading feedback">
          {[0, 1].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : status === 'error' ? (
        <p className="mt-4 text-sm text-destructive">Feedback could not be loaded. The connection retries automatically.</p>
      ) : threads.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground" data-testid="feedback-empty">No feedback yet. Be the first to share a thought.</p>
      ) : (
        <ol className="mt-4 space-y-4" data-testid="feedback-list">
          {threads.map(({ item, replies }) => (
            <li key={item.recordId} className="space-y-3">
              <FeedbackEntry
                item={item}
                isOwnerReply={item.authorId === componentOwnerId}
                canDelete={canDelete(item, userId)}
                onDelete={() => setConfirmDelete(item)}
                onReply={isSignedIn && canReply(item) ? () => setReplyTo(replyTo === item.recordId ? null : item.recordId) : undefined}
              />
              {(replies.length > 0 || replyTo === item.recordId) && (
                <ol className="ml-5 space-y-3 border-l border-border pl-4">
                  {replies.map((reply) => (
                    <li key={reply.recordId}>
                      <FeedbackEntry
                        item={reply}
                        isOwnerReply={reply.authorId === componentOwnerId}
                        canDelete={canDelete(reply, userId)}
                        onDelete={() => setConfirmDelete(reply)}
                      />
                    </li>
                  ))}
                  {replyTo === item.recordId && (
                    <li>
                      <Composer label={`Reply to ${item.authorName || 'feedback'}`} submitLabel="Reply" compact onSubmit={(body) => submit(body, item.recordId)} />
                    </li>
                  )}
                </ol>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-6 border-t border-border pt-4">
        {isSignedIn ? (
          <Composer label="Leave feedback" submitLabel="Post feedback" onSubmit={(body) => submit(body, '')} />
        ) : (
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
            <p className="text-sm text-muted-foreground">Sign in to leave feedback.</p>
            <Button size="sm" onClick={() => setShowAuth(true)}>Sign in</Button>
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && remove(confirmDelete)}
        title="Delete this feedback?"
        description="It will be removed for everyone. Replies to it stay visible."
        confirmText="Delete"
      />
      {showAuth && <AuthOverlay onClose={() => setShowAuth(false)} />}
    </section>
  )
}

function FeedbackEntry({
  item,
  isOwnerReply,
  canDelete: deletable,
  onDelete,
  onReply,
}: {
  item: FeedbackItem
  isOwnerReply: boolean
  canDelete: boolean
  onDelete: () => void
  onReply?: () => void
}) {
  if (item.deleted) {
    return <p className="rounded-lg bg-secondary px-3 py-2 text-sm italic text-muted-foreground">Feedback deleted</p>
  }
  return (
    <article className={`rounded-lg px-3 py-2 ${item.pending ? 'opacity-60' : ''}`} data-testid="feedback-item" aria-busy={item.pending || undefined}>
      <header className="flex flex-wrap items-center gap-x-2 text-sm">
        <span className="font-medium text-foreground">{item.authorName || 'Member'}</span>
        {isOwnerReply && <span className="rounded bg-primary/15 px-1.5 text-xs text-primary">Creator</span>}
        <span className="text-xs text-muted-foreground">{item.pending ? 'Posting…' : timeAgo(item.createdAt)}</span>
      </header>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground/90">{item.body}</p>
      {(onReply || deletable) && (
        <div className="mt-1 flex gap-1">
          {onReply && (
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onReply}>
              <Reply aria-hidden /> Reply
            </Button>
          )}
          {deletable && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={onDelete} aria-label="Delete feedback">
              <Trash2 aria-hidden /> Delete
            </Button>
          )}
        </div>
      )}
    </article>
  )
}

function Composer({
  label,
  submitLabel,
  compact = false,
  onSubmit,
}: {
  label: string
  submitLabel: string
  compact?: boolean
  onSubmit: (body: string) => Promise<boolean>
}) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const trimmed = value.trim()

  async function handle(event: FormEvent) {
    event.preventDefault()
    if (!trimmed || busy) return
    setBusy(true)
    const ok = await onSubmit(trimmed)
    setBusy(false)
    if (ok) setValue('')
  }

  return (
    <form onSubmit={handle} className="flex flex-col gap-2">
      <label className="text-sm font-medium">
        <span className={compact ? 'sr-only' : ''}>{label}</span>
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={LIMITS.feedbackMax}
          rows={compact ? 2 : 3}
          placeholder={compact ? 'Write a reply…' : 'What works well? What could be better?'}
          className="mt-1"
          aria-label={label}
        />
      </label>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{value.length}/{LIMITS.feedbackMax}</span>
        <Button type="submit" size="sm" disabled={!trimmed} loading={busy}>
          <Send aria-hidden /> {submitLabel}
        </Button>
      </div>
    </form>
  )
}
