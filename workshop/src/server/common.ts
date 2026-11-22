/**
 * Helpers shared by the server actions.
 *
 * Actions run with RBAC off (see src/server/action-routes.ts), so every
 * handler must authorize explicitly. Identity is ctx.userId, which the action
 * route derives from a verified JWT; params never carry identity.
 */
import type { ActionResult, ActionTools } from 'deepspace/worker'
import type { z } from 'zod'
import { describeIssues } from '../shared/validation'
import type { ActionErrorCode, ComponentData } from '../shared/types'

export function fail(code: ActionErrorCode, error: string, details?: Record<string, unknown>): ActionResult<never> {
  return details ? { success: false, code, error, details } : { success: false, code, error }
}

export function invalid(error: z.ZodError): ActionResult<never> {
  const { message, fields } = describeIssues(error)
  return fail('invalid_input', message, { fields })
}

/** The app owner moderates the library (hide components, remove any feedback). */
export function isModerator(userId: string, env: { OWNER_USER_ID?: string }): boolean {
  return Boolean(env.OWNER_USER_ID) && userId === env.OWNER_USER_ID
}

export function isSignedIn(userId: string | undefined): userId is string {
  return Boolean(userId) && !userId!.startsWith('anon-')
}

export class ToolError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message)
  }
}

/** Unwrap a tools result or throw (caught by `guard`). */
export function must<T>(result: ActionResult<T>, operation: string): T {
  if (!result.success) throw new ToolError(`${operation}: ${result.error}`, result.code)
  return result.data
}

export function isDuplicate(result: ActionResult<unknown>): boolean {
  return !result.success && (result.code === 'duplicate' || /duplicate/i.test(result.error ?? ''))
}

/** Convert unexpected storage failures into a safe, generic error. */
export async function guard<T>(operation: string, run: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await run()
  } catch (error) {
    console.error(`[action] ${operation} failed:`, error instanceof Error ? error.message : error)
    return fail('storage_failed', 'Something went wrong while saving. Please try again.')
  }
}

export interface LoadedComponent {
  id: string
  data: ComponentData
  createdAt: string
}

/** Load a component; null when missing. */
export async function getComponent(tools: ActionTools, id: string): Promise<LoadedComponent | null> {
  const result = await tools.get<ComponentData & Record<string, unknown>>('components', id)
  if (!result.success) return null
  const record = result.data.record
  return { id: record.recordId, data: record.data, createdAt: record.createdAt }
}

/**
 * Load a component the caller owns. Another user's component (draft or not)
 * answers exactly like a missing one, so ids of private drafts are not
 * confirmed to non-owners.
 */
export async function getOwnedComponent(tools: ActionTools, id: string, userId: string): Promise<LoadedComponent | null> {
  const component = await getComponent(tools, id)
  return component && component.data.ownerId === userId ? component : null
}

/** Public display name from the platform users row (OAuth profile), never from params. */
export async function displayName(tools: ActionTools, userId: string): Promise<string> {
  const result = await tools.get<{ name?: string }>('users', userId)
  const name = result.success ? result.data.record.data.name?.trim() : ''
  return (name || 'Member').slice(0, 80)
}

/** The account email for a user id (trusted platform data). */
export async function accountEmail(tools: ActionTools, userId: string): Promise<string | null> {
  const result = await tools.get<{ email?: string }>('users', userId)
  const email = result.success ? result.data.record.data.email?.trim() : ''
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}
