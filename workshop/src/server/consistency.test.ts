/**
 * Regression tests for two reviewed bugs (independent review, 2026-11-21):
 *
 * 1. Unpublishing could leave feedback publicly readable after a failed
 *    visibility write, and visibility sync / recount stopped at 1,000 items.
 * 2. Concurrent retries could send duplicate notification emails while an
 *    earlier send was still pending.
 *
 * Real action handlers + real schemas on the in-memory RecordRoom double;
 * failures and interleavings are injected deterministically. Public
 * readability is judged with the SDK's own canRead.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { canRead } from 'deepspace/worker'
import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { actions } from '../actions'
import { FakeRoom } from '../test/fakeRoom'
import { feedbackSchema } from '../schemas/feedback-schema'
import type { ComponentData } from '../shared/types'
import { MAX_ATTEMPTS, notifyComponentOwner, SEND_LEASE_MS, type NotificationOutcome } from './notify'

const ALICE = 'user_alice'
const BOB = 'user_bob'
const env = { APP_NAME: 'interfacelab', OWNER_USER_ID: 'user_owner' } as unknown as Env

let room: FakeRoom

function run(name: string, userId: string, params: Record<string, unknown>, tools: ActionTools = room.tools(userId)) {
  return (actions[name] as ActionHandler<Env>)({ userId, params, tools, env, callerJwt: 'jwt' }) as Promise<ActionResult<Record<string, unknown>>>
}

function componentStatus(id: string) {
  return (room.rows.get(`components:${id}`)?.data as unknown as ComponentData | undefined)?.status
}

/** Feedback rows a signed-out visitor could read, per the SDK's own RBAC check. */
function publiclyReadableFeedback(componentId: string) {
  return room.all('feedback').filter((row) => row.data.componentId === componentId && canRead(feedbackSchema, '*', row, ''))
}

/** The invariant: an unpublished (or deleted) component never has publicly readable feedback. */
function expectInvariant(componentId: string) {
  if (componentStatus(componentId) !== 'published') expect(publiclyReadableFeedback(componentId)).toEqual([])
}

async function publishedComponent(): Promise<string> {
  const saved = await run('saveComponent', ALICE, { title: 'Pill button', category: 'buttons', html: '<button>Go</button>' })
  if (!saved.success) throw new Error(saved.error)
  const id = saved.data.id as string
  const published = await run('setComponentStatus', ALICE, { id, status: 'published' })
  if (!published.success) throw new Error(published.error)
  return id
}

/** Seed feedback rows directly (bypassing per-user quotas) as other users would have posted them. */
function seedFeedback(componentId: string, count: number) {
  for (let i = 0; i < count; i++) {
    room.write(`user_${i % 50}`, 'feedback', { componentId, parentId: '', body: `#${i}`, authorName: 'Someone', componentStatus: 'published', clientRequestId: `seed-${i}` })
  }
}

/** Alice's tools with feedback updates failing after `okUpdates` successes (optionally only once). */
function toolsFailingFeedbackUpdates(okUpdates: number): ActionTools {
  const tools = room.tools(ALICE)
  const update = tools.update
  let calls = 0
  tools.update = async (collection, id, data) => {
    if (collection === 'feedback' && ++calls > okUpdates) return { success: false, error: 'simulated transient write failure' }
    return update(collection, id, data)
  }
  return tools
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => { resolve = r })
  return { promise, resolve }
}

beforeEach(() => {
  room = new FakeRoom()
  room.addUser(ALICE, { name: 'Alice', email: 'alice@example.com' })
  room.addUser(BOB, { name: 'Bob', email: 'bob@example.com' })
})

