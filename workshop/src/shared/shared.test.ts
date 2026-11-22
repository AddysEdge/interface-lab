/**
 * Pure logic carried over from the InterfaceLab review fixes: multiword
 * search, URL list state + pagination, persisted feedback ids, validation and
 * the preview document.
 */
import { describe, expect, it } from 'vitest'
import { parseSearchTerms, matchesAllTerms } from './search'
import { buildSearch, DEFAULT_STATE, PAGE_SIZE, parseListState, selectPage, withFilters } from './listState'
import {
  addPending,
  buildThreads,
  canDelete,
  canReply,
  confirmPending,
  createTempId,
  EMPTY_LOCAL,
  failPending,
  isTempId,
  markRemoved,
  mergeThread,
  type FeedbackItem,
} from './feedbackThread'
import { componentInputSchema, feedbackInputSchema } from './validation'
import { buildPreviewDocument, escapeStyleText, PREVIEW_CSP, PREVIEW_SANDBOX } from './preview'

describe('multiword search', () => {
  const item = { title: 'Pill', description: '', category: 'buttons', tags: ['blue', 'animated', 'rounded'] }

  it('matches every term independently, in any order, case-insensitively', () => {
    expect(matchesAllTerms(item, parseSearchTerms('blue rounded'))).toBe(true)
    expect(matchesAllTerms(item, parseSearchTerms('ROUNDED   Blue'))).toBe(true)
    expect(matchesAllTerms(item, parseSearchTerms('anim'))).toBe(true)
    expect(matchesAllTerms(item, parseSearchTerms('blue square'))).toBe(false)
  })

  it('normalises whitespace and strips wildcard characters', () => {
    expect(parseSearchTerms('  blue\t,rounded  ')).toEqual(['blue', 'rounded'])
    expect(parseSearchTerms('50%_off * \\x')).toEqual(['50off', 'x'])
    expect(parseSearchTerms('%')).toEqual([])
    expect(parseSearchTerms('a a a')).toEqual(['a'])
  })
})

describe('list URL state', () => {
  const params = (s: string) => new URLSearchParams(s)

  it('parses valid params and falls back on malformed ones', () => {
    expect(parseListState(params('q=blue&category=cards&sort=title&page=3'))).toEqual({ q: 'blue', category: 'cards', sort: 'title', page: 3 })
    expect(parseListState(params('category=nope&sort=hack&page=-2'))).toEqual(DEFAULT_STATE)
    expect(parseListState(params('page=abc')).page).toBe(1)
    expect(parseListState(params('page=99999')).page).toBe(1)
  })

  it('keeps q/category/sort when building page links', () => {
    const state = parseListState(params('q=blue rounded&category=buttons&sort=feedback'))
    expect(buildSearch({ ...state, page: 2 })).toBe('q=blue+rounded&category=buttons&sort=feedback&page=2')
    expect(buildSearch(DEFAULT_STATE)).toBe('')
  })

  it('resets to page 1 when search, category or sort changes', () => {
    const onPage3 = { q: 'blue', category: '', sort: 'newest' as const, page: 3 }
    expect(withFilters(onPage3, { q: 'red' }).page).toBe(1)
    expect(withFilters(onPage3, { category: 'cards' }).page).toBe(1)
    expect(withFilters(onPage3, { sort: 'title' }).page).toBe(1)
    expect(withFilters(onPage3, { q: 'blue' }).page).toBe(3)
  })

  it('paginates deterministically and clamps a page past the end', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      title: `Item ${String(i).padStart(2, '0')}`,
      category: i % 2 ? 'buttons' : 'cards',
      tags: i % 3 ? ['blue', 'rounded'] : ['red'],
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
      feedbackCount: i % 5,
    }))
    const page2 = selectPage(items, { ...DEFAULT_STATE, page: 2 })
    expect(page2.total).toBe(30)
    expect(page2.pages).toBe(Math.ceil(30 / PAGE_SIZE))
    expect(page2.items[0].title).toBe('Item 17') // newest first
    const filtered = selectPage(items, { ...DEFAULT_STATE, q: 'rounded blue', category: 'buttons' })
    expect(filtered.items.every((i) => i.category === 'buttons' && i.tags.includes('blue'))).toBe(true)
    const pastEnd = selectPage(items, { ...DEFAULT_STATE, page: 9 })
    expect(pastEnd.page).toBe(pastEnd.pages)
    expect(selectPage(items, { ...DEFAULT_STATE, page: 2 })).toEqual(page2) // same URL, same page
  })
})

