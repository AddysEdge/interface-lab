/**
 * Component actions: save a draft, publish/unpublish, delete, and the app
 * owner's moderation (hide/restore).
 *
 * Only the owner may change a component; only the app owner may moderate.
 * ownerId is bound to the verified caller by the platform, and authorName /
 * feedbackCount / isSample / publishedAt / moderation are written here only,
 * never taken from params.
 */
import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { LIMITS } from '../shared/limits'
import type { ComponentStatus } from '../shared/types'
import { componentInputSchema, idInputSchema, moderationInputSchema, publishProblems, statusInputSchema } from '../shared/validation'
import { displayName, fail, getComponent, getOwnedComponent, guard, invalid, isModerator, isSignedIn, must } from './common'
import { bumpLibraryVersion } from './library'
import { convergeFeedbackVisibility, hideFeedback, queryAll } from './visibility'

const NOT_FOUND = 'Component not found, or you do not own it.'

export const saveComponent: ActionHandler<Env> = (ctx) =>
  guard('saveComponent', async () => {
    const { userId, tools } = ctx
    if (!isSignedIn(userId)) return fail('unauthenticated', 'Sign in to save components.')
    const parsed = componentInputSchema.safeParse(ctx.params)
    if (!parsed.success) return invalid(parsed.error)
    const { id, ...fields } = parsed.data

    if (!id) {
      const owned = must(
        await tools.query('components', { where: { ownerId: userId }, limit: LIMITS.componentsPerUser + 1 }),
        'count components',
      )
      if (owned.records.length >= LIMITS.componentsPerUser) {
        return fail('limit_reached', `You can keep up to ${LIMITS.componentsPerUser} components. Delete one to create another.`)
      }
      const created = must(
        await tools.create('components', {
          ...fields,
          status: 'draft',
          ownerId: userId,
          authorName: await displayName(tools, userId),
          isSample: false,
          feedbackCount: 0,
          publishedAt: 0,
          moderation: 'none',
        }),
        'create component',
      )
      return { success: true, data: { id: created.recordId, status: 'draft' as ComponentStatus } }
    }

    const existing = await getOwnedComponent(tools, id, userId)
    if (!existing) return fail('not_found', NOT_FOUND)
    if (existing.data.status === 'published') {
      // A live component must stay publishable.
      const problems = publishProblems(fields)
      if (problems.length) return fail('invalid_input', problems[0], { problems })
    }
    must(await tools.update('components', id, fields), 'update component')
    if (existing.data.status === 'published') await bumpLibraryVersion(tools)
    return { success: true, data: { id, status: existing.data.status } }
  })

export const setComponentStatus: ActionHandler<Env> = (ctx) =>
  guard<{ id: string; status: ComponentStatus }>('setComponentStatus', async () => {
    const { userId, tools } = ctx
    if (!isSignedIn(userId)) return fail('unauthenticated', 'Sign in to publish components.')
    const parsed = statusInputSchema.safeParse(ctx.params)
    if (!parsed.success) return invalid(parsed.error)
    const { id, status } = parsed.data

    const existing = await getOwnedComponent(tools, id, userId)
    if (!existing) return fail('not_found', NOT_FOUND)
    if (status === 'published') {
      if (existing.data.moderation === 'hidden') {
        return fail('moderated', 'This component was hidden by the app owner and cannot be republished. You can still edit or delete it.')
      }
      const problems = publishProblems(existing.data)
      if (problems.length) return fail('invalid_input', problems[0], { problems })
    }

    if (status === 'draft') {
      // 1. Hide feedback first. If this fails the component is still published
      //    and its feedback is partly hidden: fail closed, nothing exposed.
      if (!(await attempt(() => hideFeedback(tools, id)))) {
        return fail('visibility_incomplete', 'Could not hide this component’s feedback, so it is still published. Please try again.')
      }
      // 2. Flip the component.
      if (!(await attempt(async () => must(await tools.update('components', id, { status: 'draft' }), 'unpublish')))) {
        return fail('visibility_incomplete', 'Could not unpublish the component. It is still published; please try again.')
      }
      // 3. Catch feedback posted between steps 1 and 2 (createFeedback re-checks too).
      if (!(await attempt(() => convergeFeedbackVisibility(tools, id)))) {
        return fail('visibility_incomplete', 'The component is unpublished, but hiding some recent feedback did not finish. Unpublish again to complete it.')
      }
      await bumpLibraryVersion(tools)
      return { success: true, data: { id, status } }
    }

    // Publish: flip first, then reveal. publishedAt marks the first publish of
    // this run; a retry on an already published component keeps it.
    const patch: Record<string, unknown> = { status: 'published' }
    if (existing.data.status !== 'published') patch.publishedAt = Date.now()
    must(await tools.update('components', id, patch), 'publish')
    if (!(await attempt(() => convergeFeedbackVisibility(tools, id)))) {
      return fail('visibility_incomplete', 'Published, but some feedback is still hidden. Publish again to finish showing it.')
    }
    await bumpLibraryVersion(tools)
    return { success: true, data: { id, status } }
  })

