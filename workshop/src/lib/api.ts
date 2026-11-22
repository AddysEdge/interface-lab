/**
 * Browser → server action calls (POST /api/actions/<name> with the caller's
 * bearer token). Network and HTTP failures are folded into the same result
 * shape the actions return, so every caller handles one error path.
 */
import { getAuthToken } from 'deepspace'
import type { ActionErrorCode } from '../shared/types'

export type ActionResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: ActionErrorCode | 'network' | 'http'; details?: Record<string, unknown> }

export async function callAction<T>(name: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<ActionResponse<T>> {
  let token: string | null = null
  try {
    token = await getAuthToken()
  } catch {
    token = null
  }
  if (!token) return { success: false, code: 'unauthenticated', error: 'Please sign in first.' }

  let response: Response
  try {
    response = await fetch(`/api/actions/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(params),
      signal,
    })
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error
    return { success: false, code: 'network', error: 'Network error. Check your connection and try again.' }
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  if (response.status === 401) return { success: false, code: 'unauthenticated', error: 'Your session expired. Please sign in again.' }
  if (payload && typeof payload === 'object' && 'success' in payload) return payload as ActionResponse<T>
  return { success: false, code: 'http', error: `The server returned an unexpected response (${response.status}).` }
}

/** Retryable = worth showing a "Try again" button. */
export function isRetryable(code: string | undefined): boolean {
  return code === 'network' || code === 'http' || code === 'integration_failed' || code === 'bad_response' || code === 'storage_failed' || code === 'visibility_incomplete'
}
