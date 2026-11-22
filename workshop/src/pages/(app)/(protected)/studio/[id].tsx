/**
 * Component editor (/studio/new or /studio/:id).
 *
 * HTML/CSS editing with an isolated live preview, private draft saving,
 * publishing, and the two creator integrations (AI review, docs search).
 * Integrations are optional helpers: if they fail, editing, saving and
 * publishing keep working.
 */
import { useDeferredValue, useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom'
import { useAuth, useQuery } from 'deepspace'
import { ArrowLeft, Globe, Save } from 'lucide-react'
import { Badge, Button, EmptyState, Input, Textarea, useToast } from '@/components/ui'
import { DocsPanel } from '@/components/workshop/DocsPanel'
import { PreviewFrame } from '@/components/workshop/PreviewFrame'
import { ReviewPanel } from '@/components/workshop/ReviewPanel'
import { callAction } from '@/lib/api'
import { CATEGORIES, categoryLabel, type CategoryId } from '@/shared/categories'
import { LIMITS } from '@/shared/limits'
import type { ComponentData, ComponentStatus } from '@/shared/types'
import { publishProblems } from '@/shared/validation'

interface Draft {
  title: string
  description: string
  category: CategoryId
  tags: string
  html: string
  css: string
}

const STARTER: Draft = {
  title: '',
  description: '',
  category: 'buttons',
  tags: '',
  html: '<button class="btn" type="button">Click me</button>',
  css: `.btn {
  background: #4f46e5;
  color: #fff;
  border: 0;
  border-radius: 10px;
  padding: 12px 28px;
  font: 600 15px system-ui, sans-serif;
  cursor: pointer;
}
.btn:hover { background: #4338ca; }
.btn:focus-visible { outline: 3px solid #a5b4fc; outline-offset: 2px; }`,
}

function toDraft(data: ComponentData): Draft {
  return {
    title: data.title,
    description: data.description ?? '',
    category: data.category,
    tags: (data.tags ?? []).join(', '),
    html: data.html ?? '',
    css: data.css ?? '',
  }
}

function toParams(draft: Draft, id: string | null) {
  return {
    ...(id ? { id } : {}),
    title: draft.title,
    description: draft.description,
    category: draft.category,
    tags: draft.tags.split(',').map((t) => t.trim()).filter(Boolean),
    html: draft.html,
    css: draft.css,
  }
}

/** Tab inserts two spaces instead of leaving the code field. */
function handleTab(event: KeyboardEvent<HTMLTextAreaElement>, update: (value: string) => void) {
  if (event.key !== 'Tab' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return
  event.preventDefault()
  const el = event.currentTarget
  const { selectionStart: start, selectionEnd: end, value } = el
  update(`${value.slice(0, start)}  ${value.slice(end)}`)
  requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2))
}

