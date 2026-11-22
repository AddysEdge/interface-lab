/**
 * Feedback visibility follows its component (feedback-schema.ts mirrors the
 * component status into `componentStatus`). Invariant kept by everything here:
 *
 *   a component that is not published never has publicly readable feedback.
 *
 * - Unpublish hides feedback BEFORE flipping the component to draft, then
 *   converges again to catch feedback posted concurrently. Any failure stops
 *   with feedback hidden (fail closed), never exposed.
 * - Publish flips the component first, then reveals. A failure leaves feedback
 *   hidden on a published component, which a retry repairs.
 * - Drains run in batches until nothing is left: there is no item cap.
 * - Every step is idempotent, so retrying the same request repairs a partial run.
 */
import type { ActionTools, QueryActionData } from 'deepspace/worker'
import type { ComponentStatus, FeedbackData } from '../shared/types'
import { getComponent, must, ToolError } from './common'

const BATCH = 200
const MAX_BATCHES = 2_000 // 400k rows: a safety stop for a broken store, not a product limit

type Query = NonNullable<Parameters<ActionTools['query']>[1]>

/**
 * Read every matching record. The room's records.query pages with
 * offset/nextOffset (deepspace/dist/worker.js, tools "records.query"); the
 * ActionTools type does not declare those fields, hence the narrow casts.
 */
export async function queryAll<T extends Record<string, unknown>>(
  tools: ActionTools,
  collection: string,
  where: Record<string, unknown>,
  pageSize = 500,
): Promise<QueryActionData<T>['records']> {
  const records: QueryActionData<T>['records'] = []
  let offset = 0
  for (let page = 0; page < MAX_BATCHES; page++) {
    const result = must(await tools.query<T>(collection, { where, limit: pageSize, offset } as Query), `read ${collection}`)
    records.push(...result.records)
    const nextOffset = (result as { nextOffset?: number }).nextOffset
    if (nextOffset === undefined || result.records.length === 0) return records
    offset = nextOffset
  }
  throw new ToolError(`read ${collection}: too many pages`)
}

/** Move every feedback row of a component from one visibility to the other. */
async function drain(tools: ActionTools, componentId: string, from: ComponentStatus, to: ComponentStatus): Promise<number> {
  let moved = 0
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    // Rows leave the result set as they are updated, so each pass sees the remainder.
    const result = must(
      await tools.query<FeedbackData & Record<string, unknown>>('feedback', {
        where: { componentId, componentStatus: from },
        limit: BATCH,
      }),
      'load feedback visibility',
    )
    if (result.records.length === 0) return moved
    for (const record of result.records) {
      must(await tools.update('feedback', record.recordId, { componentStatus: to }), 'update feedback visibility')
      moved += 1
    }
  }
  throw new ToolError('feedback visibility did not converge')
}

export function hideFeedback(tools: ActionTools, componentId: string) {
  return drain(tools, componentId, 'published', 'draft')
}

/**
 * Make feedback match the component's CURRENT status, re-reading it after each
 * pass so a concurrent publish/unpublish is honoured (the latest status wins).
 * A missing component counts as unpublished.
 */
export async function convergeFeedbackVisibility(tools: ActionTools, componentId: string): Promise<void> {
  for (let round = 0; round < 5; round++) {
    const status = (await getComponent(tools, componentId))?.data.status ?? 'draft'
    if (status === 'published') await drain(tools, componentId, 'draft', 'published')
    else await hideFeedback(tools, componentId)
    const after = (await getComponent(tools, componentId))?.data.status ?? 'draft'
    if (after === status) return
  }
  // The status kept changing underneath us: fail closed and report it.
  await hideFeedback(tools, componentId)
  throw new ToolError('component status kept changing while syncing feedback visibility')
}
