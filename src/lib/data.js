// Server-side data access. Server actions (src/lib/actions.js) call these functions with:
//   client: a Supabase client that sends the caller's Clerk session token (RLS applies)
//   user:   { id, username, displayName, imageUrl } derived from Clerk on the server, or null
// Nothing here trusts identity, moderation state or counters supplied by the browser;
// the database enforces the same rules again (supabase/migrations).
//
// Every function resolves to { data, ... } on success or { error, code, details? } on failure.

import { categoryType, ELEMENT_CATEGORY_IDS, PAGE_SIZE, PROFILE_PAGE_SIZE } from './categories.js'
import { applyTagSearch, parseSearchTerms } from './search.js'
import {
	commentInputSchema,
	elementSubmissionSchema,
	idSchema,
	LIMITS,
	listElementsSchema,
	listUserElementsSchema,
	pageOnlySchema,
	validationDetails,
} from './validation.js'

export const ELEMENT_CARD_COLUMNS = 'id, created_at, element_id, use_tailwind, img_url, published, likes, user_id, username, user_avatar'
export const ELEMENT_FULL_COLUMNS = 'id, created_at, element_id, html, css, js, use_tailwind, tags, credits_name, credits_link, img_url, published, likes, user_id, username, user_avatar'
export const COMMENT_COLUMNS = 'id, created_at, element_id, parent_id, content, user_id, username, user, avatar, likes'

const MESSAGES = {
	UNAUTHENTICATED: 'You must be signed in to do that.',
	FORBIDDEN: 'You do not have permission to do that.',
	VALIDATION: 'The request is invalid.',
	CONFLICT: 'That already exists.',
	LIMIT: 'Limit reached.',
	NOT_FOUND: 'Not found.',
	DB: 'The database request failed.',
}

// PostgreSQL / PostgREST error codes -> application error codes.
const DB_ERROR_CODES = {
	'42501': 'FORBIDDEN', // insufficient_privilege, including RLS violations
	'23505': 'CONFLICT', // unique_violation
	'23514': 'VALIDATION', // check_violation
	'23503': 'VALIDATION', // foreign_key_violation
	'23502': 'VALIDATION', // not_null_violation
	'22001': 'VALIDATION', // string_data_right_truncation
	'54000': 'LIMIT', // program_limit_exceeded (pending submission limit trigger)
	PGRST301: 'UNAUTHENTICATED', // JWT rejected
	PGRST302: 'UNAUTHENTICATED',
}

export function failure (code, message = MESSAGES[code], details) {
	return details ? { error: message, code, details } : { error: message, code }
}

function invalid (zodError) {
	return failure('VALIDATION', MESSAGES.VALIDATION, validationDetails(zodError))
}

function dbFailure (operation, error) {
	const code = DB_ERROR_CODES[error?.code] ?? 'DB'
	console.error(`[data] ${operation} failed:`, error?.code, error?.message)
	const message = code === 'LIMIT' ? pendingLimitMessage() : MESSAGES[code]
	return failure(code, message)
}

function pendingLimitMessage () {
	return `You can have at most ${LIMITS.pendingElementsMax} components awaiting review. Wait for moderation or delete a pending component.`
}

function requireUser (user, message) {
	return user?.id ? null : failure('UNAUTHENTICATED', message ?? MESSAGES.UNAUTHENTICATED)
}

/**
 * Build the insert row from an allowlisted, validated submission plus
 * identity fields taken from the server-side Clerk user, never from input.
 * Moderation state (published) and counters (likes) are left to the database
 * defaults.
 */
export function toElementRow (submission, user) {
	return {
		user_id: user.id,
		username: user.username,
		user_avatar: user.imageUrl ?? null,
		element_id: submission.element_id,
		html: submission.html,
		css: submission.css,
		js: submission.js,
		use_tailwind: submission.use_tailwind,
		tags: submission.tags.join(','),
		credits_name: submission.credits_name ?? null,
		credits_link: submission.credits_link ?? null,
	}
}

// Elements =================================================================

export async function createElement ({ client, user, input }) {
	const unauthenticated = requireUser(user, 'Sign in to publish a component.')
	if (unauthenticated) return unauthenticated
	if (!user.username) return failure('VALIDATION', 'Choose a username in your profile before publishing.')

	const parsed = elementSubmissionSchema.safeParse(input)
	if (!parsed.success) return invalid(parsed.error)

	// Friendly early check; the database trigger enforces the same limit atomically.
	const pending = await client
		.from('elements')
		.select('id', { count: 'exact', head: true })
		.eq('user_id', user.id)
		.eq('published', false)
	if (pending.error) return dbFailure('count pending elements', pending.error)
	if ((pending.count ?? 0) >= LIMITS.pendingElementsMax) return failure('LIMIT', pendingLimitMessage())

	// Identity comes from Clerk on the server; published, likes and created_at are
	// never part of the payload, so the database defaults apply.
	const { data, error } = await client
		.from('elements')
		.insert(toElementRow(parsed.data, user))
		.select(ELEMENT_FULL_COLUMNS)
		.single()
	if (error) return dbFailure('insert element', error)
	return { data }
}

