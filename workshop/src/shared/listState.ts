/**
 * URL state for the library: ?q=&category=&sort=&page=
 *
 * The URL is the single source of truth. Refresh, back/forward and shared
 * links re-derive the same view; malformed values fall back to defaults.
 * (Ported from the InterfaceLab pagination fix: filters survive pagination,
 * and any search/filter/sort change returns to page 1.)
 */
import { CATEGORY_IDS } from './categories'
import { matchesAllTerms, parseSearchTerms, type Searchable } from './search'

export const SORTS = ['newest', 'feedback', 'title'] as const
export type Sort = (typeof SORTS)[number]

export const PAGE_SIZE = 12
export const MAX_PAGE = 500
export const QUERY_MAX = 100

export interface ListState {
  q: string
  category: string // '' = all
  sort: Sort
  page: number
}

export const DEFAULT_STATE: ListState = { q: '', category: '', sort: 'newest', page: 1 }

export function normalizeQuery(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, QUERY_MAX).trim()
}

export function parsePage(value: unknown): number {
  const text = String(value ?? '').trim()
  if (!/^\d{1,4}$/.test(text)) return 1
  const page = Number(text)
  return page >= 1 && page <= MAX_PAGE ? page : 1
}

interface ParamsLike {
  get(key: string): string | null
}

export function parseListState(params: ParamsLike): ListState {
  const category = params.get('category') ?? ''
  const sort = params.get('sort') ?? ''
  return {
    q: normalizeQuery(params.get('q')),
    category: (CATEGORY_IDS as readonly string[]).includes(category) ? category : '',
    sort: (SORTS as readonly string[]).includes(sort) ? (sort as Sort) : 'newest',
    page: parsePage(params.get('page')),
  }
}

/** Query string for a state, omitting defaults ('' when everything is default). */
export function buildSearch(state: Partial<ListState>): string {
  const params = new URLSearchParams()
  const q = normalizeQuery(state.q)
  if (q) params.set('q', q)
  if (state.category && (CATEGORY_IDS as readonly string[]).includes(state.category)) params.set('category', state.category)
  if (state.sort && state.sort !== 'newest' && (SORTS as readonly string[]).includes(state.sort)) params.set('sort', state.sort)
  const page = parsePage(state.page ?? 1)
  if (page > 1) params.set('page', String(page))
  return params.toString()
}

/** Apply a search/filter/sort change; any change resets to page 1. */
export function withFilters(current: ListState, changes: Partial<Omit<ListState, 'page'>>): ListState {
  const next = parseListState(new URLSearchParams(buildSearch({ ...current, ...changes, page: 1 })))
  const changed = next.q !== current.q || next.category !== current.category || next.sort !== current.sort
  return { ...next, page: changed ? 1 : current.page }
}

export function totalPages(count: number): number {
  return count > 0 ? Math.ceil(count / PAGE_SIZE) : 0
}

export interface ListableComponent extends Searchable {
  createdAt: string
  publishedAt?: number
  feedbackCount?: number
}

/** Filter, sort and paginate. Pure, so the same URL always yields the same page. */
export function selectPage<T extends ListableComponent>(items: T[], state: ListState) {
  const terms = parseSearchTerms(state.q)
  const filtered = items.filter(
    (item) => (!state.category || item.category === state.category) && matchesAllTerms(item, terms),
  )
  const time = (item: T) => item.publishedAt || Date.parse(item.createdAt) || 0
  const sorted = [...filtered].sort((a, b) => {
    if (state.sort === 'title') return (a.title ?? '').localeCompare(b.title ?? '')
    if (state.sort === 'feedback') return (b.feedbackCount ?? 0) - (a.feedbackCount ?? 0) || time(b) - time(a)
    return time(b) - time(a)
  })
  const pages = totalPages(sorted.length)
  // A page past the end (stale link, items removed) shows the last real page.
  const page = Math.min(state.page, Math.max(1, pages))
  const start = (page - 1) * PAGE_SIZE
  return { items: sorted.slice(start, start + PAGE_SIZE), total: sorted.length, pages, page, terms }
}