export default function EditorPage() {
  const { id: routeId = 'new' } = useParams()
  const isNew = routeId === 'new'
  const { userId } = useAuth()
  const navigate = useNavigate()
  const { success, error } = useToast()

  const { records, status } = useQuery<ComponentData>('components', {
    where: { recordId: isNew ? '__new__' : routeId },
    limit: 1,
  })
  const record = isNew ? undefined : records[0]
  const owned = record && record.data.ownerId === userId ? record : undefined

  const [draft, setDraft] = useState<Draft>(STARTER)
  const [saved, setSaved] = useState<Draft | null>(isNew ? null : null)
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<null | 'save' | 'publish'>(null)
  const [docsRequest, setDocsRequest] = useState<{ query: string; nonce: number } | null>(null)
  const [codeTab, setCodeTab] = useState<'html' | 'css'>('html')
  const [previewDark, setPreviewDark] = useState(false)

  // Load the stored component once (later live updates do not overwrite typing).
  useEffect(() => {
    if (owned && loadedId !== owned.recordId) {
      const next = toDraft(owned.data)
      setDraft(next)
      setSaved(next)
      setLoadedId(owned.recordId)
    }
  }, [owned, loadedId])

  const componentId = isNew ? null : routeId
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved ?? (isNew ? null : draft)), [draft, saved, isNew])
  const currentStatus: ComponentStatus = owned?.data.status ?? 'draft'
  const deferredHtml = useDeferredValue(draft.html)
  const deferredCss = useDeferredValue(draft.css)

  // Warn before leaving with unsaved edits (in-app navigation and tab close).
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && busy === null && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (window.confirm('You have unsaved changes. Leave without saving?')) blocker.proceed()
      else blocker.reset()
    }
  }, [blocker])
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  async function save(): Promise<string | null> {
    setFieldErrors({})
    const result = await callAction<{ id: string; status: ComponentStatus }>('saveComponent', toParams(draft, componentId))
    if (!result.success) {
      const fields = (result.details?.fields ?? {}) as Record<string, string>
      setFieldErrors(fields)
      error('Not saved', result.error)
      return null
    }
    setSaved(draft)
    if (isNew) {
      setLoadedId(result.data.id)
      navigate(`/studio/${result.data.id}`, { replace: true })
    }
    return result.data.id
  }

  async function onSave() {
    setBusy('save')
    const id = await save()
    setBusy(null)
    if (id) success(currentStatus === 'published' ? 'Changes published' : 'Draft saved', currentStatus === 'published' ? undefined : 'Only you can see it until you publish.')
  }

  async function onPublish() {
    const problems = publishProblems(draft)
    if (problems.length) {
      error('Not ready to publish', problems.join(' '))
      return
    }
    setBusy('publish')
    const id = dirty || isNew ? await save() : componentId
    if (!id) return setBusy(null)
    const result = await callAction('setComponentStatus', { id, status: 'published' })
    setBusy(null)
    if (!result.success) return error('Not published', result.error)
    success('Published', 'Your component is live. Share the link to collect feedback.')
    navigate(`/c/${id}`)
  }

  if (!isNew && status === 'loading') {
    return <div className="mx-auto max-w-7xl px-4 py-10" aria-busy="true"><div className="h-[520px] animate-pulse rounded-xl bg-muted" /></div>
  }
  if (!isNew && !owned) {
    return (
      <EmptyState
        className="py-24"
        title="Component not found"
        description="It doesn’t exist, or it isn’t yours to edit."
        action={{ label: 'Back to my components', onClick: () => navigate('/studio') }}
      />
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/studio" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> My components
        </Link>
        <span className="flex-1" />
        <Badge variant={currentStatus === 'published' ? 'success' : 'warning'} data-testid="editor-status">
          {isNew ? 'New draft' : currentStatus === 'published' ? 'Published' : 'Draft'}
        </Badge>
        {dirty && <span className="text-xs text-muted-foreground" data-testid="unsaved">Unsaved changes</span>}
        <Button variant="outline" size="sm" onClick={onSave} loading={busy === 'save'} disabled={busy !== null || (!dirty && !isNew)}>
          <Save aria-hidden /> {currentStatus === 'published' ? 'Save changes' : 'Save draft'}
        </Button>
        {currentStatus !== 'published' && (
          <Button size="sm" onClick={onPublish} loading={busy === 'publish'} disabled={busy !== null}>
            <Globe aria-hidden /> Publish
          </Button>
        )}
        {!isNew && currentStatus === 'published' && (
          <Link to={`/c/${routeId}`} className="text-sm text-primary hover:underline">View public page</Link>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title" error={fieldErrors.title}>
              <Input value={draft.title} maxLength={LIMITS.titleMax} onChange={(e) => update('title', e.target.value)} placeholder="Gradient pill button" aria-invalid={Boolean(fieldErrors.title) || undefined} />
            </Field>
            <Field label="Category" error={fieldErrors.category}>
              <select value={draft.category} onChange={(e) => update('category', e.target.value as CategoryId)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Description" error={fieldErrors.description}>
            <Textarea value={draft.description} rows={2} maxLength={LIMITS.descriptionMax} onChange={(e) => update('description', e.target.value)} placeholder="What is it, and when should someone use it?" />
          </Field>
          <Field label="Tags (comma separated)" error={fieldErrors.tags}>
            <Input value={draft.tags} onChange={(e) => update('tags', e.target.value)} placeholder="purple, rounded, animated" />
          </Field>

          <div className="flex min-h-[360px] flex-col overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center gap-1 border-b border-border p-1.5" role="tablist" aria-label="Code">
              {(['html', 'css'] as const).map((tab) => (
                <button key={tab} role="tab" aria-selected={codeTab === tab} onClick={() => setCodeTab(tab)}
                  className={`rounded-md px-3 py-1 text-xs font-semibold uppercase ${codeTab === tab ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                  {tab}
                </button>
              ))}
              <span className="flex-1" />
              <span className="pr-2 text-xs text-muted-foreground">
                {(codeTab === 'html' ? draft.html : draft.css).length.toLocaleString('en-US')}/{(codeTab === 'html' ? LIMITS.htmlMax : LIMITS.cssMax).toLocaleString('en-US')}
              </span>
            </div>
            <textarea
              aria-label={`${codeTab.toUpperCase()} code`}
              data-testid={`editor-${codeTab}`}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              value={codeTab === 'html' ? draft.html : draft.css}
              maxLength={codeTab === 'html' ? LIMITS.htmlMax : LIMITS.cssMax}
              onChange={(e) => update(codeTab, e.target.value)}
              onKeyDown={(e) => handleTab(e, (value) => update(codeTab, value))}
              className="code-area min-h-[320px] flex-1 resize-y bg-background p-4 text-foreground outline-none"
            />
            {(fieldErrors.html || fieldErrors.css) && <p className="px-4 pb-2 text-xs text-destructive">{fieldErrors.html || fieldErrors.css}</p>}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <section aria-label="Live preview" className="flex min-h-[360px] flex-col overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
              <span>Live preview · {categoryLabel(draft.category)} · isolated (no scripts, no network)</span>
              <button className="hover:text-foreground" onClick={() => setPreviewDark((d) => !d)}>{previewDark ? 'Light' : 'Dark'} background</button>
            </div>
            <div className="min-h-[320px] flex-1">
              <PreviewFrame html={deferredHtml} css={deferredCss} dark={previewDark} title="Live preview" />
            </div>
          </section>
          <ReviewPanel
            componentId={componentId}
            dirty={dirty}
            onApplyDescription={(description) => update('description', description)}
            onApplyTags={(tags) => update('tags', tags.join(', '))}
            onSearchDocs={(query) => setDocsRequest({ query, nonce: Date.now() })}
          />
          <DocsPanel suggestedQuery={`accessible ${categoryLabel(draft.category).toLowerCase()} css`} requestedQuery={docsRequest} />
        </div>
      </div>
    </div>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      {children}
      {error && <span className="text-xs font-normal text-destructive" role="alert">{error}</span>}
    </label>
  )
}