async function attachLikedByUser (client, user, rows) {
	if (!user?.id || rows.length === 0) return { data: rows.map(row => ({ ...row, likedByUser: false })) }
	const { data, error } = await client
		.from('elements_likes')
		.select('element_id')
		.eq('user_id', user.id)
		.in('element_id', rows.map(row => row.id))
	if (error) return dbFailure('load likes', error)
	const liked = new Set(data.map(like => like.element_id))
	return { data: rows.map(row => ({ ...row, likedByUser: liked.has(row.id) })) }
}

/**
 * Run a paginated query. A page past the end (PostgREST 416 / PGRST103) yields an
 * empty page plus the real total so the caller can move to the last page.
 */
async function fetchPage ({ build, countQuery, order, page, pageSize, operation }) {
	const from = (page - 1) * pageSize
	const { data, error, count } = await order(build()).range(from, from + pageSize - 1)
	if (error?.code === 'PGRST103') {
		const total = await countQuery()
		if (total.error) return dbFailure(operation, total.error)
		return { rows: [], totalCount: total.count ?? 0 }
	}
	if (error) return dbFailure(operation, error)
	return { rows: data ?? [], totalCount: count ?? 0 }
}

export async function listElements ({ client, user, params }) {
	const parsed = listElementsSchema.safeParse(params ?? {})
	if (!parsed.success) return invalid(parsed.error)
	const { elementId, page, query, sort, style } = parsed.data
	const type = categoryType(elementId)
	const pageSize = PAGE_SIZE[type]
	const columns = type === 'Atoms' ? `${ELEMENT_CARD_COLUMNS}, html, css` : ELEMENT_CARD_COLUMNS
	const terms = parseSearchTerms(query)

	const filter = selection => {
		let request = selection.eq('published', true).eq('element_id', elementId)
		request = applyTagSearch(request, terms)
		if (style !== 'all') request = request.eq('use_tailwind', style === 'tailwind')
		return request
	}

	const result = await fetchPage({
		build: () => filter(client.from('elements').select(columns, { count: 'exact' })),
		countQuery: () => filter(client.from('elements').select('id', { count: 'exact', head: true })),
		// id breaks ties so rows never repeat or vanish between pages.
		order: request => request.order(sort, { ascending: false }).order('id', { ascending: false }),
		page,
		pageSize,
		operation: 'list elements',
	})
	if (result.error) return result

	const withLikes = await attachLikedByUser(client, user, result.rows)
	if (withLikes.error) return withLikes
	return { data: withLikes.data, totalCount: result.totalCount, page, pageSize, terms }
}

export async function getElementDetail ({ client, user, id, elementId }) {
	const parsedId = idSchema.safeParse(id)
	if (!parsedId.success || !ELEMENT_CATEGORY_IDS.includes(elementId)) return { data: null }

	const { data, error } = await client
		.from('elements')
		.select(ELEMENT_FULL_COLUMNS)
		.eq('id', parsedId.data)
		.eq('element_id', elementId)
		.maybeSingle()
	if (error) return dbFailure('load element', error)
	if (!data) return { data: null }
	// RLS already hides other users' drafts; keep the rule explicit here as well.
	if (!data.published && data.user_id !== user?.id) return { data: null }

	if (!user?.id) return { data: { ...data, likedByUser: false } }
	const like = await client
		.from('elements_likes')
		.select('element_id')
		.eq('user_id', user.id)
		.eq('element_id', data.id)
		.maybeSingle()
	if (like.error) return dbFailure('load like status', like.error)
	return { data: { ...data, likedByUser: Boolean(like.data) } }
}

export async function listUserElements ({ client, user, userId, page }) {
	const parsed = listUserElementsSchema.safeParse({ userId, page: page ?? 1 })
	if (!parsed.success) return invalid(parsed.error)
	const isOwner = parsed.data.userId === user?.id

	const filter = selection => {
		const request = selection.eq('user_id', parsed.data.userId)
		return isOwner ? request : request.eq('published', true)
	}
	const result = await fetchPage({
		build: () => filter(client.from('elements').select(ELEMENT_FULL_COLUMNS, { count: 'exact' })),
		countQuery: () => filter(client.from('elements').select('id', { count: 'exact', head: true })),
		order: request => request.order('created_at', { ascending: false }).order('id', { ascending: false }),
		page: parsed.data.page,
		pageSize: PROFILE_PAGE_SIZE,
		operation: 'list user elements',
	})
	if (result.error) return result

	const withLikes = await attachLikedByUser(client, user, result.rows)
	if (withLikes.error) return withLikes
	return { data: withLikes.data, totalCount: result.totalCount, page: parsed.data.page, pageSize: PROFILE_PAGE_SIZE }
}

