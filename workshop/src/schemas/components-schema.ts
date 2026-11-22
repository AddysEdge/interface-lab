import type { CollectionSchema, RolePermissions } from 'deepspace/schema'
import { CATEGORY_IDS } from '../shared/categories'
import { LIMITS } from '../shared/limits'

/**
 * Components: the workshop's core records.
 *
 * Read: every role (including anonymous '*') gets 'published' = the owner, OR
 * any caller when status === 'published'. So visitors see published
 * components only and drafts are visible to their owner alone (the app
 * owner/admin included: no role can read someone else's draft).
 *
 * Write: no client role may create/update/delete directly. All writes go
 * through server actions (src/server/components.ts), which validate and
 * bound the input, check ownership, and keep authorName, feedbackCount,
 * isSample, publishedAt and moderation server-controlled.
 */
const readPublishedOnly: RolePermissions = { read: 'published', create: false, update: false, delete: false }

export const componentsSchema: CollectionSchema = {
  name: 'components',
  columns: [
    { name: 'title', storage: 'text', interpretation: 'plain', required: true, maxLength: LIMITS.titleMax },
    { name: 'description', storage: 'text', interpretation: 'plain', default: '', maxLength: LIMITS.descriptionMax },
    { name: 'category', storage: 'text', interpretation: { kind: 'select', options: [...CATEGORY_IDS] }, required: true },
    { name: 'tags', storage: 'text', interpretation: { kind: 'json' }, default: [] },
    { name: 'html', storage: 'text', interpretation: 'plain', default: '', maxLength: LIMITS.htmlMax },
    { name: 'css', storage: 'text', interpretation: 'plain', default: '', maxLength: LIMITS.cssMax },
    { name: 'js', storage: 'text', interpretation: 'plain', default: '', maxLength: LIMITS.jsMax },
    {
      name: 'status',
      storage: 'text',
      interpretation: { kind: 'select', options: ['draft', 'published'] },
      default: 'draft',
    },
    // Owner identity: bound to the writing user's id by the platform and never changed.
    { name: 'ownerId', storage: 'text', interpretation: 'plain', userBound: true, immutable: true },
    { name: 'authorName', storage: 'text', interpretation: 'plain', default: '', maxLength: LIMITS.nameMax },
    { name: 'isSample', storage: 'number', interpretation: { kind: 'boolean' }, default: false },
    { name: 'feedbackCount', storage: 'number', interpretation: 'plain', default: 0 },
    { name: 'publishedAt', storage: 'number', interpretation: 'plain', default: 0 },
    // App-owner moderation; a hidden component stays a draft and cannot be republished.
    { name: 'moderation', storage: 'text', interpretation: { kind: 'select', options: ['none', 'hidden'] }, default: 'none' },
  ],
  ownerField: 'ownerId',
  visibilityField: { field: 'status', value: 'published' },
  permissions: {
    '*': readPublishedOnly,
    viewer: readPublishedOnly,
    member: readPublishedOnly,
    admin: readPublishedOnly,
  },
}