describe('unpublish never leaves feedback public', () => {
  it('a failed visibility write keeps the component published and nothing exposed (reviewer reproduction)', async () => {
    const id = await publishedComponent()
    seedFeedback(id, 5)
    const result = await run('setComponentStatus', ALICE, { id, status: 'draft' }, toolsFailingFeedbackUpdates(0))
    expect(result).toMatchObject({ success: false, code: 'visibility_incomplete' })
    expect(componentStatus(id)).toBe('published')
    expectInvariant(id)
  })

  it('a failure part-way through stays fail-closed, and retrying completes the unpublish', async () => {
    const id = await publishedComponent()
    seedFeedback(id, 10)
    const partial = await run('setComponentStatus', ALICE, { id, status: 'draft' }, toolsFailingFeedbackUpdates(4))
    expect(partial).toMatchObject({ success: false, code: 'visibility_incomplete' })
    expect(componentStatus(id)).toBe('published')
    expect(publiclyReadableFeedback(id)).toHaveLength(6) // 4 hidden early: less visible, never more

    expect(await run('setComponentStatus', ALICE, { id, status: 'draft' })).toMatchObject({ success: true })
    expect(componentStatus(id)).toBe('draft')
    expect(publiclyReadableFeedback(id)).toEqual([])
  })

  it('a failed status write leaves the component published with feedback hidden', async () => {
    const id = await publishedComponent()
    seedFeedback(id, 3)
    const tools = room.tools(ALICE)
    const update = tools.update
    tools.update = async (collection, recordId, data) =>
      collection === 'components' ? { success: false, error: 'simulated failure' } : update(collection, recordId, data)
    const result = await run('setComponentStatus', ALICE, { id, status: 'draft' }, tools)
    expect(result).toMatchObject({ success: false, code: 'visibility_incomplete' })
    expect(componentStatus(id)).toBe('published')
    expectInvariant(id)
  })

  it('handles more than 1,000 feedback items and keeps the count exact', async () => {
    const id = await publishedComponent()
    seedFeedback(id, 1_234)
    expect(await run('setComponentStatus', ALICE, { id, status: 'draft' })).toMatchObject({ success: true })
    expect(publiclyReadableFeedback(id)).toEqual([])

    expect(await run('setComponentStatus', ALICE, { id, status: 'published' })).toMatchObject({ success: true })
    expect(publiclyReadableFeedback(id)).toHaveLength(1_234)

    const posted = await run('createFeedback', BOB, { componentId: id, body: 'one more', clientRequestId: 'req-count-0001' })
    expect(posted.success).toBe(true)
    expect((room.rows.get(`components:${id}`)!.data as unknown as ComponentData).feedbackCount).toBe(1_235)
  })
})

describe('publish reveals feedback without exposing it early', () => {
  it('a failed reveal keeps feedback hidden; retrying reveals it and keeps publishedAt', async () => {
    const id = await publishedComponent()
    seedFeedback(id, 6)
    await run('setComponentStatus', ALICE, { id, status: 'draft' })
    const result = await run('setComponentStatus', ALICE, { id, status: 'published' }, toolsFailingFeedbackUpdates(2))
    expect(result).toMatchObject({ success: false, code: 'visibility_incomplete' })
    expect(componentStatus(id)).toBe('published')
    expect(publiclyReadableFeedback(id).length).toBeLessThan(6) // fail closed
    const publishedAt = (room.rows.get(`components:${id}`)!.data as unknown as ComponentData).publishedAt

    expect(await run('setComponentStatus', ALICE, { id, status: 'published' })).toMatchObject({ success: true })
    expect(publiclyReadableFeedback(id)).toHaveLength(6)
    expect((room.rows.get(`components:${id}`)!.data as unknown as ComponentData).publishedAt).toBe(publishedAt)
  })
})

describe('posting feedback while the component is being unpublished', () => {
  /** Bob's tools whose feedback create waits for `gate` (after the published check has passed). */
  function bobToolsWithGatedCreate(gate: Promise<void>, reached: () => void): ActionTools {
    const tools = room.tools(BOB)
    const create = tools.create
    tools.create = async (collection, data, recordId) => {
      if (collection === 'feedback') {
        reached()
        await gate
      }
      return create(collection, data, recordId)
    }
    return tools
  }

  it('a post written after the unpublish finished is withdrawn', async () => {
    const id = await publishedComponent()
    const gate = deferred()
    const reached = deferred()
    const post = run('createFeedback', BOB, { componentId: id, body: 'late', clientRequestId: 'req-race-0001' }, bobToolsWithGatedCreate(gate.promise, reached.resolve))
    await reached.promise // Bob passed the "is it published?" check
    expect(await run('setComponentStatus', ALICE, { id, status: 'draft' })).toMatchObject({ success: true })
    gate.resolve() // now Bob's write lands on an unpublished component
    expect(await post).toMatchObject({ success: false, code: 'not_found' })
    expect(componentStatus(id)).toBe('draft')
    expectInvariant(id)
    expect(room.all('feedback')).toHaveLength(0)
  })

  it('a post written between hiding and flipping is caught by the final pass', async () => {
    const id = await publishedComponent()
    seedFeedback(id, 2)
    const aliceTools = room.tools(ALICE)
    const update = aliceTools.update
    const flipping = deferred()
    const letFlip = deferred()
    aliceTools.update = async (collection, recordId, data) => {
      if (collection === 'components' && (data as { status?: string }).status === 'draft') {
        flipping.resolve()
        await letFlip.promise
      }
      return update(collection, recordId, data)
    }
    const unpublish = run('setComponentStatus', ALICE, { id, status: 'draft' }, aliceTools)
    await flipping.promise // feedback already hidden, component still published
    const posted = await run('createFeedback', BOB, { componentId: id, body: 'in the gap', clientRequestId: 'req-race-0002' })
    expect(posted.success).toBe(true) // the component really was published when Bob posted
    letFlip.resolve()
    expect(await unpublish).toMatchObject({ success: true })
    expect(componentStatus(id)).toBe('draft')
    expect(publiclyReadableFeedback(id)).toEqual([])
  })
})

