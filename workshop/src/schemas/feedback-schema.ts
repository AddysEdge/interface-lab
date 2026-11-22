import type { CollectionSchema, RolePermissions } from 'deepspace/schema'
import { LIMITS } from '../shared/limits'

/**
 * Feedback and replies on a component.
 *
 * Visibility mirrors the component: `componentStatus` is copied from the
 * component by the server and kept in sync when it is published/unpublished.
 * Read is 'published' (author OR componentStatus === 'published'), so feedback
 * on an unpublished component is hidden from everyone but its own author.
 *
 * Writes only through server actions (src/server/feedback.ts): authorship
 * comes from the verified caller (authorId is userBound + immutable), the
 * target component must be published, replies must target a top-level item on
 * the same component, and `uniqueOn` makes a retried submit idempotent.
 */
const readVisible: RolePermissions = { read: 'published', create: false, update: false, delete: false }

export const feedbackSchema: CollectionSchema = {
  name: 'feedback',
  columns: [
    { name: 'componentId', storage: 'text', interpretation: 'plain', required: true, immutable: true, maxLength: LIMITS.idMax },
    { name: 'parentId', storage: 'text', interpretation: 'plain', default: '', immutable: true, maxLength: LIMITS.idMax },
    { name: 'body', storage: 'text', interpretation: 'plain', required: true, maxLength: LIMITS.feedbackMax },
    { name: 'authorId', storage: 'text', interpretation: 'plain', userBound: true, immutable: true },
    { name: 'authorName', storage: 'text', interpretation: 'plain', default: '', maxLength: LIMITS.nameMax },
    {
      name: 'componentStatus',
      storage: 'text',
      interpretation: { kind: 'select', options: ['draft', 'published'] },
      default: 'published',
    },
    { name: 'clientRequestId', storage: 'text', interpretation: 'plain', required: true, immutable: true, maxLength: LIMITS.idMax },
  ],
  ownerField: 'authorId',
  visibilityField: { field: 'componentStatus', value: 'published' },
  uniqueOn: ['authorId', 'clientRequestId'],
  permissions: {
    '*': readVisible,
    viewer: readVisible,
    member: readVisible,
    admin: readVisible,
  },
}
