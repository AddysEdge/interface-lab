/**
 * Shareable component page (/c/:id). Public when published; a draft is
 * delivered only to its owner (the Durable Object filters it for everyone
 * else, so other users see "not found").
 */
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth, useQuery } from 'deepspace'
import { ArrowLeft, EyeOff, Globe, Moon, Pencil, Sun, Trash2 } from 'lucide-react'
import { Badge, Button, ConfirmModal, EmptyState, useToast } from '@/components/ui'
import { CodePanel } from '@/components/workshop/CodePanel'
import { FeedbackSection } from '@/components/workshop/FeedbackSection'
import { PreviewFrame } from '@/components/workshop/PreviewFrame'
import { callAction } from '@/lib/api'
import { categoryLabel } from '@/shared/categories'
import type { ComponentData, ComponentStatus } from '@/shared/types'

export default function ComponentPage() {
  const { id = '' } = useParams()
  const { userId } = useAuth()
  const navigate = useNavigate()
  const { success, error } = useToast()
  const { records, status } = useQuery<ComponentData>('components', { where: { recordId: id }, limit: 1 })
  const [dark, setDark] = useState(false)
  const [busy, setBusy] = useState<null | 'status' | 'delete'>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // Set when a publish/unpublish only partly updated feedback visibility; retrying completes it.
  const [retryStatus, setRetryStatus] = useState<ComponentStatus | null>(null)

  const record = records[0]
  const component = record?.data
  const isOwner = Boolean(component && userId && component.ownerId === userId)

  async function changeStatus(next: ComponentStatus) {
    setBusy('status')
    const result = await callAction('setComponentStatus', { id, status: next })
    setBusy(null)
    setRetryStatus(!result.success && result.code === 'visibility_incomplete' ? next : null)
    if (result.success) success(next === 'published' ? 'Published' : 'Moved back to drafts', next === 'published' ? 'Anyone with the link can now see it.' : 'Only you can see it now.')
    else error('Could not change status', result.error)
  }

  async function remove() {
    setBusy('delete')
    const result = await callAction('deleteComponent', { id })
    setBusy(null)
    setConfirmingDelete(false)
    if (result.success) {
      success('Component deleted')
      navigate('/studio')
    } else {
      error('Could not delete', result.error)
    }
  }

  if (status === 'loading') {
    return <div className="mx-auto max-w-6xl px-4 py-10" aria-busy="true"><div className="h-[420px] animate-pulse rounded-xl bg-muted" /></div>
  }
  if (!component) {
    return (
      <EmptyState
        className="py-24"
        title="Component not found"
        description="It may have been deleted, or it is a private draft."
        action={{ label: 'Browse the library', onClick: () => navigate('/home') }}
      />
    )
  }

  const published = component.status === 'published'

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
      <Link to="/home" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Library
      </Link>

      <header className="mt-3 flex flex-col gap-4 md:flex-row md:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl" data-testid="component-title">{component.title}</h1>
            {!published && <Badge variant="warning">Draft · only you can see this</Badge>}
            {Boolean(component.isSample) && <Badge variant="outline">Sample content</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {categoryLabel(component.category)} · by {component.authorName || 'Member'}
          </p>
          {component.description && <p className="mt-3 max-w-2xl text-sm text-foreground/90">{component.description}</p>}
          {component.tags?.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Tags">
              {component.tags.map((tag) => (
                <li key={tag}>
                  <Link to={`/home?q=${encodeURIComponent(tag)}`} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground">
                    #{tag}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {isOwner && (
          <div className="flex flex-wrap gap-2" data-testid="owner-controls">
            <Button variant="outline" size="sm" onClick={() => navigate(`/studio/${id}`)}>
              <Pencil aria-hidden /> Edit
            </Button>
            {published ? (
              <Button variant="outline" size="sm" loading={busy === 'status'} onClick={() => changeStatus('draft')}>
                <EyeOff aria-hidden /> Unpublish
              </Button>
            ) : (
              <Button size="sm" loading={busy === 'status'} onClick={() => changeStatus('published')}>
                <Globe aria-hidden /> Publish
              </Button>
            )}
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmingDelete(true)}>
              <Trash2 aria-hidden /> Delete
            </Button>
          </div>
        )}
      </header>

      {isOwner && retryStatus && (
        <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-warning/50 bg-warning/10 px-4 py-3 text-sm">
          <span className="flex-1">
            {retryStatus === 'draft' ? 'Unpublishing did not finish.' : 'Publishing finished, but some feedback is still hidden.'} Nothing private was exposed.
          </span>
          <Button size="sm" variant="outline" loading={busy === 'status'} onClick={() => changeStatus(retryStatus)}>Retry</Button>
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section aria-label="Live preview" className="flex min-h-[320px] flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
            <span>Isolated preview (no scripts, no network)</span>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setDark((d) => !d)} aria-label="Toggle preview background">
              {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
            </Button>
          </div>
          <div className="min-h-[320px] flex-1">
            <PreviewFrame html={component.html} css={component.css} dark={dark} title={`Preview of ${component.title}`} />
          </div>
        </section>
        <CodePanel html={component.html} css={component.css} />
      </div>

      <div className="mt-6">
        {published ? (
          <FeedbackSection componentId={id} componentOwnerId={component.ownerId} />
        ) : (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Feedback opens once this component is published.
          </p>
        )}
      </div>

      <ConfirmModal
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={remove}
        loading={busy === 'delete'}
        title="Delete this component?"
        description="The component and all of its feedback are removed permanently."
        confirmText="Delete"
      />
    </div>
  )
}
