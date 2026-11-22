import type { CollectionSchema, RolePermissions } from 'deepspace/schema'

/**
 * Server-only bookkeeping. No client role can write, and only the app owner
 * (admin) can read, for support/debugging. Server actions write with RBAC off.
 */
const none: RolePermissions = { read: false, create: false, update: false, delete: false }
const ownerReadOnly: RolePermissions = { read: true, create: false, update: false, delete: false }

/**
 * One row per (subject, day, kind, slot). Reserving slot N succeeds at most
 * once because the Durable Object enforces `uniqueOn` serially, so a daily
 * quota of N can never be exceeded by concurrent requests.
 * subject is a user id, a recipient id, or '*' for the app-wide cap.
 */
export const usageSchema: CollectionSchema = {
  name: 'usage',
  columns: [
    { name: 'subject', storage: 'text', interpretation: 'plain', required: true, maxLength: 80 },
    { name: 'day', storage: 'text', interpretation: 'plain', required: true, maxLength: 10 },
    { name: 'kind', storage: 'text', interpretation: { kind: 'select', options: ['review', 'docs', 'email', 'feedback'] }, required: true },
    { name: 'slot', storage: 'number', interpretation: 'plain', required: true },
  ],
  uniqueOn: ['subject', 'day', 'kind', 'slot'],
  permissions: { '*': none, viewer: none, member: none, admin: ownerReadOnly },
}

/**
 * One public row ("library") whose `version` changes whenever published library
 * content changes. Browsers subscribe to it and refetch server-side search
 * results when it changes. No client can write it.
 */
export const libraryMetaSchema: CollectionSchema = {
  name: 'library_meta',
  columns: [{ name: 'version', storage: 'text', interpretation: 'plain', default: '', maxLength: 64 }],
  permissions: {
    '*': { read: true, create: false, update: false, delete: false },
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: false, update: false, delete: false },
    admin: { read: true, create: false, update: false, delete: false },
  },
}

/**
 * Email notification ledger. uniqueOn(feedbackId, attempt) is the
 * cross-request lock: only attempt 1 is ever claimed, so of any number of
 * concurrent submits/retries exactly one sends, at most once per feedback
 * item (see src/server/notify.ts).
 */
export const notificationsSchema: CollectionSchema = {
  name: 'notifications',
  columns: [
    { name: 'feedbackId', storage: 'text', interpretation: 'plain', required: true, maxLength: 64 },
    { name: 'recipientId', storage: 'text', interpretation: 'plain', required: true, maxLength: 80 },
    { name: 'attempt', storage: 'number', interpretation: 'plain', required: true },
    { name: 'status', storage: 'text', interpretation: { kind: 'select', options: ['pending', 'sent', 'failed', 'skipped'] }, default: 'pending' },
    { name: 'lastError', storage: 'text', interpretation: 'plain', default: '', maxLength: 300 },
  ],
  uniqueOn: ['feedbackId', 'attempt'],
  permissions: { '*': none, viewer: none, member: none, admin: ownerReadOnly },
}
