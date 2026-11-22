/**
 * Collection permissions, evaluated with the SDK's own RBAC functions (the
 * same canRead/canUpdate/... the Durable Object calls), so these tests check
 * the real rules for each role and identity rather than a re-implementation.
 */
import { describe, expect, it } from 'vitest'
import { canCreate, canDelete, canRead, canUpdate, checkFieldPermissions, lintSchemas } from 'deepspace/worker'
import { schemas } from '../schemas'
import { componentsSchema } from './components-schema'
import { feedbackSchema } from './feedback-schema'
import { preferencesSchema } from './preferences-schema'
import { notificationsSchema, usageSchema } from './server-only-schemas'

const ALICE = 'user_alice'
const BOB = 'user_bob'
const ANON = 'anon-xyz'
// '*' is used for unauthenticated callers; anonymous sockets resolve to 'viewer'.
const ROLES = ['*', 'viewer', 'member', 'admin'] as const

const draft = { recordId: 'c1', createdBy: ALICE, data: { status: 'draft', ownerId: ALICE } }
const published = { recordId: 'c2', createdBy: ALICE, data: { status: 'published', ownerId: ALICE } }

describe('components', () => {
  it('anyone, including signed-out visitors, reads published components', () => {
    for (const role of ROLES) expect(canRead(componentsSchema, role, published, role === '*' ? '' : ANON)).toBe(true)
    expect(canRead(componentsSchema, 'member', published, BOB)).toBe(true)
  })

  it('a draft is readable by its owner only; not other members, visitors, or the app admin', () => {
    expect(canRead(componentsSchema, 'member', draft, ALICE)).toBe(true)
    expect(canRead(componentsSchema, 'member', draft, BOB)).toBe(false)
    expect(canRead(componentsSchema, 'viewer', draft, ANON)).toBe(false)
    expect(canRead(componentsSchema, '*', draft, '')).toBe(false)
    expect(canRead(componentsSchema, 'admin', draft, 'user_owner')).toBe(false)
  })

  it('no role can write components directly (writes go through validated server actions)', () => {
    for (const role of ROLES) {
      expect(canCreate(componentsSchema, role)).toBe(false)
      expect(canUpdate(componentsSchema, role, published, ALICE)).toBe(false)
      expect(canDelete(componentsSchema, role, published, ALICE)).toBe(false)
    }
  })

  it('owner identity is bound and immutable', () => {
    const owner = componentsSchema.columns.find((c) => c.name === 'ownerId')!
    expect(owner).toMatchObject({ userBound: true, immutable: true })
    expect(componentsSchema.ownerField).toBe('ownerId')
  })
})

describe('feedback', () => {
  const visible = { recordId: 'f1', createdBy: BOB, data: { authorId: BOB, componentStatus: 'published' } }
  const hidden = { recordId: 'f2', createdBy: BOB, data: { authorId: BOB, componentStatus: 'draft' } }

  it('is public while its component is published, author-only otherwise', () => {
    expect(canRead(feedbackSchema, '*', visible, '')).toBe(true)
    expect(canRead(feedbackSchema, 'member', hidden, BOB)).toBe(true)
    expect(canRead(feedbackSchema, 'member', hidden, ALICE)).toBe(false)
    expect(canRead(feedbackSchema, '*', hidden, '')).toBe(false)
  })

  it('cannot be written directly by any role', () => {
    for (const role of ROLES) {
      expect(canCreate(feedbackSchema, role)).toBe(false)
      expect(canUpdate(feedbackSchema, role, visible, BOB)).toBe(false)
      expect(canDelete(feedbackSchema, role, visible, BOB)).toBe(false)
    }
  })

  it('binds authorship and makes submits idempotent', () => {
    expect(feedbackSchema.columns.find((c) => c.name === 'authorId')).toMatchObject({ userBound: true, immutable: true })
    expect(feedbackSchema.uniqueOn).toEqual(['authorId', 'clientRequestId'])
  })
})

describe('preferences', () => {
  const alicePref = { recordId: 'p1', createdBy: ALICE, data: { userId: ALICE, notifyOnFeedback: true } }

  it('members manage only their own preference row', () => {
    expect(canCreate(preferencesSchema, 'member')).toBe(true)
    expect(canRead(preferencesSchema, 'member', alicePref, ALICE)).toBe(true)
    expect(canRead(preferencesSchema, 'member', alicePref, BOB)).toBe(false)
    expect(canUpdate(preferencesSchema, 'member', alicePref, BOB)).toBe(false)
    expect(canDelete(preferencesSchema, 'member', alicePref, BOB)).toBe(false)
  })

  it('signed-out visitors get nothing', () => {
    for (const role of ['*', 'viewer']) {
      expect(canCreate(preferencesSchema, role)).toBe(false)
      expect(canRead(preferencesSchema, role, alicePref, ANON)).toBe(false)
    }
  })

  it('only the toggle is writable from the browser', () => {
    expect(checkFieldPermissions(preferencesSchema, 'member', { notifyOnFeedback: true })).toBeNull()
    expect(checkFieldPermissions(preferencesSchema, 'member', { userId: BOB })).not.toBeNull()
    expect(preferencesSchema.uniqueOn).toEqual(['userId'])
  })
})

describe('server-only bookkeeping', () => {
  it('usage and notifications are invisible to members and visitors, read-only for the admin', () => {
    const row = { recordId: 'u1', createdBy: BOB, data: {} }
    for (const schema of [usageSchema, notificationsSchema]) {
      for (const role of ['*', 'viewer', 'member']) {
        expect(canRead(schema, role, row, BOB)).toBe(false)
        expect(canCreate(schema, role)).toBe(false)
      }
      expect(canRead(schema, 'admin', row, 'user_owner')).toBe(true)
      expect(canCreate(schema, 'admin')).toBe(false)
    }
  })
})

describe('schema lint', () => {
  it('the SDK schema linter reports no foot-guns for the app collections', () => {
    const appSchemas = schemas.filter((s) => !['users', 'settings'].includes(s.name))
    expect(lintSchemas(appSchemas)).toEqual([])
  })
})
