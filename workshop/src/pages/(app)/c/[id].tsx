/**
 * Shareable component page (/c/:id). Public when published; a draft is
 * delivered only to its owner (the Durable Object filters it for everyone
 * else, so other users see "not found").
 */
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth, useQuery, useUser } from 'deepspace'
import { ArrowLeft, EyeOff, Globe, Moon, Pencil, Play, ShieldAlert, Square, Sun, Trash2 } from 'lucide-react'
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
  const { user } = useUser()
  const navigate = useNavigate()
  const { success, error, warning } = useToast()
  const { records, status } = useQuery<ComponentData>('components', { where: { recordId: id }, limit: 1 })
  const [dark, setDark] = useState(false)
  const [runScripts, setRunScripts] = useState(false)
  const [busy, setBusy] = useState<null | 'status' | 'delete' | 'moderate'>(null)
  const [confirming, setConfirming] = useState<null | 'delete' | 'hide'>(null)
  // Set when a publish/unpublish only partly updated feedback visibility; retrying completes it.
  const [retryStatus, setRetryStatus] = useState<ComponentStatus | null>(null)

  const record = records[0]
  const component = record?.data
  const isOwner = Boolean(component && userId && component.ownerId === userId)
  // UI hint only; the server checks the app owner on every moderation action.
  const isAppOwner = user?.role === 'admin'
  const hasScript = Boolean(component?.js?.trim())

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
    setConfirming(null)
    if (result.success) {
      success('Component deleted')
      navigate('/studio')
    } else {
      error('Could not delete', result.error)
    }
  }

  async function hide() {
    setBusy('moderate')
    const result = await callAction('moderateComponent', { id, action: 'hide' })
    setBusy(null)
    setConfirming(null)
    if (result.success) {
      success('Component hidden', 'It is no longer in the library. Restore it from Moderation.')
      navigate('/moderation')
    } else {
      error('Could not hide the component', result.error)
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
  const hidden = component.moderation === 'hidden'

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
            {hasScript && <Badge variant="outline">JavaScript</Badge>}
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

        <div className="flex flex-wrap gap-2">
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
                <Button size="sm" loading={busy === 'status'} disabled={hidden} onClick={() => changeStatus('published')}>
                  <Globe aria-hidden /> Publish
                </Button>
              )}
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirming('delete')}>
                <Trash2 aria-hidden /> Delete
              </Button>
            </div>
          )}
          {isAppOwner && !isOwner && published && (
            <Button variant="outline" size="sm" className="text-destructive" data-testid="moderation-hide" onClick={() => setConfirming('hide')}>
              <ShieldAlert aria-hidden /> Hide (moderation)
            </Button>
          )}
        </div>
      </header>

      {isOwner && hidden && (
        <p role="status" className="mt-4 rounded-lg border border-warning/50 bg-warning/10 px-4 py-3 text-sm">
          The app owner hid this component from the library. You can still edit or delete it, but it cannot be republished
          unless it is restored.
        </p>
      )}

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
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
            <span>{runScripts ? 'Running JavaScript in an isolated sandbox (no network, no access to this page)' : 'Isolated preview (scripts off, no network)'}</span>
            <div className="flex items-center gap-1">
              {hasScript && (
                <Button size="sm" variant="ghost" className="h-7" data-testid="run-scripts" onClick={() => setRunScripts((on) => !on)}>
                  {runScripts ? <><Square aria-hidden /> Stop JavaScript</> : <><Play aria-hidden /> Run JavaScript</>}
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-7" onClick={() => setDark((d) => !d)} aria-label="Toggle preview background">
                {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
              </Button>
            </div>
          </div>
          <div className="min-h-[320px] flex-1">
            <PreviewFrame
              html={component.html}
              css={component.css}
              js={component.js ?? ''}
              runScripts={runScripts}
              dark={dark}
              title={`Preview of ${component.title}`}
              onNavigated={() => {
                setRunScripts(false)
                warning('JavaScript stopped', 'This component tried to navigate its preview away, so scripts were turned off.')
              }}
            />
          </div>
        </section>
        <CodePanel html={component.html} css={component.css} js={component.js ?? ''} />
      </div>

      <div className="mt-6">
        {published ? (
          <FeedbackSection componentId={id} componentOwnerId={component.ownerId} canModerate={isOwner || isAppOwner} />
        ) : (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Feedback opens once this component is published.
          </p>
        )}
      </div>

      <ConfirmModal
        open={confirming === 'delete'}
        onClose={() => setConfirming(null)}
        onConfirm={remove}
        loading={busy === 'delete'}
        title="Delete this component?"
        description="The component and all of its feedback are removed permanently."
        confirmText="Delete"
      />
      <ConfirmModal
        open={confirming === 'hide'}
        onClose={() => setConfirming(null)}
        onConfirm={hide}
        loading={busy === 'moderate'}
        title="Hide this component from the library?"
        description="It and its feedback disappear for everyone. Its creator keeps it as a draft but cannot republish it until you restore it."
        confirmText="Hide"
      />
    </div>
  )
}
