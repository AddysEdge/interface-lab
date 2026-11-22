import type { CategoryId } from './categories'

export type ComponentStatus = 'draft' | 'published'

export interface ComponentData {
  title: string
  description: string
  category: CategoryId
  tags: string[]
  html: string
  css: string
  status: ComponentStatus
  ownerId: string
  authorName: string
  isSample: boolean | number
  feedbackCount: number
  publishedAt: number
}

export interface FeedbackData {
  componentId: string
  parentId: string
  body: string
  authorId: string
  authorName: string
  componentStatus: ComponentStatus
  clientRequestId: string
}

export interface PreferencesData {
  userId: string
  notifyOnFeedback: boolean | number
}

export interface ReviewSuggestion {
  description: string
  tags: string[]
  accessibility: Array<{ issue: string; suggestion: string }>
  docsQuery: string
}

export interface DocResult {
  title: string
  url: string
  domain: string
  snippet: string
}

/** Machine codes returned by server actions (stable for UI branching and tests). */
export type ActionErrorCode =
  | 'unauthenticated'
  | 'invalid_input'
  | 'not_found'
  | 'forbidden'
  | 'limit_reached'
  | 'quota_exceeded'
  | 'integration_failed'
  | 'insufficient_credits'
  | 'bad_response'
  | 'storage_failed'
  | 'visibility_incomplete'