describe('feedback thread with persisted ids', () => {
  const base = { componentId: 'c1', parentId: '', body: 'hi', authorId: 'user_b', authorName: 'B' }

  it('temporary ids are distinct and cannot look like record ids', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => createTempId()))
    expect(ids.size).toBe(1000)
    expect([...ids].every(isTempId)).toBe(true)
    const fallback = createTempId({ getRandomValues: (a) => crypto.getRandomValues(a) })
    expect(fallback).toMatch(/^temp-[0-9a-f]{32}$/)
  })

  it('replaces the optimistic item with the persisted record, which is immediately actionable', () => {
    const temp = createTempId()
    let local = addPending(EMPTY_LOCAL, { ...base, recordId: temp, createdAt: '2026-01-01T00:00:00Z' })
    let items = mergeThread([], local)
    expect(items).toHaveLength(1)
    expect(canReply(items[0])).toBe(false)
    expect(canDelete(items[0], 'user_b')).toBe(false)

    const persisted: FeedbackItem = { ...base, recordId: 'rec0001', createdAt: '2026-01-01T00:00:01Z' }
    local = confirmPending(local, temp, persisted)
    items = mergeThread([], local)
    expect(items.map((i) => i.recordId)).toEqual(['rec0001'])
    expect(canReply(items[0])).toBe(true)
    expect(canDelete(items[0], 'user_b')).toBe(true)
    expect(canDelete(items[0], 'user_other')).toBe(false)

    // The live subscription later delivers the same record: still one item.
    expect(mergeThread([persisted], local)).toHaveLength(1)
  })

  it('rolls back failures and hides deleted items', () => {
    const temp = createTempId()
    const local = failPending(addPending(EMPTY_LOCAL, { ...base, recordId: temp, createdAt: '2026-01-01T00:00:00Z' }), temp)
    expect(mergeThread([], local)).toHaveLength(0)
    const live: FeedbackItem = { ...base, recordId: 'rec0002', createdAt: '2026-01-01T00:00:00Z' }
    expect(mergeThread([live], markRemoved(EMPTY_LOCAL, 'rec0002'))).toHaveLength(0)
  })

  it('keeps replies of a deleted item under a placeholder', () => {
    const reply: FeedbackItem = { ...base, recordId: 'rec0003', parentId: 'gone', createdAt: '2026-01-01T00:00:00Z' }
    const threads = buildThreads([reply])
    expect(threads).toHaveLength(1)
    expect(threads[0].item).toMatchObject({ recordId: 'gone', deleted: true })
    expect(threads[0].replies).toEqual([reply])
    expect(canReply(threads[0].item)).toBe(false)
  })
})

describe('validation', () => {
  const component = { title: '  My\nbutton  ', category: 'buttons', html: '<b>x</b>' }

  it('normalises single-line titles and fills defaults', () => {
    const parsed = componentInputSchema.parse(component)
    expect(parsed).toMatchObject({ title: 'My button', description: '', css: '', tags: [] })
  })

  it('rejects unknown keys and control characters', () => {
    expect(componentInputSchema.safeParse({ ...component, likes: 5 }).success).toBe(false)
    expect(componentInputSchema.safeParse({ ...component, title: 'bad\u0007' }).success).toBe(false)
    expect(feedbackInputSchema.safeParse({ componentId: 'c1', body: '   ', clientRequestId: 'abcdefgh' }).success).toBe(false)
    expect(feedbackInputSchema.safeParse({ componentId: 'c1', body: 'ok', clientRequestId: 'short' }).success).toBe(false)
  })
})

describe('preview document', () => {
  it('uses an empty sandbox and a script-free, network-free CSP', () => {
    expect(PREVIEW_SANDBOX).toBe('')
    expect(PREVIEW_CSP).toContain("script-src 'none'")
    expect(PREVIEW_CSP).toContain("default-src 'none'")
    expect(PREVIEW_CSP).not.toMatch(/https?:/)
  })

  it('clips overflow in non-interactive thumbnails only', () => {
    expect(buildPreviewDocument({ html: '', css: '', scrollable: false })).toContain('html,body{overflow:hidden}')
    expect(buildPreviewDocument({ html: '', css: '' })).not.toContain('overflow:hidden')
  })

  it('stops user CSS from closing the style element', () => {
    expect(escapeStyleText('a{}</style><script>alert(1)</script>')).not.toMatch(/<\/style/i)
    const doc = buildPreviewDocument({ html: '<p>x</p>', css: '</STYLE><img src=x onerror=alert(1)>' })
    expect(doc.match(/<\/style>/gi)).toHaveLength(2) // only the document's own two style blocks
    expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<p>x</p>'))
  })
})
