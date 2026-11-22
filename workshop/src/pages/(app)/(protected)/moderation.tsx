/**
 * Moderation (/moderation) for the app owner: hide components from the
 * library, remove any feedback, and restore hidden components. The page is
 * only a convenience; every action re-checks the app owner on the server.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useUser } from 'deepspace'
import { RotateCcw, ShieldAlert, Trash2 } from 'lucide-react'
import { Button, ConfirmModal, EmptyState, useToast } from '@/components/ui'
import { callAction } from '@/lib/api'
import { categoryLabel } from '@/shared/categories'
import type { ComponentData, FeedbackData } from '@/shared/types'

interface HiddenItem {
  id: string
  title: string
  authorName: string
  category: string
}

type Pending = { kind: 'hide'; id: string; title: string } | { kind: 'remove'; id: string; body: string } | null

export default function ModerationPage() {
  const { user, isLoading } = useUser()
  const { success, error } = useToast()
  const isAppOwner = user?.role === 'admin'
  const components = useQuery<ComponentData>('components', { where: { status: 'published' }, orderBy: 'updatedAt', orderDir: 'desc', limit: 100 })
  const feedback = useQuery<FeedbackData>('feedback', { where: { componentStatus: 'published' }, orderBy: 'createdAt', orderDir: 'desc', limit: 50 })
  const [hidden, setHidden] = useState<HiddenItem[] | null>(null)
  const [hiddenError, setHiddenError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [busy, setBusy] = useState(false)

  const loadHidden = useCallback(async () => {
    const result = await callAction<{ items: HiddenItem[] }>('listHiddenComponents', {})
    if (result.success) {
      setHidden(result.data.items)
      setHiddenError(null)
    } else {
      setHiddenError(result.error)
    }
  }, [])

  useEffect(() => {
    if (isAppOwner) void loadHidden()
  }, [isAppOwner, loadHidden])

  async function confirm() {
    if (!pending) return
    setBusy(true)
    const result =
      pending.kind === 'hide'
        ? await callAction('moderateComponent', { id: pending.id, action: 'hide' })
        : await callAction('deleteFeedback', { id: pending.id })
    setBusy(false)
    setPending(null)
    if (result.success) {
      success(pending.kind === 'hide' ? 'Component hidden' : 'Feedback removed')
      if (pending.kind === 'hide') void loadHidden()
    } else {
      error(pending.kind === 'hide' ? 'Could not hide the component' : 'Could not remove the feedback', result.error)
    }
  }

  async function restore(item: HiddenItem) {
    const result = await callAction('moderateComponent', { id: item.id, action: 'restore' })
    if (result.success) {
      success('Restored', `${item.title} can be republished by its creator.`)
      void loadHidden()
    } else {
      error('Could not restore', result.error)
    }
  }

  if (isLoading) return <div className="mx-auto max-w-5xl px-4 py-10" aria-busy="true"><div className="h-64 animate-pulse rounded-xl bg-muted" /></div>
  if (!isAppOwner) {
    return <EmptyState className="py-24" icon={<ShieldAlert />} title="Moderation is for the app owner" description="Sign in with the account that owns InterfaceLab to moderate the library." />
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12" data-testid="moderation-page">
      <h1 className="text-3xl font-bold tracking-tight">Moderation</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Hiding a component removes it and its feedback from the library; its creator keeps it as a draft but cannot republish it until you restore it.
      </p>

      <Section title={`Hidden components (${hidden?.length ?? '…'})`}>
        {hiddenError ? (
          <p className="text-sm text-destructive">{hiddenError} <button className="underline" onClick={() => void loadHidden()}>Try again</button></p>
        ) : hidden === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : hidden.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing is hidden.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {hidden.map((item) => (
              <li key={item.id} className="flex items-center gap-3 p-3 text-sm">
                <span className="min-w-0 flex-1 truncate"><strong>{item.title}</strong> · {categoryLabel(item.category)} · {item.authorName || 'Member'}</span>
                <Button size="sm" variant="outline" onClick={() => void restore(item)}><RotateCcw aria-hidden /> Restore</Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Published components">
        {components.status === 'loading' ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : components.records.length === 0 ? (
          <p className="text-sm text-muted-foreground">No published components.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {components.records.map((r) => (
              <li key={r.recordId} className="flex items-center gap-3 p-3 text-sm">
                <Link to={`/c/${r.recordId}`} className="min-w-0 flex-1 truncate hover:underline">
                  <strong>{r.data.title}</strong> · {categoryLabel(r.data.category)} · {r.data.authorName || 'Member'}
                </Link>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setPending({ kind: 'hide', id: r.recordId, title: r.data.title })}>
                  <ShieldAlert aria-hidden /> Hide
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Recent feedback">
        {feedback.status === 'loading' ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : feedback.records.length === 0 ? (
          <p className="text-sm text-muted-foreground">No feedback yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {feedback.records.map((r) => (
              <li key={r.recordId} className="flex items-start gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate"><strong>{r.data.authorName || 'Member'}</strong> on <Link className="hover:underline" to={`/c/${r.data.componentId}`}>a component</Link></p>
                  <p className="line-clamp-2 text-muted-foreground">{r.data.body}</p>
                </div>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setPending({ kind: 'remove', id: r.recordId, body: r.data.body })}>
                  <Trash2 aria-hidden /> Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <ConfirmModal
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => void confirm()}
        loading={busy}
        title={pending?.kind === 'hide' ? `Hide “${pending.title}”?` : 'Remove this feedback?'}
        description={pending?.kind === 'hide' ? 'It and its feedback disappear from the library for everyone.' : 'It is removed for everyone. Replies to it stay visible.'}
        confirmText={pending?.kind === 'hide' ? 'Hide' : 'Remove'}
      />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  )
}
