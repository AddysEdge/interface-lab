import type { CollectionSchema, RolePermissions } from 'deepspace/schema'

/**
 * Per-user notification preference. This is the one collection the browser
 * writes directly: the platform binds `userId` to the caller, `uniqueOn`
 * allows one row per user, `writableFields` limits writes to the toggle, and
 * reads/updates are own-only. Signed-out callers get nothing.
 */
const none: RolePermissions = { read: false, create: false, update: false, delete: false }
const ownOnly: RolePermissions = {
  read: 'own',
  create: true,
  update: 'own',
  delete: 'own',
  writableFields: ['notifyOnFeedback'],
}

export const preferencesSchema: CollectionSchema = {
  name: 'preferences',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', userBound: true, immutable: true },
    { name: 'notifyOnFeedback', storage: 'number', interpretation: { kind: 'boolean' }, default: false },
  ],
  ownerField: 'userId',
  uniqueOn: ['userId'],
  permissions: {
    '*': none,
    viewer: none,
    member: ownOnly,
    admin: ownOnly,
  },
}