export async function deleteElement ({ client, user, id }) {
	const unauthenticated = requireUser(user)
	if (unauthenticated) return unauthenticated
	const parsedId = idSchema.safeParse(id)
	if (!parsedId.success) return invalid(parsedId.error)

	const { data, error } = await client
		.from('elements')
		.delete()
		.eq('id', parsedId.data)
		.eq('user_id', user.id)
		.select('id')
	if (error) return dbFailure('delete element', error)
	if (!data?.length) return failure('NOT_FOUND', 'Component not found.')
	return { data: { id: parsedId.data } }
}

// Likes ====================================================================

async function toggleLike ({ client, user, id, table, column, operation }) {
	const unauthenticated = requireUser(user)
	if (unauthenticated) return unauthenticated
	const parsedId = idSchema.safeParse(id)
	if (!parsedId.success) return invalid(parsedId.error)

	const existing = await client
		.from(table)
		.select(column)
		.eq('user_id', user.id)
		.eq(column, parsedId.data)
		.maybeSingle()
	if (existing.error) return dbFailure(`check ${operation}`, existing.error)

	if (existing.data) {
		const { error } = await client.from(table).delete().eq('user_id', user.id).eq(column, parsedId.data)
		if (error) return dbFailure(`remove ${operation}`, error)
		return { data: { liked: false } }
	}

	// user_id is the server-side Clerk id, never a client value.
	const { error } = await client.from(table).insert({ [column]: parsedId.data, user_id: user.id })
	// A concurrent duplicate hits the primary key; the like exists either way.
	if (error && error.code !== '23505') return dbFailure(`add ${operation}`, error)
	return { data: { liked: true } }
}

export function toggleElementLike ({ client, user, elementId }) {
	return toggleLike({ client, user, id: elementId, table: 'elements_likes', column: 'element_id', operation: 'element like' })
}

export function toggleCommentLike ({ client, user, commentId }) {
	return toggleLike({ client, user, id: commentId, table: 'comments_likes', column: 'comment_id', operation: 'comment like' })
}

export async function listUserLikes ({ client, user, page }) {
	const unauthenticated = requireUser(user)
	if (unauthenticated) return unauthenticated
	const parsed = pageOnlySchema.safeParse({ page: page ?? 1 })
	if (!parsed.success) return invalid(parsed.error)

	const build = () => client
		.from('elements_likes')
		.select(`created_at, elements (${ELEMENT_FULL_COLUMNS})`, { count: 'exact' })
		.eq('user_id', user.id)
	const result = await fetchPage({
		build,
		countQuery: () => client.from('elements_likes').select('element_id', { count: 'exact', head: true }).eq('user_id', user.id),
		order: request => request.order('created_at', { ascending: false }).order('element_id', { ascending: false }),
		page: parsed.data.page,
		pageSize: PROFILE_PAGE_SIZE,
		operation: 'list likes',
	})
	if (result.error) return result
	// A liked component that is no longer visible (e.g. deleted) embeds as null.
	const elements = result.rows.map(row => row.elements).filter(Boolean).map(row => ({ ...row, likedByUser: true }))
	return { data: elements, totalCount: result.totalCount, page: parsed.data.page, pageSize: PROFILE_PAGE_SIZE }
}

// Comments =================================================================

export async function listComments ({ client, elementId }) {
	const parsedId = idSchema.safeParse(elementId)
	if (!parsedId.success) return invalid(parsedId.error)
	const { data, error } = await client
		.from('comments')
		.select(COMMENT_COLUMNS)
		.eq('element_id', parsedId.data)
		.order('created_at', { ascending: false })
		.order('id', { ascending: false })
	if (error) return dbFailure('list comments', error)
	return { data: data ?? [] }
}

export async function createComment ({ client, user, input }) {
	const unauthenticated = requireUser(user, 'Sign in to comment.')
	if (unauthenticated) return unauthenticated
	if (!user.username) return failure('VALIDATION', 'Choose a username in your profile before commenting.')

	const parsed = commentInputSchema.safeParse(input)
	if (!parsed.success) return invalid(parsed.error)

	// Ownership is saved as user_id (what deleteComment matches on); display
	// fields come from the server-side Clerk profile.
	const { data, error } = await client
		.from('comments')
		.insert({
			content: parsed.data.comment,
			element_id: parsed.data.element_id,
			parent_id: parsed.data.parent_id,
			user_id: user.id,
			username: user.username,
			user: user.displayName ?? user.username,
			avatar: user.imageUrl ?? null,
		})
		.select(COMMENT_COLUMNS)
		.single()
	if (error) return dbFailure('insert comment', error)
	return { data }
}

export async function deleteComment ({ client, user, id }) {
	const unauthenticated = requireUser(user)
	if (unauthenticated) return unauthenticated
	const parsedId = idSchema.safeParse(id)
	if (!parsedId.success) return invalid(parsedId.error)

	const { data, error } = await client
		.from('comments')
		.delete()
		.eq('id', parsedId.data)
		.eq('user_id', user.id)
		.select('id')
	if (error) return dbFailure('delete comment', error)
	if (!data?.length) return failure('NOT_FOUND', 'Comment not found.')
	return { data: { id: parsedId.data } }
}
