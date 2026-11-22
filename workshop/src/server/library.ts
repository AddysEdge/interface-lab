/**
 * Server-side library search and its change signal.
 *
 * Search runs in the worker over every published component (paged through the
 * room, no item cap) and returns a single page, so a visitor downloads one page
 * of cards instead of the whole catalog. Matching, sorting and pagination use
 * the same pure functions as before (src/shared/listState.ts).
 *
 * `library_meta.version` changes whenever published content changes. Browsers
 * subscribe to it (a single tiny record) and refetch. Search responses are not
 * cached, so unpublished code is not served through an earlier version's URL.
 */
import type { ActionTools } from 'deepspace/worker'
import { selectPage, type ListState } from '../shared/listState'
import type { CategoryId } from '../shared/categories'
import type { ComponentData } from '../shared/types'
import { queryAll } from './visibility'

export const LIBRARY_META_ID = 'library'

export interface LibraryCard {
  id: string
  title: string
  description: string
  category: CategoryId
  tags: string[]
  html: string
  css: string
  authorName: string
  isSample: boolean
  feedbackCount: number
  publishedAt: number
  createdAt: string
  hasScript: boolean
  status: 'published'
}

/** Best effort: a failed bump only delays a refresh, it never fails the caller's write. */
export async function bumpLibraryVersion(tools: ActionTools): Promise<void> {
  try {
    const version = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const result = await tools.create('library_meta', { version }, LIBRARY_META_ID)
    if (!result.success) console.error('[library] version bump failed:', result.error)
  } catch (error) {
    console.error('[library] version bump failed:', error instanceof Error ? error.message : error)
  }
}

export async function searchLibrary(tools: ActionTools, state: ListState) {
  const records = await queryAll<ComponentData & Record<string, unknown>>(tools, 'components', { status: 'published' })
  // RBAC is off for this system read, so re-check the public rule explicitly.
  const cards: LibraryCard[] = records
    .filter((record) => record.data.status === 'published' && record.data.moderation !== 'hidden')
    .map((record) => ({
      id: record.recordId,
      title: record.data.title,
      description: record.data.description ?? '',
      category: record.data.category,
      tags: Array.isArray(record.data.tags) ? record.data.tags : [],
      html: record.data.html ?? '',
      css: record.data.css ?? '',
      authorName: record.data.authorName ?? '',
      isSample: Boolean(record.data.isSample),
      feedbackCount: record.data.feedbackCount ?? 0,
      publishedAt: record.data.publishedAt ?? 0,
      createdAt: record.createdAt,
      // Card thumbnails never run scripts, so the code itself is not sent.
      hasScript: Boolean(record.data.js?.trim()),
      status: 'published',
    }))
  const page = selectPage(cards, state)
  return { items: page.items, total: page.total, pages: page.pages, page: page.page }
}