/**
 * App-owner moderation. "hide" takes a component out of the library the same
 * fail-closed way as unpublishing (feedback hidden first) and locks it against
 * republishing; "restore" lifts the lock (it stays a draft until its creator
 * republishes). The creator keeps their draft and can still edit or delete it.
 */
export const moderateComponent: ActionHandler<Env> = (ctx) =>
  guard('moderateComponent', async () => {
    const { userId, tools, env } = ctx
    if (!isSignedIn(userId)) return fail('unauthenticated', 'Sign in first.')
    if (!isModerator(userId, env)) return fail('forbidden', 'Only the app owner can moderate components.')
    const parsed = moderationInputSchema.safeParse(ctx.params)
    if (!parsed.success) return invalid(parsed.error)
    const { id, action } = parsed.data

    const existing = await getComponent(tools, id)
    if (!existing) return fail('not_found', 'Component not found.')

    if (action === 'restore') {
      must(await tools.update('components', id, { moderation: 'none' }), 'restore component')
      return { success: true, data: { id, moderation: 'none', status: existing.data.status } }
    }

    if (!(await attempt(() => hideFeedback(tools, id)))) {
      return fail('visibility_incomplete', 'Could not hide this component\u2019s feedback, so it is still visible. Please try again.')
    }
    if (!(await attempt(async () => must(await tools.update('components', id, { status: 'draft', moderation: 'hidden' }), 'hide component')))) {
      return fail('visibility_incomplete', 'Could not hide the component. It is still visible; please try again.')
    }
    if (!(await attempt(() => convergeFeedbackVisibility(tools, id)))) {
      return fail('visibility_incomplete', 'The component is hidden, but hiding some recent feedback did not finish. Hide it again to complete it.')
    }
    await bumpLibraryVersion(tools)
    return { success: true, data: { id, moderation: 'hidden', status: 'draft' } }
  })

/** Hidden components for the moderation dashboard (they are drafts, so no one else can read them). */
export const listHiddenComponents: ActionHandler<Env> = (ctx) =>
  guard('listHiddenComponents', async () => {
    const { userId, tools, env } = ctx
    if (!isSignedIn(userId)) return fail('unauthenticated', 'Sign in first.')
    if (!isModerator(userId, env)) return fail('forbidden', 'Only the app owner can moderate components.')
    const hidden = await queryAll<{ title: string; authorName: string; category: string } & Record<string, unknown>>(tools, 'components', { moderation: 'hidden' })
    return {
      success: true,
      data: { items: hidden.map((r) => ({ id: r.recordId, title: r.data.title, authorName: r.data.authorName, category: r.data.category, updatedAt: r.updatedAt })) },
    }
  })

/** Run a step; log and report failure instead of throwing. */
async function attempt(step: () => Promise<unknown>): Promise<boolean> {
  try {
    await step()
    return true
  } catch (error) {
    console.error('[components] visibility step failed:', error instanceof Error ? error.message : error)
    return false
  }
}

export const deleteComponent: ActionHandler<Env> = (ctx) =>
  guard('deleteComponent', async () => {
    const { userId, tools } = ctx
    if (!isSignedIn(userId)) return fail('unauthenticated', 'Sign in to delete components.')
    const parsed = idInputSchema.safeParse(ctx.params)
    if (!parsed.success) return invalid(parsed.error)

    const existing = await getOwnedComponent(tools, parsed.data.id, userId)
    if (!existing) return fail('not_found', NOT_FOUND)

    // Cascade: remove the component's feedback first (bounded batches), then the component.
    for (let batch = 0; ; batch++) {
      if (batch >= 2_000) return fail('storage_failed', 'Deleting this component’s feedback did not finish. Please try again.')
      const { deleted } = must(await tools.deleteWhere('feedback', { componentId: existing.id }, 500), 'delete feedback')
      if (deleted < 500) break
    }
    must(await tools.remove('components', existing.id), 'delete component')
    if (existing.data.status === 'published') await bumpLibraryVersion(tools)
    return { success: true, data: { id: existing.id } }
  })

/**
 * Recount instead of incrementing, so concurrent posts and deletes cannot
 * drift the counter. Best-effort: the post/delete already succeeded, so a
 * failed refresh is logged rather than reported as a failure.
 */
export async function refreshFeedbackCount(tools: ActionTools, componentId: string): Promise<number | null> {
  try {
    // records.query's `count` is the page length, so page through everything.
    const count = (await queryAll(tools, 'feedback', { componentId })).length
    must(await tools.update('components', componentId, { feedbackCount: count }), 'update feedback count')
    await bumpLibraryVersion(tools) // cards show the count
    return count
  } catch (error) {
    console.error('[feedback] count refresh failed:', error instanceof Error ? error.message : error)
    return null
  }
}
