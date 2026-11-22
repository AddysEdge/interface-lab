/**
 * Daily quotas for billable or abusable operations.
 *
 * A quota of N is N claimable slots per (subject, day, kind). Claiming writes
 * a `usage` row; the collection's uniqueOn constraint makes each slot
 * claimable once, and the Durable Object applies writes serially, so
 * concurrent requests cannot exceed N.
 */
import type { ActionTools } from 'deepspace/worker'
import { QUOTAS, type QuotaKind } from '../shared/limits'
import { isDuplicate, must, utcDay } from './common'

type UsageKind = QuotaKind | 'feedback'

export async function claimSlot(tools: ActionTools, kind: UsageKind, subject: string, limit: number, day = utcDay()): Promise<boolean> {
  const existing = must(await tools.query('usage', { where: { subject, day, kind }, limit: limit + 1 }), 'read usage')
  let slot = existing.records.length
  for (let attempt = 0; attempt < 5; attempt++) {
    slot += 1
    if (slot > limit) return false
    const created = await tools.create('usage', { subject, day, kind, slot })
    if (created.success) return true
    if (!isDuplicate(created)) must(created, 'claim usage slot')
    // Another request took this slot first; try the next one.
  }
  return false
}

/** Claim a per-user slot and an app-wide slot for an integration call. */
export async function claimIntegrationQuota(tools: ActionTools, kind: 'review' | 'docs', userId: string): Promise<boolean> {
  const quota = QUOTAS[kind]
  if (!(await claimSlot(tools, kind, userId, quota.perUser))) return false
  return claimSlot(tools, kind, '*', quota.global)
}
