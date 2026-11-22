/**
 * Collection Schemas
 *
 * All collections with columns and RBAC permissions.
 * Single source of truth — imported by both worker and frontend.
 *
 * Add schemas by creating a file in src/schemas/ and importing it here.
 */

import type { CollectionSchema } from 'deepspace/schema'
import { usersSchema } from './schemas/users-schema'
import { settingsSchema } from './schemas/admin-schema'
import { componentsSchema } from './schemas/components-schema'
import { feedbackSchema } from './schemas/feedback-schema'
import { preferencesSchema } from './schemas/preferences-schema'
import { notificationsSchema, usageSchema } from './schemas/server-only-schemas'

export const schemas: CollectionSchema[] = [
  usersSchema,
  settingsSchema,
  componentsSchema,
  feedbackSchema,
  preferencesSchema,
  usageSchema,
  notificationsSchema,
]
