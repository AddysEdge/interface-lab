/**
 * Feedback thread state (replaces InterfaceLab's Date.now() optimistic ids).
 *
 * A submitted item is shown immediately with a collision-proof temporary id.
 * When the server action resolves, the temporary item is replaced by the
 * persisted record (real recordId), so it can be replied to or deleted right
 * away. The live subscription later delivers the same record; merging by
 * recordId means it never appears twice.
 */

export interface FeedbackItem {
  recordId: string
  componentId: string
  parentId: string
  body: string
  authorId: string
  authorName: string
  createdAt: string
  pending?: boolean
  deleted?: boolean
}

const TEMP_PREFIX = 'temp-'

export function createTempId(cryptoImpl: Pick<Crypto, 'getRandomValues'> & { randomUUID?: () => string } = globalThis.crypto): string {
  if (typeof cryptoImpl.randomUUID === 'function') return TEMP_PREFIX + cryptoImpl.randomUUID()
  // randomUUID needs a secure context; getRandomValues does not.
  const bytes = new Uint8Array(16)
  cryptoImpl.getRandomValues(bytes)
  return TEMP_PREFIX + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function isTempId(id: string): boolean {
  return id.startsWith(TEMP_PREFIX)
}

/** Idempotency key sent with a submit; also used as the temporary id suffix. */
export function newRequestId(): string {
  return createTempId().slice(TEMP_PREFIX.length).replace(/[^A-Za-z0-9-]/g, '')
}

export interface LocalThreadState {
  /** Optimistic items not yet confirmed by the server. */
  pending: FeedbackItem[]
  /** Items confirmed by an action but possibly not yet delivered by the subscription. */
  confirmed: FeedbackItem[]
  /** Items the user deleted; hidden even if a stale subscription frame still has them. */
  removed: string[]
}

export const EMPTY_LOCAL: LocalThreadState = { pending: [], confirmed: [], removed: [] }

export function addPending(state: LocalThreadState, item: FeedbackItem): LocalThreadState {
  return { ...state, pending: [...state.pending, { ...item, pending: true }] }
}

export function confirmPending(state: LocalThreadState, tempId: string, persisted: FeedbackItem): LocalThreadState {
  return {
    ...state,
    pending: state.pending.filter((item) => item.recordId !== tempId),
    confirmed: [...state.confirmed.filter((item) => item.recordId !== persisted.recordId), { ...persisted, pending: false }],
  }
}

export function failPending(state: LocalThreadState, tempId: string): LocalThreadState {
  return { ...state, pending: state.pending.filter((item) => item.recordId !== tempId) }
}

export function markRemoved(state: LocalThreadState, recordId: string): LocalThreadState {
  return { ...state, removed: [...new Set([...state.removed, recordId])] }
}

export function unmarkRemoved(state: LocalThreadState, recordId: string): LocalThreadState {
  return { ...state, removed: state.removed.filter((id) => id !== recordId) }
}

/** Live records + confirmed + pending, de-duplicated by recordId, oldest first. */
export function mergeThread(live: FeedbackItem[], local: LocalThreadState): FeedbackItem[] {
  const byId = new Map<string, FeedbackItem>()
  for (const item of local.confirmed) byId.set(item.recordId, item)
  for (const item of live) byId.set(item.recordId, item) // server copy wins
  const removed = new Set(local.removed)
  const merged = [...byId.values(), ...local.pending].filter((item) => !removed.has(item.recordId))
  return merged.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
}

export interface ThreadNode {
  item: FeedbackItem
  replies: FeedbackItem[]
}

/** Top-level items with their replies. Replies whose parent is gone keep a placeholder parent. */
export function buildThreads(items: FeedbackItem[]): ThreadNode[] {
  const tops = items.filter((item) => !item.parentId)
  const topIds = new Set(tops.map((item) => item.recordId))
  const orphanParents = new Map<string, FeedbackItem>()
  for (const item of items) {
    if (item.parentId && !topIds.has(item.parentId) && !orphanParents.has(item.parentId)) {
      orphanParents.set(item.parentId, {
        recordId: item.parentId,
        componentId: item.componentId,
        parentId: '',
        body: '',
        authorId: '',
        authorName: '',
        createdAt: item.createdAt,
        deleted: true,
      })
    }
  }
  return [...tops, ...orphanParents.values()]
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .map((item) => ({ item, replies: items.filter((reply) => reply.parentId === item.recordId) }))
}

export function canDelete(item: FeedbackItem, userId: string | null): boolean {
  return Boolean(userId) && !item.pending && !item.deleted && !isTempId(item.recordId) && item.authorId === userId
}

export function canReply(item: FeedbackItem): boolean {
  return !item.parentId && !item.pending && !item.deleted && !isTempId(item.recordId)
}
