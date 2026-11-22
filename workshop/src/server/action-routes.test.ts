import { describe, expect, it } from 'vitest'
import { keepRunning } from './action-routes'

describe('keepRunning', () => {
  it('registers the running action with waitUntil so a client disconnect cannot cut it short', async () => {
    const registered: Promise<unknown>[] = []
    const running = Promise.resolve({ success: true })
    keepRunning({ executionCtx: { waitUntil: (p) => registered.push(p) } }, running)
    expect(registered).toHaveLength(1)
    await expect(registered[0]).resolves.toEqual({ success: true })
  })

  it('swallows a rejected action in the waitUntil copy (the response path still sees the error)', async () => {
    const registered: Promise<unknown>[] = []
    const running = Promise.reject(new Error('boom'))
    keepRunning({ executionCtx: { waitUntil: (p) => registered.push(p) } }, running)
    await expect(registered[0]).resolves.toBeUndefined()
    await expect(running).rejects.toThrow('boom')
  })

  it('is a no-op without an ExecutionContext', () => {
    const c = { get executionCtx(): never { throw new Error('This context has no ExecutionContext') } }
    expect(() => keepRunning(c, Promise.resolve())).not.toThrow()
  })
})
