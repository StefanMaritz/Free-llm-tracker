/**
 * Finishing an audit: build the rollup and mark it complete.
 *
 * Shared by the browser-driven run loop and the weekly cron, so a scheduled run
 * and a manual run produce exactly the same result. If these ever diverge, your
 * week-on-week trend is comparing two different things.
 */
import { createAdminClient } from '@/lib/supabase'
import { normalizeWebsite } from './analyze'
import { aggregateAudit } from './aggregate'
import type { AuditPromptResult, PromptType, Report } from './types'

type Admin = ReturnType<typeof createAdminClient>

export interface FinalizableAudit {
  id: string
  brand: string
  website: string | null
}

interface PromptRow {
  id: string
  idx: number
  prompt: string
  type: string
  status: string
  report: Report | null
  error: string | null
  cost_usd: number | null
}

/**
 * Roll every prompt up into the audit and mark it complete.
 *
 * The status flip to 'finalizing' is the lock: only the caller that wins it
 * proceeds. Without it, two workers finishing the last two prompts at the same
 * moment would both aggregate and both write a result.
 *
 * Returns true if this caller did the finalising.
 */
export async function finalizeAudit(admin: Admin, audit: FinalizableAudit): Promise<boolean> {
  const { data: lock } = await admin
    .from('audits')
    .update({ status: 'finalizing' })
    .eq('id', audit.id)
    .in('status', ['running', 'review'])
    .select('id')

  if (!lock || lock.length === 0) return false

  const { data } = await admin
    .from('audit_prompts')
    .select('id, idx, prompt, type, status, report, error, cost_usd')
    .eq('audit_id', audit.id)
    .order('idx', { ascending: true })

  const results: AuditPromptResult[] = ((data ?? []) as PromptRow[]).map((r) => ({
    id: r.id,
    idx: r.idx,
    text: r.prompt,
    type: (r.type as PromptType) ?? 'category',
    status: r.status === 'success' ? 'success' : 'error',
    report: r.report,
    error: r.error ?? undefined,
    costUsd: r.cost_usd ?? 0,
  }))

  const aggregate = aggregateAudit(audit.brand, normalizeWebsite(audit.website), results)

  await admin
    .from('audits')
    .update({
      status: 'complete',
      aggregate,
      total_cost_usd: aggregate.totalCostUsd,
      completed_at: new Date().toISOString(),
    })
    .eq('id', audit.id)

  return true
}
