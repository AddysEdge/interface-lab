/**
 * Public component library (/home). Visitors and members see published
 * components only: the subscription is filtered by the Durable Object's
 * read rule before any record reaches the browser.
 *
 * Search, category, sort and page live in the URL (src/shared/listState.ts).
 * Matching runs locally over the live subscription, so results stay in sync
 * with new publications and no response can arrive out of order.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth, useQuery, useUser } from 'deepspace'
import { Boxes, Plus, RefreshCw, Search, SearchX } from 'lucide-react'
import { Button, EmptyState, useToast } from '@/components/ui'
import { ComponentCard, ComponentCardSkeleton } from '@/components/workshop/ComponentCard'
import { Pagination } from '@/components/workshop/Pagination'
import { CATEGORIES } from '@/shared/categories'
import { buildSearch, parseListState, PAGE_SIZE, selectPage, SORTS, withFilters, type Sort } from '@/shared/listState'
import type { ComponentData } from '@/shared/types'
import { callAction } from '@/lib/api'

const SORT_LABELS: Record<Sort, string> = { newest: 'Newest', feedback: 'Most feedback', title: 'A–Z' }

export default function LibraryPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const state = useMemo(() => parseListState(params), [params])
  const { records, status, error } = useQuery<ComponentData>('components', {
    where: { status: 'published' },
    orderBy: 'createdAt',
    orderDir: 'desc',
    limit: 500,
  })

  const items = useMemo(
    () => records.map((r) => ({ ...r.data, id: r.recordId, createdAt: r.createdAt })),
    [records],
  )
  const view = useMemo(() => selectPage(items, state), [items, state])

  // Keep the URL honest: a page past the end is replaced with the last real page.
  useEffect(() => {
    if (status === 'ready' && view.page !== state.page) {
      const search = buildSearch({ ...state, page: view.page })
      navigate({ search: search ? `?${search}` : '' }, { replace: true })
    }
  }, [status, view.page, state, navigate])

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

  const loading = status === 'loading'
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
            description={error ?? 'The live connection failed. It retries automatically; you can also reload.'}
            action={{ label: 'Reload', onClick: () => window.location.reload() }}
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
        description="Create the first one: write HTML and CSS, preview it, and publish when it is ready."
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
