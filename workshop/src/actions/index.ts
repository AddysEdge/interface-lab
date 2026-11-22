/**
 * Server actions, exposed at POST /api/actions/<name> (see
 * src/server/action-routes.ts). Each handler authorizes explicitly because
 * action tools bypass collection RBAC.
 */
import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { deleteComponent, saveComponent, setComponentStatus } from '../server/components'
import { searchDocs } from '../server/docs'
import { createFeedback, deleteFeedback } from '../server/feedback'
import { reviewComponent } from '../server/review'
import { seedSamples } from '../server/samples'

export const actions: Record<string, ActionHandler<Env>> = {
  saveComponent,
  setComponentStatus,
  deleteComponent,
  createFeedback,
  deleteFeedback,
  reviewComponent,
  searchDocs,
  seedSamples,
}
