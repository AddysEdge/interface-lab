import { afterEach, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { AppContext, Env } from '../../worker'
import { FakeRoom } from '../test/fakeRoom'
import { registerLibraryRoutes } from './library-routes'

afterEach(() => vi.unstubAllGlobals())

it('does not serve an unpublished component through an old library URL or cache', async () => {
  const room = new FakeRoom()
  room.write('creator', 'components', {
    title: 'Private after publication', category: 'buttons', tags: ['rounded'],
    html: '<button>Example</button>', css: '', js: 'console.log("private")', status: 'published',
  }, 'component1')
  const tools = room.tools('library-search')
  const env = {
    DEEPSPACE_APP_ID: 'app_test',
    RECORD_ROOMS: {
      idFromName: (name: string) => name,
      get: () => ({
        fetch: async (request: Request) => {
          const { params } = await request.json() as { params: Record<string, unknown> }
          const { collection, ...options } = params
          return Response.json(await tools.query(collection as string, options))
        },
      }),
    },
  } as unknown as Env
  const app = new Hono<AppContext>()
  registerLibraryRoutes(app)
  const path = '/api/library?q=private&v=old-public-version'
  const initial = await app.request(path, undefined, env)
  const published = await initial.clone().json() as { data: { items: Record<string, unknown>[] } }
  expect(published.data.items).toHaveLength(1)
  expect(published.data.items[0]).not.toHaveProperty('js')

  // A previously valid public response is still available at the edge. A caller
  // intentionally reuses its old version after the creator unpublishes.
  const cache = { match: vi.fn(async () => initial.clone()), put: vi.fn() }
  vi.stubGlobal('caches', { default: cache })
  room.write('creator', 'components', { status: 'draft' }, 'component1', true)

  const after = await app.request(path, undefined, env)
  expect(after.headers.get('Cache-Control')).toBe('no-store')
  const unpublished = await after.json() as { data: { items: unknown[] } }
  expect(unpublished.data.items).toEqual([])
  expect(cache.match).not.toHaveBeenCalled()
  expect(cache.put).not.toHaveBeenCalled()
})
