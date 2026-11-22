// Tag search.
//
// Matching rules (documented in docs/SETUP.md):
// - Case-insensitive; the query is NFKC-normalized and lowercased.
// - Terms are separated by whitespace or commas. Every term must match (AND) and terms
//   match independently of each other and of tag order: "blue rounded" matches the tags
//   "rounded,animated,blue".
// - A term matches as a substring of the tag list, so "anim" matches "animated".
// - Only letters, numbers and . + # - are kept in a term. Everything else, including the
//   SQL LIKE wildcards % and _, the PostgREST wildcard *, backslashes and commas, is
//   dropped, so user input can never act as a wildcard or span two tags.
// - At most MAX_SEARCH_TERMS distinct terms of up to MAX_TERM_LENGTH characters are used.

export const MAX_SEARCH_TERMS = 5
export const MAX_TERM_LENGTH = 30

export function parseSearchTerms (query) {
	if (typeof query !== 'string') return []
	const terms = query
		.normalize('NFKC')
		.toLowerCase()
		.split(/[\s,]+/u)
		.map(term => term.replace(/[^\p{L}\p{N}.+#-]/gu, '').slice(0, MAX_TERM_LENGTH))
		.filter(Boolean)
	return [...new Set(terms)].slice(0, MAX_SEARCH_TERMS)
}

/** Escape LIKE metacharacters (backslash is PostgreSQL's default LIKE escape). */
export function escapeLikePattern (term) {
	return String(term).replace(/[\\%_]/g, '\\$&')
}

/** Add one case-insensitive substring filter per term; PostgREST ANDs repeated filters. */
export function applyTagSearch (query, terms) {
	let result = query
	for (const term of terms) result = result.ilike('tags', `%${escapeLikePattern(term)}%`)
	return result
}
