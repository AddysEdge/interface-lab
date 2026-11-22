/**
 * Library search (ported from InterfaceLab's tag search fix).
 *
 * - Case-insensitive; the query and the searchable text are NFKC-normalised.
 * - Terms are split on whitespace/commas. EVERY term must match (AND), each
 *   independently and in any order: "blue rounded" matches tags
 *   ["rounded", "animated", "blue"].
 * - A term matches as a substring of the title, description, category or any
 *   tag ("anim" matches "animated").
 * - Only letters, numbers and . + # - survive in a term; everything else is
 *   dropped, so there are no wildcard semantics to escape.
 *
 * Matching runs in the browser over the live, permission-filtered
 * subscription of published components, so results update in real time and
 * there is no request that could resolve out of order.
 */

export const MAX_SEARCH_TERMS = 6
export const MAX_TERM_LENGTH = 32

export function parseSearchTerms(query: unknown): string[] {
  if (typeof query !== 'string') return []
  const terms = query
    .normalize('NFKC')
    .toLowerCase()
    .split(/[\s,]+/u)
    .map((term) => term.replace(/[^\p{L}\p{N}.+#-]/gu, '').slice(0, MAX_TERM_LENGTH))
    .filter(Boolean)
  return [...new Set(terms)].slice(0, MAX_SEARCH_TERMS)
}

export interface Searchable {
  title?: string
  description?: string
  category?: string
  tags?: string[]
}

function haystack(item: Searchable): string[] {
  return [item.title ?? '', item.description ?? '', item.category ?? '', ...(item.tags ?? [])].map((part) =>
    part.normalize('NFKC').toLowerCase(),
  )
}

export function matchesAllTerms(item: Searchable, terms: string[]): boolean {
  if (terms.length === 0) return true
  const fields = haystack(item)
  return terms.every((term) => fields.some((field) => field.includes(term)))
}
