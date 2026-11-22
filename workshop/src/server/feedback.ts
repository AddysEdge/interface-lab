/**
 * Feedback actions.
 *
 * - Authorship comes from the verified caller; authorId is userBound.
 * - Feedback can only target a published component; a reply must target a
 *   top-level item on the same component.
 * - `clientRequestId` + uniqueOn(authorId, clientRequestId) makes a retried or
 *   double-clicked submit return the original record instead of a duplicate.
 * - The component owner is emailed when someone else posts (opt-in); email
 *   failures never fail the post.
 */
import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { FeedbackItem } from '../shared/feedbackThread'
import { LIMITS } from '../shared/limits'
import type { FeedbackData } from '../shared/types'
import { feedbackInputSchema, idInputSchema } from '../shared/validation'
import { displayName, fail, getComponent, guard, invalid, isDuplicate, isSignedIn, must } from './common'
import { refreshFeedbackCount } from './components'
import { notifyComponentOwner, type NotificationOutcome } from './notify'
import { claimSlot } from './quota'

type FeedbackRecord = FeedbackData & Record<string, unknown>

async function loadFeedback(tools: ActionTools, id: string): Promise<FeedbackItem | null> {
  const result = await tools.get<FeedbackRecord>('feedback', id)
  if (!result.success) return null
  const { record } = result.data
  return toItem(record.recordId, record.data, record.createdAt)
}

function toItem(recordId: string, data: FeedbackData, createdAt: string): FeedbackItem {
  return {
    recordId,
    componentId: data.componentId,
    parentId: data.parentId ?? '',
    body: data.body,
    authorId: data.authorId,
    authorName: data.authorName,
    createdAt,
  }
}

async function findByRequestId(tools: ActionTools, authorId: string, clientRequestId: string): Promise<FeedbackItem | null> {
  const result = must(
    await tools.query<FeedbackRecord>('feedback', { where: { authorId, clientRequestId }, limit: 1 }),
    'find feedback by request id',
  )
  const record = result.records[0]
  return record ? toItem(record.recordId, record.data, record.createdAt) : null
}

export const createFeedback: ActionHandler<Env> = (ctx) =>
  guard('createFeedback', async () => {
    const { userId, tools, env } = ctx
    if (!isSignedIn(userId)) return fail('unauthenticated', 'Sign in to leave feedback.')
    const parsed = feedbackInputSchema.safeParse(ctx.params)
    if (!parsed.success) return invalid(parsed.error)
    const input = parsed.data

    const component = await getComponent(tools, input.componentId)
    if (!component || component.data.status !== 'published') {
      return fail('not_found', 'This component is not published, so it cannot receive feedback.')
    }

    // Retried submit: return the original record (and finish its notification if needed).
    const previous = await findByRequestId(tools, userId, input.clientRequestId)
    if (previous) {
      const notification = await notifyComponentOwner(tools, env, { feedback: previous, component })
      return { success: true, data: { feedback: previous, duplicate: true, notification } }
    }

    if (input.parentId) {
      const parent = await loadFeedback(tools, input.parentId)
      if (!parent || parent.componentId !== component.id) return fail('not_found', 'The feedback you are replying to no longer exists.')
      if (parent.parentId) return fail('invalid_input', 'Replies can only be added to top-level feedback.')
    }

    if (!(await claimSlot(tools, 'feedback', userId, LIMITS.feedbackPerUserPerDay))) {
      return fail('quota_exceeded', `You can post up to ${LIMITS.feedbackPerUserPerDay} feedback items per day.`)
    }

    const created = await tools.create('feedback', {
      componentId: component.id,
      parentId: input.parentId,
      body: input.body,
      authorId: userId,
      authorName: await displayName(tools, userId),
      componentStatus: 'published',
      clientRequestId: input.clientRequestId,
    })
    if (isDuplicate(created)) {
      // A concurrent copy of this submit won the race; answer with its record.
      const winner = await findByRequestId(tools, userId, input.clientRequestId)
      if (winner) return { success: true, data: { feedback: winner, duplicate: true, notification: 'skipped' as NotificationOutcome } }
    }
    const { recordId } = must(created, 'create feedback')

    // Close the race with a concurrent unpublish/delete: if the component is
    // no longer published now that the row exists, take the row back down so
    // feedback is never public on an unpublished component.
    const current = await getComponent(tools, component.id)
    if (!current || current.data.status !== 'published') {
      await withdrawFeedback(tools, recordId)
      return fail('not_found', 'This component was unpublished while you were posting, so your feedback was not added.')
    }

    const feedback = await loadFeedback(tools, recordId)
    if (!feedback) return fail('storage_failed', 'Your feedback was saved but could not be reloaded. Refresh to see it.')

    await refreshFeedbackCount(tools, component.id)
    const notification = await notifyComponentOwner(tools, env, { feedback, component })
    return { success: true, data: { feedback, duplicate: false, notification } }
  })

/** Remove a just-written row; if removal fails, at least hide it. Throws if both fail. */
async function withdrawFeedback(tools: ActionTools, recordId: string): Promise<void> {
  const removed = await tools.remove('feedback', recordId)
  if (removed.success) return
  must(await tools.update('feedback', recordId, { componentStatus: 'draft' }), 'hide withdrawn feedback')
}

export const deleteFeedback: ActionHandler<Env> = (ctx) =>
  guard('deleteFeedback', async () => {
    const { userId, tools } = ctx
    if (!isSignedIn(userId)) return fail('unauthenticated', 'Sign in to manage your feedback.')
    const parsed = idInputSchema.safeParse(ctx.params)
    if (!parsed.success) return invalid(parsed.error)

    const feedback = await loadFeedback(tools, parsed.data.id)
    // Someone else's feedback answers like a missing item: no confirmation either way.
    if (!feedback || feedback.authorId !== userId) return fail('not_found', 'Feedback not found, or it is not yours.')

    must(await tools.remove('feedback', feedback.recordId), 'delete feedback')
    // Replies stay; the thread shows a "feedback deleted" placeholder above them.
    await refreshFeedbackCount(tools, feedback.componentId)
    return { success: true, data: { id: feedback.recordId } }
  })
