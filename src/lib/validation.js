// Validation schemas shared by the browser forms and the server actions.
// The server never trusts the browser copy: every server action re-parses its input here.
// The database enforces the same limits with constraints (supabase/migrations).

import { z } from 'zod'
import { ELEMENT_CATEGORY_IDS } from './categories.js'
import { MAX_PAGE, SORT_VALUES, STYLE_VALUES } from './listState.js'

export const LIMITS = Object.freeze({
	htmlMax: 50000,
	cssMax: 50000,
	jsMax: 20000,
	tagsMin: 2,
	tagsMax: 10,
	tagMin: 2,
	tagMax: 15,
	creditsNameMin: 3,
	creditsNameMax: 20,
	creditsLinkMax: 120,
	commentMax: 1000,
	// Components awaiting moderation per user (also enforced by a database trigger).
	pendingElementsMax: 10,
	searchQueryMax: 200,
	maxPage: MAX_PAGE,
})

// Letters, numbers, spaces and . + # - ; no commas (tags are stored comma-separated)
// and no LIKE/PostgREST wildcards.
export const TAG_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .+#-]*$/u
const HOSTNAME_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i
const CONTROL_CHARACTERS = /\p{Cc}/u

export function normalizeTag (value) {
	return String(value).normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}

const blankToUndefined = value => (value == null || (typeof value === 'string' && value.trim() === '') ? undefined : value)

const tagSchema = z.string()
	.transform(normalizeTag)
	.pipe(z.string()
		.min(LIMITS.tagMin, { error: `Tags need at least ${LIMITS.tagMin} characters` })
		.max(LIMITS.tagMax, { error: `Maximum ${LIMITS.tagMax} characters per tag` })
		.regex(TAG_PATTERN, { error: 'Tags may only contain letters, numbers, spaces and . + # -' }))

export const tagsSchema = z.array(tagSchema, { error: `Enter at least ${LIMITS.tagsMin} tags` })
	.max(LIMITS.tagsMax, { error: `Maximum ${LIMITS.tagsMax} tags` })
	.transform(tags => [...new Set(tags)])
	.pipe(z.array(z.string()).min(LIMITS.tagsMin, { error: `Enter at least ${LIMITS.tagsMin} different tags` }))

const creditsNameSchema = z.preprocess(blankToUndefined, z.string()
	.trim()
	.min(LIMITS.creditsNameMin, { error: `Enter a name with at least ${LIMITS.creditsNameMin} characters` })
	.max(LIMITS.creditsNameMax, { error: `Maximum ${LIMITS.creditsNameMax} characters` })
	.refine(value => !CONTROL_CHARACTERS.test(value), { error: 'Invalid characters' })
	.optional())

const creditsLinkSchema = z.preprocess(blankToUndefined, z.string()
	.trim()
	.max(LIMITS.creditsLinkMax, { error: `Maximum ${LIMITS.creditsLinkMax} characters` })
	.pipe(z.url({ protocol: /^https?$/, hostname: HOSTNAME_PATTERN, error: 'Enter a valid http(s) link' }))
	.optional())

function creditsArePaired (data, ctx) {
	if (data.credits_link && !data.credits_name) {
		ctx.addIssue({ code: 'custom', path: ['credits_name'], message: 'Add a name for the credited link' })
	}
	if (data.credits_name && !data.credits_link) {
		ctx.addIssue({ code: 'custom', path: ['credits_link'], message: 'Add a link for the credited name' })
	}
}

const metaShape = {
	credits_name: creditsNameSchema,
	credits_link: creditsLinkSchema,
	tags: tagsSchema,
}

/** The publish dialog's fields (credits and tags). */
export const elementMetaSchema = z.object(metaShape).superRefine(creditsArePaired)

/**
 * A complete component submission. Strict: any field outside this allowlist
 * (published, likes, user_id, username, img_url, ...) rejects the whole submission.
 */
export const elementSubmissionSchema = z.strictObject({
	element_id: z.enum(ELEMENT_CATEGORY_IDS, { error: 'Choose a valid component category' }),
	html: z.string()
		.max(LIMITS.htmlMax, { error: `HTML is limited to ${LIMITS.htmlMax} characters` })
		.refine(value => value.trim().length > 0, { error: 'HTML is required' }),
	css: z.string().max(LIMITS.cssMax, { error: `CSS is limited to ${LIMITS.cssMax} characters` }).default(''),
	js: z.string().max(LIMITS.jsMax, { error: `JavaScript is limited to ${LIMITS.jsMax} characters` }).default(''),
	use_tailwind: z.boolean(),
	...metaShape,
}).superRefine(creditsArePaired)

/** Positive integer database id, as a number or a decimal string. */
export const idSchema = z.union([
	z.number(),
	z.string().regex(/^[1-9]\d{0,15}$/).transform(Number),
]).pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER))

export const commentInputSchema = z.strictObject({
	comment: z.string()
		.trim()
		.min(1, { error: 'Write a comment first' })
		.max(LIMITS.commentMax, { error: `Comments are limited to ${LIMITS.commentMax} characters` }),
	element_id: idSchema,
	parent_id: idSchema.nullish().transform(value => value ?? null),
})

export const pageSchema = z.union([
	z.number(),
	z.string().regex(/^\d{1,6}$/).transform(Number),
]).pipe(z.number().int().min(1).max(LIMITS.maxPage))

export const listElementsSchema = z.object({
	elementId: z.enum(ELEMENT_CATEGORY_IDS),
	page: pageSchema.default(1),
	query: z.string().max(LIMITS.searchQueryMax).default(''),
	sort: z.enum(SORT_VALUES).default('likes'),
	style: z.enum(STYLE_VALUES).default('all'),
})

// Clerk user ids look like user_2abc...; anything else is rejected before querying.
export const userIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)

export const listUserElementsSchema = z.object({
	userId: userIdSchema,
	page: pageSchema.default(1),
})

export const pageOnlySchema = z.object({ page: pageSchema.default(1) })

export function validationDetails (error) {
	return z.flattenError(error).fieldErrors
}
