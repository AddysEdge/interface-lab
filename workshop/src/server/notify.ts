/**
 * Integration C: feedback notification email via DeepSpace `email/send`.
 *
 * Guarantees (each is covered by src/server/consistency.test.ts):
 * - Opt-in only: the component owner must have enabled notifyOnFeedback.
 * - Recipient: the owner's account email from the platform users row, never
 *   a value from the request. Never for feedback on your own component.
 * - One sender at a time: every send first claims an attempt row in the
 *   `notifications` ledger. uniqueOn(feedbackId, attempt) lets exactly one of
 *   any number of concurrent submits/retries claim attempt N; the others get
 *   'in_progress' and do not send.
 * - Never re-sent after success. After a REPORTED failure a later retry may
 *   claim the next attempt, up to MAX_ATTEMPTS in total.
 * - Crash window: if a request dies after the provider accepted the email
 *   but before the attempt is marked sent, the attempt stays 'pending'. Once
 *   it is older than SEND_LEASE_MS a retry may send again, so a duplicate is
 *   possible only in that crash window (the provider call has no idempotency key).
 * - Bounded: per-recipient and app-wide daily quotas, claimed only by the
 *   request that won the attempt.
 * - Never throws: the caller's feedback post succeeds regardless.
 */
import type { ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { FeedbackItem } from '../shared/feedbackThread'
import { QUOTAS } from '../shared/limits'
import type { PreferencesData } from '../shared/types'
import { accountEmail, isDuplicate, must, type LoadedComponent } from './common'
import { claimSlot } from './quota'

export type NotificationOutcome =
  | 'sent'
  | 'skipped'
  | 'not_opted_in'
  | 'already_sent'
  | 'in_progress'
  | 'rate_limited'
  | 'failed'

export const MAX_ATTEMPTS = 3
export const SEND_LEASE_MS = 5 * 60_000

interface AttemptRow {
  feedbackId: string
  recipientId: string
  attempt: number
  status: 'pending' | 'sent' | 'failed' | 'skipped'
  lastError: string
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
}

export function componentUrl(env: Pick<Env, 'APP_NAME'>, componentId: string): string {
  return `https://${env.APP_NAME}.app.space/c/${encodeURIComponent(componentId)}`
}

export function buildFeedbackEmail(input: { title: string; authorName: string; body: string; url: string; isReply: boolean }) {
  const title = input.title.replace(/[\r\n]+/g, ' ').slice(0, 80)
  const excerpt = input.body.length > 400 ? `${input.body.slice(0, 400)}…` : input.body
  const verb = input.isReply ? 'replied on' : 'left feedback on'
  const subject = `New feedback on "${title}"`
  const text = `${input.authorName} ${verb} your InterfaceLab component "${title}":\n\n${excerpt}\n\nView it: ${input.url}\n\nYou are receiving this because feedback notifications are on. Turn them off in Settings.`
  const html = `<p><strong>${escapeHtml(input.authorName)}</strong> ${verb} your InterfaceLab component <strong>${escapeHtml(title)}</strong>:</p>
<blockquote style="border-left:3px solid #6366f1;margin:0;padding:4px 12px;color:#3f3f46;white-space:pre-wrap">${escapeHtml(excerpt)}</blockquote>
<p><a href="${escapeHtml(input.url)}">View the component</a></p>
<p style="color:#71717a;font-size:12px">You are receiving this because feedback notifications are on. Turn them off in Settings.</p>`
  return { subject, text, html }
}

async function setAttempt(tools: ActionTools, id: string, patch: Partial<AttemptRow>) {
  const result = await tools.update('notifications', id, patch)
  if (!result.success) console.error('[notify] ledger update failed:', result.error)
}

export async function notifyComponentOwner(
  tools: ActionTools,
  env: Pick<Env, 'APP_NAME'>,
  { feedback, component }: { feedback: FeedbackItem; component: LoadedComponent },
  { now = Date.now() }: { now?: number } = {},
): Promise<NotificationOutcome> {
  try {
    const ownerId = component.data.ownerId
    if (!ownerId || ownerId === feedback.authorId) return 'skipped'

    const prefs = must(
      await tools.query<PreferencesData & Record<string, unknown>>('preferences', { where: { userId: ownerId }, limit: 1 }),
      'read preferences',
    )
    if (!prefs.records[0]?.data.notifyOnFeedback) return 'not_opted_in'

    const email = await accountEmail(tools, ownerId)
    if (!email) return 'skipped'

    const attempts = must(
      await tools.query<AttemptRow & Record<string, unknown>>('notifications', {
        where: { feedbackId: feedback.recordId },
        limit: MAX_ATTEMPTS + 10,
      }),
      'read notification ledger',
    ).records
    if (attempts.some((row) => row.data.status === 'sent')) return 'already_sent'
    if (attempts.some((row) => row.data.status === 'skipped')) return 'rate_limited'

    const latest = attempts.reduce<(typeof attempts)[number] | undefined>(
      (best, row) => (!best || row.data.attempt > best.data.attempt ? row : best),
      undefined,
    )
    if (latest?.data.status === 'pending') {
      const age = now - Date.parse(latest.createdAt)
      if (!(age >= SEND_LEASE_MS)) return 'in_progress' // another request holds the send
      await setAttempt(tools, latest.recordId, { status: 'failed', lastError: 'send lease expired without a result' })
    }
    const next = (latest?.data.attempt ?? 0) + 1
    if (next > MAX_ATTEMPTS) return 'failed'

    // Claim attempt `next`. The Durable Object applies uniqueOn serially, so
    // exactly one concurrent request creates this row; every other one stops.
    const claim = await tools.create('notifications', {
      feedbackId: feedback.recordId,
      recipientId: ownerId,
      attempt: next,
      status: 'pending',
      lastError: '',
    })
    if (!claim.success) {
      if (isDuplicate(claim)) return 'in_progress'
      must(claim, 'claim notification attempt')
    }
    const attemptId = (claim as { data: { recordId: string } }).data.recordId

    const withinQuota =
      (await claimSlot(tools, 'email', ownerId, QUOTAS.email.perRecipient)) &&
      (await claimSlot(tools, 'email', '*', QUOTAS.email.global))
    if (!withinQuota) {
      await setAttempt(tools, attemptId, { status: 'skipped', lastError: 'daily email quota reached' })
      return 'rate_limited'
    }

    const message = buildFeedbackEmail({
      title: component.data.title,
      authorName: feedback.authorName,
      body: feedback.body,
      url: componentUrl(env, component.id),
      isReply: Boolean(feedback.parentId),
    })
    const sent = await tools.integration('email/send', { to: email, ...message })
    if (!sent.success) {
      await setAttempt(tools, attemptId, { status: 'failed', lastError: sent.error.slice(0, 300) })
      console.error('[notify] email/send failed:', sent.code, sent.error)
      return 'failed'
    }
    await setAttempt(tools, attemptId, { status: 'sent', lastError: '' })
    return 'sent'
  } catch (error) {
    console.error('[notify] unexpected failure:', error instanceof Error ? error.message : error)
    return 'failed'
  }
}
