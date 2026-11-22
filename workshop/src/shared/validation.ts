/**
 * Input schemas for every server action. The browser uses the same schemas
 * for inline form errors, but the server never trusts the browser copy: each
 * action re-parses its params here. Unknown keys are rejected (strictObject),
 * so a caller cannot smuggle ownerId, status, feedbackCount, isSample, etc.
 */
import { z } from 'zod'
import { CATEGORY_IDS } from './categories'
import { LIMITS } from './limits'

// C0 controls and DEL, except tab (\u0009), newline (\u000A) and carriage return (\u000D).
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/

/**
 * Normalise free text: NFC, trimmed, no control characters except newlines/tabs.
 * `singleLine` also collapses all whitespace (titles end up in email subjects).
 */
function text(max: number, label: string, { singleLine = false } = {}) {
  return z
    .string({ error: `${label} must be text` })
    .transform((v) => {
      const normalized = v.normalize('NFC').trim()
      return singleLine ? normalized.replace(/\s+/g, ' ') : normalized
    })
    .pipe(
      z
        .string()
        .max(max, { error: `${label} is limited to ${max} characters` })
        .refine((v) => !CONTROL_CHARS.test(v), { error: `${label} contains invalid characters` }),
    )
}

export function normalizeTag(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}

export const TAG_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .+#-]*$/u

const tagSchema = z
  .string()
  .transform(normalizeTag)
  .pipe(
    z
      .string()
      .min(LIMITS.tagMin, { error: `Tags need at least ${LIMITS.tagMin} characters` })
      .max(LIMITS.tagMax, { error: `Tags are limited to ${LIMITS.tagMax} characters` })
      .regex(TAG_PATTERN, { error: 'Tags may contain letters, numbers, spaces and . + # -' }),
  )

export const tagsSchema = z
  .array(tagSchema)
  .max(LIMITS.tagsMax, { error: `At most ${LIMITS.tagsMax} tags` })
  .transform((tags) => [...new Set(tags)])

/** Opaque record ids minted by the platform (ULID-like). */
export const recordIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, { error: 'Invalid id' })

/** Code is stored as typed; only length and control characters are checked. */
function code(max: number, label: string) {
  return z
    .string({ error: `${label} must be text` })
    .max(max, { error: `${label} is limited to ${max.toLocaleString('en-US')} characters` })
    .refine((v) => !/\u0000/.test(v), { error: `${label} contains invalid characters` })
}

export const componentInputSchema = z.strictObject({
  id: recordIdSchema.optional(),
  title: text(LIMITS.titleMax, 'Title', { singleLine: true }).pipe(z.string().min(1, { error: 'Add a title' })),
  description: text(LIMITS.descriptionMax, 'Description').default(''),
  category: z.enum(CATEGORY_IDS, { error: 'Choose a category' }),
  tags: tagsSchema.default([]),
  html: code(LIMITS.htmlMax, 'HTML'),
  css: code(LIMITS.cssMax, 'CSS').default(''),
})
export type ComponentInput = z.output<typeof componentInputSchema>

/** Extra requirements before a component can be published. */
export function publishProblems(input: { title: string; html: string }): string[] {
  const problems: string[] = []
  if (input.title.trim().length < 3) problems.push('Add a title of at least 3 characters.')
  if (input.html.trim().length === 0) problems.push('Add some HTML.')
  return problems
}

export const statusInputSchema = z.strictObject({
  id: recordIdSchema,
  status: z.enum(['draft', 'published']),
})

export const idInputSchema = z.strictObject({ id: recordIdSchema })

export const feedbackInputSchema = z.strictObject({
  componentId: recordIdSchema,
  parentId: recordIdSchema.nullish().transform((v) => v ?? ''),
  body: text(LIMITS.feedbackMax, 'Feedback').pipe(z.string().min(1, { error: 'Write some feedback first' })),
  /** Client-generated idempotency key: a retried submit returns the first result. */
  clientRequestId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/, { error: 'Invalid request id' }),
})

export const docsQuerySchema = z.strictObject({
  query: text(LIMITS.docsQueryMax, 'Search', { singleLine: true }).pipe(z.string().min(2, { error: 'Search for at least 2 characters' })),
})

/** First issue as a sentence for toasts, plus per-field messages for forms. */
export function describeIssues(error: z.ZodError): { message: string; fields: Record<string, string> } {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.length ? String(issue.path[0]) : '_'
    if (!fields[key]) fields[key] = issue.message
  }
  const first = error.issues[0]
  const message = first?.code === 'unrecognized_keys' ? `Unexpected field: ${first.keys.join(', ')}` : first?.message ?? 'Invalid input'
  return { message, fields }
}
