/**
 * Public search endpoint: GET /api/library?q=&category=&sort=&page=
 *
 * Works for signed-out visitors (no token needed) and returns only published,
 * unmoderated components. Always read current records: an old client-supplied
 * version or cached response must never reveal code after it is unpublished.
 */
import type { Hono } from 'hono'
import { parseListState } from '../shared/listState'
import type { AppContext } from '../../worker.js'
import { createActionTools } from './action-routes.js'
import { searchLibrary } from './library.js'

export function registerLibraryRoutes(app: Hono<AppContext>): void {
  app.get('/api/library', async (c) => {
    const url = new URL(c.req.url)
    const state = parseListState(url.searchParams)
    try {
      const tools = createActionTools(c.env, 'library-search', '')
      const body = await searchLibrary(tools, state)
      const response = new Response(JSON.stringify({ success: true, data: body }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      })
      return response
    } catch (error) {
      console.error('[library] search failed:', error instanceof Error ? error.message : error)
      return c.json({ success: false, error: 'The library could not be loaded. Please try again.' }, 500)
    }
  })
}
