// Pure helpers for the optimistic comment list in src/components/Comments.jsx.

const TEMP_PREFIX = 'temp-'

/**
 * A collision-resistant temporary id for an optimistic comment. Persisted ids are
 * positive integers, so a "temp-" string can never collide with a saved comment.
 */
export function createTempId (cryptoImpl = globalThis.crypto) {
	if (typeof cryptoImpl?.randomUUID === 'function') return TEMP_PREFIX + cryptoImpl.randomUUID()
	// randomUUID needs a secure context; getRandomValues does not.
	const bytes = new Uint8Array(16)
	cryptoImpl.getRandomValues(bytes)
	return TEMP_PREFIX + Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export function isTempId (id) {
	return typeof id === 'string' && id.startsWith(TEMP_PREFIX)
}

export function addComment (comments, comment) {
	return [...comments, comment]
}

/** Swap an optimistic comment for the row the database returned. */
export function replaceComment (comments, tempId, persisted) {
	return comments.map(comment => (comment.id === tempId ? { ...persisted } : comment))
}

export function removeComment (comments, id) {
	return comments.filter(comment => comment.id !== id)
}

/** Put a comment back after a failed delete without discarding other changes. */
export function restoreComment (comments, comment) {
	if (comments.some(existing => existing.id === comment.id)) return comments
	return [...comments, comment]
}

export function canDeleteComment (comment, userId) {
	return Boolean(userId) && !isTempId(comment.id) && comment.user_id === userId
}

export function canReplyTo (comment) {
	return !comment.parent_id && !isTempId(comment.id) && !comment.deleted
}
