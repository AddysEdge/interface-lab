/**
 * Public component library (/home).
 *
 * Search, category, sort and page live in the URL (src/shared/listState.ts).
 * Results come one page at a time from the server (GET /api/library), which
 * searches every published component, so the library has no size cap and a
 * visitor downloads only the cards on screen. A tiny live record
 * (library_meta) changes whenever published content changes; the page
 * refetches when it does. Each request is tagged and aborted when superseded,
 * so an older response can never overwrite a newer one.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth, useQuery, useUser } from 'deepspace'
import { Boxes, Plus, RefreshCw, Search, SearchX } from 'lucide-react'
import { Button, EmptyState, useToast } from '@/components/ui'
import { ComponentCard, ComponentCardSkeleton } from '@/components/workshop/ComponentCard'
import { Pagination } from '@/components/workshop/Pagination'
import { CATEGORIES } from '@/shared/categories'
import { buildSearch, parseListState, PAGE_SIZE, SORTS, withFilters, type Sort } from '@/shared/listState'
import type { LibraryCard } from '@/server/library'
import { callAction } from '@/lib/api'

const SORT_LABELS: Record<Sort, string> = { newest: 'Newest', feedback: 'Most feedback', title: 'A–Z' }

export default function LibraryPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const state = useMemo(() => parseListState(params), [params])
  const search = buildSearch(state)
  const meta = useQuery<{ version: string }>('library_meta', { limit: 1 })
  const version = meta.records[0]?.data.version ?? ''
  const metaReady = meta.status !== 'loading'

  const [result, setResult] = useState<LibraryResult>({ status: 'loading', search: null, items: [], total: 0, pages: 0, page: 1 })
  const [reload, setReload] = useState(0)
  const latest = useRef(0)

  useEffect(() => {
    if (!metaReady) return
    const requestId = ++latest.current
    const controller = new AbortController()
    setResult((previous) => ({ ...previous, status: 'loading' }))
    const url = `/api/library?${search ? `${search}&` : ''}v=${encodeURIComponent(version)}`
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as
          | { success?: boolean; error?: string; data?: Pick<LibraryResult, 'items' | 'total' | 'pages' | 'page'> }
          | null
        if (requestId !== latest.current) return // a newer request superseded this one
        if (!response.ok || !body?.success) throw new Error(body?.error ?? `The library returned ${response.status}.`)
        const data = body.data ?? { items: [], total: 0, pages: 0, page: 1 }
        setResult({ status: 'ready', search, items: data.items, total: data.total, pages: data.pages, page: data.page })
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError' || requestId !== latest.current) return
        setResult((previous) => ({ ...previous, status: 'error', error: err.message }))
      })
    return () => controller.abort()
  }, [search, version, metaReady, reload])

  const view = result
  const status = result.status
  const error = result.error
  // Show skeletons for a new query; keep the current cards during a live refresh.
  const loading = status === 'loading' && result.search !== search

  // Keep the URL honest: a page past the end is replaced with the last real page.
  useEffect(() => {
    if (status === 'ready' && result.search === search && view.page !== state.page) {
      const next = buildSearch({ ...state, page: view.page })
      navigate({ search: next ? `?${next}` : '' }, { replace: true })
    }
  }, [status, result.search, search, view.page, state, navigate])

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const next = withFilters(state, {
      q: String(form.get('q') ?? ''),
      category: String(form.get('category') ?? ''),
      sort: String(form.get('sort') ?? 'newest') as Sort,
    })
    const search = buildSearch(next)
    navigate({ search: search ? `?${search}` : '' })
  }

  const filtered = Boolean(state.q || state.category)

  return (
    <div className="relative">
      <div className="bg-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 opacity-60" aria-hidden />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:py-12">
        <header className="flex flex-col gap-6 md:flex-row md:items-end">
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              <span className="text-gradient-brand">Component library</span>
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Browse community HTML/CSS components, preview them safely, copy the code, and leave feedback.
            </p>
          </div>
          <Link to="/studio/new" className="gradient-brand inline-flex h-10 items-center gap-2 self-start rounded-lg px-4 text-sm font-medium md:self-auto">
            <Plus className="size-4" aria-hidden /> Create component
          </Link>
        </header>

        <form
          key={`${state.q}|${state.category}|${state.sort}`}
          role="search"
          onSubmit={applyFilters}
          className="mt-8 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]"
        >
          <label className="relative">
            <span className="sr-only">Search components</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              name="q"
              type="search"
              defaultValue={state.q}
              maxLength={100}
              placeholder="Search titles and tags, e.g. purple rounded"
              className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <label>
            <span className="sr-only">Category</span>
            <select name="category" defaultValue={state.category} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Sort</span>
            <select name="sort" defaultValue={state.sort} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
              {SORTS.map((s) => (
                <option key={s} value={s}>{SORT_LABELS[s]}</option>
              ))}
            </select>
          </label>
          <Button type="submit">Apply</Button>
        </form>

        <p className="mt-4 text-sm text-muted-foreground" data-testid="results-summary" aria-live="polite">
          {loading
            ? 'Loading components…'
            : `${view.total} component${view.total === 1 ? '' : 's'}${view.pages > 1 ? ` · page ${view.page} of ${view.pages}` : ''}`}
        </p>

        {status === 'error' ? (
          <EmptyState
            icon={<RefreshCw />}
            title="Couldn’t load the library"
            description={error ?? 'The library could not be loaded.'}
            action={{ label: 'Try again', onClick: () => setReload((n) => n + 1) }}
          />
        ) : loading ? (
          <Grid>{Array.from({ length: PAGE_SIZE }, (_, i) => <ComponentCardSkeleton key={i} />)}</Grid>
        ) : view.total === 0 ? (
          filtered ? (
            <EmptyState
              icon={<SearchX />}
              title="No matching components"
              description="Every search word must match a title, description, category or tag. Try fewer words."
              action={{ label: 'Clear filters', onClick: () => navigate({ search: '' }) }}
            />
          ) : (
            <EmptyLibrary />
          )
        ) : (
          <Grid>
            {view.items.map((item) => (
              <ComponentCard key={item.id} id={item.id} data={item} />
            ))}
          </Grid>
        )}

        <Pagination state={state} pages={view.pages} page={view.page} />
      </div>
    </div>
  )
}

interface LibraryResult {
  status: 'loading' | 'ready' | 'error'
  /** The query string these results belong to (null before the first response). */
  search: string | null
  items: LibraryCard[]
  total: number
  pages: number
  page: number
  error?: string
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="results">
      {children}
    </div>
  )
}

function EmptyLibrary() {
  const { isSignedIn } = useAuth()
  const { user } = useUser()
  const { success, error } = useToast()
  const [seeding, setSeeding] = useState(false)
  const isOwner = isSignedIn && user?.role === 'admin'

  async function seed() {
    setSeeding(true)
    const result = await callAction<{ created: number }>('seedSamples', {})
    setSeeding(false)
    if (result.success) success('Sample library loaded', `${result.data.created} sample components published.`)
    else error('Could not load samples', result.error)
  }

  return (
    <div className="mt-4">
      <EmptyState
        icon={<Boxes />}
        title="No published components yet"
        description="Create the first one: write HTML, CSS and optional JavaScript, preview it, and publish when it is ready."
      />
      {isOwner && (
        <div className="-mt-8 flex justify-center">
          <Button variant="outline" onClick={seed} loading={seeding}>
            Load sample library (owner)
          </Button>
        </div>
      )}
    </div>
  )
}
