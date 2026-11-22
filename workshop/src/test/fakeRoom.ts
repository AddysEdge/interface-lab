/**
 * In-memory stand-in for the app's RecordRoom, used by the offline action
 * tests. It applies the app's REAL collection schemas with the same write
 * rules the SDK's Durable Object applies to server-action writes (checked
 * against node_modules/deepspace/dist/worker.js, records write path):
 *   - defaults fill missing fields on create
 *   - userBound columns are stamped with the acting user on create, preserved on update
 *   - immutable columns refuse changes on update
 *   - required columns refuse empty values on create
 *   - text maxLength is enforced on create and on updated fields
 *   - uniqueOn refuses a second row with the same tuple ("Duplicate: ...")
 *   - query `where` is equality on columns, recordId or createdBy; `count` is the
 *     page length and `nextOffset` is returned when more rows exist (as the DO does)
 * Collection RBAC is NOT applied here because action tools run with RBAC off
 * (X-App-Action). Read permissions are tested separately with the SDK's own
 * canRead/canUpdate/... functions (src/schemas/permissions.test.ts), and the
 * live Durable Object is exercised by the Playwright suite (tests/).
 *
 * The external integration boundary (tools.integration) is a mock.
 */
import type { ActionResult, ActionTools } from 'deepspace/worker'
import type { CollectionSchema } from 'deepspace/schema'
import { vi } from 'vitest'
import { schemas } from '../schemas'

interface Row {
  recordId: string
  collection: string
  data: Record<string, unknown>
  createdBy: string
  createdAt: string
  updatedAt: string
}

export class FakeRoom {
  rows = new Map<string, Row>()
  private seq = 0
  // Starts at real time so createdAt-based ages (e.g. the email send lease) behave as in production.
  private clock = Date.now()
  readonly integration = vi.fn<(endpoint: string, data?: unknown) => Promise<ActionResult<unknown>>>(async () => ({
    success: true,
    data: {},
  }))

  constructor(private readonly schemaList: CollectionSchema[] = schemas) {}

  private schema(collection: string): CollectionSchema {
    const schema = this.schemaList.find((s) => s.name === collection)
    if (!schema) throw new Error(`unknown collection ${collection}`)
    return schema
  }

  private tick(): string {
    this.clock += 1
    return new Date(this.clock).toISOString()
  }

  /** Seed a platform users row (keyed by user id, as the SDK does). */
  addUser(userId: string, data: { name?: string; email?: string }) {
    const now = this.tick()
    this.rows.set(`users:${userId}`, { recordId: userId, collection: 'users', data: { ...data }, createdBy: userId, createdAt: now, updatedAt: now })
  }

  all(collection: string): Row[] {
    return [...this.rows.values()].filter((row) => row.collection === collection)
  }

  write(userId: string, collection: string, data: Record<string, unknown>, recordId?: string, updateOnly = false): ActionResult<{ recordId: string }> {
    const schema = this.schema(collection)
    const id = recordId ?? `rec${String(++this.seq).padStart(4, '0')}`
    const key = `${collection}:${id}`
    const existing = this.rows.get(key)
    if (updateOnly && !existing) return { success: false, error: `records.update: no record "${id}" in ${collection}` }
    const isUpdate = Boolean(existing)
    const merged: Record<string, unknown> = isUpdate ? { ...existing!.data, ...data } : { ...data }

    for (const col of schema.columns) {
      if (!isUpdate) {
        if (col.default !== undefined && merged[col.name] === undefined) merged[col.name] = col.default
        if (col.userBound) merged[col.name] = userId
        const value = merged[col.name]
        if (col.required && (value === undefined || value === null || value === '')) {
          return { success: false, error: `Required field '${col.name}' is missing` }
        }
      } else {
        if (col.immutable && data[col.name] !== undefined && data[col.name] !== existing!.data[col.name]) {
          return { success: false, error: `Cannot modify immutable field '${col.name}'` }
        }
        if (col.userBound && data[col.name] !== undefined) merged[col.name] = existing!.data[col.name]
      }
    }
    for (const col of schema.columns) {
      if (col.maxLength === undefined) continue
      if (isUpdate && !Object.hasOwn(data, col.name)) continue
      const value = merged[col.name]
      if (value !== undefined && value !== null && (typeof value !== 'string' || value.length > col.maxLength)) {
        return { success: false, error: `Field '${col.name}' must be text of at most ${col.maxLength} characters` }
      }
    }
    if (schema.uniqueOn?.length) {
      const clash = this.all(collection).find(
        (row) => row.recordId !== id && schema.uniqueOn!.every((field) => row.data[field] === merged[field]),
      )
      if (clash) {
        return { success: false, error: `Duplicate: a record with ${schema.uniqueOn.map((f) => `${f}=${String(merged[f])}`).join(', ')} already exists in ${collection}` }
      }
    }
    const now = this.tick()
    this.rows.set(key, {
      recordId: id,
      collection,
      data: merged,
      createdBy: existing?.createdBy ?? userId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
    return { success: true, data: { recordId: id } }
  }

  private matches(row: Row, where?: Record<string, unknown>): boolean {
    if (!where) return true
    return Object.entries(where).every(([field, value]) => {
      if (field === 'recordId') return row.recordId === value
      if (field === 'createdBy') return row.createdBy === value
      return row.data[field] === value
    })
  }

  /** ActionTools acting as `userId`, the shape src/server/action-routes.ts builds. */
  tools(userId: string): ActionTools {
    const envelope = (row: Row) => ({ ...row })
    return {
      create: async (collection, data, recordId) => this.write(userId, collection, data as Record<string, unknown>, recordId),
      update: async (collection, recordId, data) => this.write(userId, collection, data as Record<string, unknown>, recordId, true),
      remove: async (collection, recordId) => {
        const deleted = this.rows.delete(`${collection}:${recordId}`)
        return deleted ? { success: true, data: { recordId } } : { success: false, error: 'Record not found' }
      },
      deleteWhere: async (collection, where, limit = 100) => {
        const matched = this.all(collection).filter((row) => this.matches(row, where)).slice(0, Math.min(limit, 500))
        for (const row of matched) this.rows.delete(`${collection}:${row.recordId}`)
        return { success: true, data: { deleted: matched.length } }
      },
      get: async (collection, recordId) => {
        const row = this.rows.get(`${collection}:${recordId}`)
        return row ? ({ success: true, data: { record: envelope(row) } } as never) : { success: false, error: 'Record not found' }
      },
      query: async (collection, options) => {
        const offset = (options as { offset?: number } | undefined)?.offset ?? 0
        const limit = options?.limit ?? 50
        const matched = this.all(collection)
          .filter((row) => this.matches(row, options?.where))
          .sort((a, b) => (options?.orderDir === 'asc' ? 1 : -1) * a.createdAt.localeCompare(b.createdAt) || (a.recordId < b.recordId ? 1 : -1))
        const rows = matched.slice(offset, offset + limit)
        const more = matched.length > offset + rows.length
        return {
          success: true,
          data: { records: rows.map(envelope), count: rows.length, offset, ...(more ? { nextOffset: offset + rows.length } : {}) },
        } as never
      },
      integration: ((endpoint: string, data?: unknown) => this.integration(endpoint, data)) as ActionTools['integration'],
      registerUser: async () => ({ success: false, error: 'not used in tests' }),
    }
  }
}
