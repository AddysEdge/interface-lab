/**
 * Integration C: feedback notification email via DeepSpace `email/send`.
 *
 * Guarantees (each is covered by src/server/consistency.test.ts):
 * - Opt-in only: the component owner must have enabled notifyOnFeedback.
 * - Recipient: the owner's account email from the platform users row, never
 *   a value from the request. Never for feedback on your own component.
 * - At most one provider request per feedback item. Before sending, a request must
 *   claim the item's single ledger row (uniqueOn(feedbackId, attempt) with
 *   attempt = 1). The Durable Object applies writes serially, so exactly one
 *   of any number of concurrent submits/retries wins the claim; every other
 *   request gets 'already_handled' and never calls the provider.
 * - No automatic re-send: a failed or interrupted send is recorded and not
 *   retried. That trades a possibly missed notification for one application-side
 *   provider request, even if a request crashes after provider acceptance.
 *   Provider-side delivery is separate and has no exactly-once guarantee.
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
  | 'already_handled'
  | 'rate_limited'
  | 'failed'

/** The only attempt number ever claimed: at most one send per feedback item. */
export const ONLY_ATTEMPT = 1

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

    // Claim the single attempt. Whoever creates this row owns the one send;
    // everyone else (concurrent copies, later retries) stands down.
    const claim = await tools.create('notifications', {
      feedbackId: feedback.recordId,
      recipientId: ownerId,
      attempt: ONLY_ATTEMPT,
      status: 'pending',
      lastError: '',
    })
    if (!claim.success) {
      if (isDuplicate(claim)) return 'already_handled'
      must(claim, 'claim notification')
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