describe('notification emails under concurrency', () => {
  const component = () => ({ id: 'c1', data: { ownerId: ALICE, title: 'Example' } as ComponentData, createdAt: '' })
  const feedback = { recordId: 'f1', componentId: 'c1', parentId: '', authorId: BOB, authorName: 'Bob', body: 'Hello', createdAt: '' }
  const emailCalls = () => room.integration.mock.calls.filter(([endpoint]) => endpoint === 'email/send').length

  beforeEach(() => {
    room.write(ALICE, 'preferences', { notifyOnFeedback: true })
  })

  it('five concurrent sends for one feedback item send exactly one email (reviewer reproduction)', async () => {
    const release = deferred()
    room.integration.mockImplementation(async () => {
      await release.promise
      return { success: true, data: {} }
    })
    const calls = Array.from({ length: 5 }, () => notifyComponentOwner(room.tools(BOB), env, { component: component(), feedback }))
    await new Promise((r) => setTimeout(r, 20))
    expect(emailCalls()).toBe(1) // while the first is still pending
    release.resolve()
    const outcomes = await Promise.all(calls)
    expect(outcomes.filter((o) => o === 'sent')).toHaveLength(1)
    expect(outcomes.filter((o) => o === 'in_progress')).toHaveLength(4)
    expect(await notifyComponentOwner(room.tools(BOB), env, { component: component(), feedback })).toBe('already_sent')
    expect(emailCalls()).toBe(1)
  })

  it('concurrent duplicate submits create one feedback item and one email', async () => {
    const id = await publishedComponent()
    room.integration.mockResolvedValue({ success: true, data: {} })
    const params = { componentId: id, body: 'double click', clientRequestId: 'req-double-01' }
    const results = await Promise.all([run('createFeedback', BOB, params), run('createFeedback', BOB, params), run('createFeedback', BOB, params)])
    expect(results.every((r) => r.success)).toBe(true)
    expect(room.all('feedback')).toHaveLength(1)
    expect(emailCalls()).toBe(1)
  })

  it('after a failed send, concurrent retries send exactly once more', async () => {
    room.integration.mockResolvedValueOnce({ success: false, error: 'provider down' })
    expect(await notifyComponentOwner(room.tools(BOB), env, { component: component(), feedback })).toBe('failed')
    const release = deferred()
    room.integration.mockImplementation(async () => {
      await release.promise
      return { success: true, data: {} }
    })
    const retries = Array.from({ length: 3 }, () => notifyComponentOwner(room.tools(BOB), env, { component: component(), feedback }))
    await new Promise((r) => setTimeout(r, 20))
    release.resolve()
    const outcomes: NotificationOutcome[] = await Promise.all(retries)
    expect(outcomes.filter((o) => o === 'sent')).toHaveLength(1)
    expect(emailCalls()).toBe(2) // 1 failed + 1 successful retry
  })

  it('a fresh pending attempt blocks retries; an expired lease allows one, marking the stale attempt failed', async () => {
    room.write(BOB, 'notifications', { feedbackId: 'f1', recipientId: ALICE, attempt: 1, status: 'pending', lastError: '' })
    room.integration.mockResolvedValue({ success: true, data: {} })
    expect(await notifyComponentOwner(room.tools(BOB), env, { component: component(), feedback })).toBe('in_progress')
    expect(emailCalls()).toBe(0)
    const later = Date.now() + SEND_LEASE_MS + 1_000
    expect(await notifyComponentOwner(room.tools(BOB), env, { component: component(), feedback }, { now: later })).toBe('sent')
    const ledger = room.all('notifications').map((r) => r.data).sort((a, b) => Number(a.attempt) - Number(b.attempt))
    expect(ledger).toMatchObject([{ attempt: 1, status: 'failed' }, { attempt: 2, status: 'sent' }])
  })

  it(`stops after ${MAX_ATTEMPTS} failed attempts`, async () => {
    room.integration.mockResolvedValue({ success: false, error: 'provider down' })
    for (let i = 0; i < MAX_ATTEMPTS; i++) expect(await notifyComponentOwner(room.tools(BOB), env, { component: component(), feedback })).toBe('failed')
    expect(await notifyComponentOwner(room.tools(BOB), env, { component: component(), feedback })).toBe('failed')
    expect(emailCalls()).toBe(MAX_ATTEMPTS)
  })
})
