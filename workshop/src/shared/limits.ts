/**
 * Every bound in one place. The zod schemas (validation.ts) enforce these in
 * server actions, and the collection schemas repeat the text limits as
 * `maxLength` so the Durable Object rejects oversize writes too.
 */
export const LIMITS = {
  titleMax: 80,
  descriptionMax: 280,
  tagsMax: 8,
  tagMin: 2,
  tagMax: 24,
  htmlMax: 20_000,
  cssMax: 20_000,
  jsMax: 20_000,
  feedbackMax: 1_000,
  nameMax: 80,
  idMax: 64,
  docsQueryMax: 120,
  /** Components one user may own (drafts + published). */
  componentsPerUser: 50,
  /** Feedback posts per user per day. */
  feedbackPerUserPerDay: 60,
} as const

/** Daily quotas for billable integrations (per user, and app-wide). */
export const QUOTAS = {
  review: { perUser: 10, global: 150 },
  docs: { perUser: 25, global: 300 },
  email: { perRecipient: 20, global: 200 },
} as const

export type QuotaKind = keyof typeof QUOTAS
