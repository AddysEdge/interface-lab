// URL state for the category listing pages: ?q=&style=&sort=&page=
// The URL is the single source of truth; components derive their state from it.

export const SORT_VALUES = Object.freeze(['likes', 'created_at'])
export const STYLE_VALUES = Object.freeze(['all', 'tailwind', 'no-tailwind'])
export const DEFAULT_LIST_STATE = Object.freeze({ q: '', style: 'all', sort: 'likes', page: 1 })
export const MAX_PAGE = 1000
export const SEARCH_QUERY_MAX = 100

/** Collapse whitespace and cap the length of a free-text search query. */
export function normalizeQuery (value) {
	if (typeof value !== 'string') return ''
	return value.replace(/\s+/g, ' ').trim().slice(0, SEARCH_QUERY_MAX).trim()
}

/** Return a page number in [1, MAX_PAGE]; anything malformed falls back to 1. */
export function parsePage (value) {
	const text = typeof value === 'number' ? String(value) : String(value ?? '').trim()
	if (!/^\d{1,4}$/.test(text)) return 1
	const page = Number(text)
	return page >= 1 && page <= MAX_PAGE ? page : 1
}

function pick (value, allowed, fallback) {
	return allowed.includes(value) ? value : fallback
}

/**
 * Parse listing state from URLSearchParams (or anything with get()).
 * Unknown or malformed values fall back to the defaults.
 */
export function parseListState (params) {
	const get = key => params?.get?.(key) ?? null
	return {
		q: normalizeQuery(get('q')),
		style: pick(get('style'), STYLE_VALUES, DEFAULT_LIST_STATE.style),
		sort: pick(get('sort'), SORT_VALUES, DEFAULT_LIST_STATE.sort),
		page: parsePage(get('page')),
	}
}

/** Serialize listing state to a query string, omitting defaults. */
export function buildListSearch ({ q = '', style = 'all', sort = 'likes', page = 1 } = {}) {
	const params = new URLSearchParams()
	const query = normalizeQuery(q)
	if (query) params.set('q', query)
	if (style !== DEFAULT_LIST_STATE.style && STYLE_VALUES.includes(style)) params.set('style', style)
	if (sort !== DEFAULT_LIST_STATE.sort && SORT_VALUES.includes(sort)) params.set('sort', sort)
	const safePage = parsePage(page)
	if (safePage > 1) params.set('page', String(safePage))
	return params.toString()
}

/** Href for a listing state relative to the current path ("?" alone clears all params). */
export function listHref (state) {
	return `?${buildListSearch(state)}`
}

/**
 * Apply a search/filter/sort change. Any change to q, style or sort returns to page 1
 * so the user never lands on a page that no longer exists for the new result set.
 */
export function applyFilterChange (current, changes) {
	const next = {
		q: normalizeQuery(changes.q ?? current.q),
		style: pick(changes.style ?? current.style, STYLE_VALUES, DEFAULT_LIST_STATE.style),
		sort: pick(changes.sort ?? current.sort, SORT_VALUES, DEFAULT_LIST_STATE.sort),
	}
	const filtersChanged = next.q !== current.q || next.style !== current.style || next.sort !== current.sort
	return { ...next, page: filtersChanged ? 1 : current.page }
}

export function totalPagesFor (totalCount, pageSize) {
	if (!Number.isFinite(totalCount) || totalCount <= 0 || !pageSize) return 0
	return Math.ceil(totalCount / pageSize)
}
