/**
 * /a/[id] - the shareable report page.
 *
 * The id is a random UUID, so the link is unguessable but anyone you send it
 * to can open it. No login needed. That is the whole sharing model.
 */
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'
import ReportView from '@/components/ReportView'
import type { AuditAggregate, AuditPromptResult, PromptType, Report } from '@/lib/tracker/types'

export const dynamic = 'force-dynamic'

interface AuditRow {
  id: string
  brand: string
  website: string | null
  status: string
  aggregate: AuditAggregate | null
  created_at: string
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

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient()

  const { data } = await admin
    .from('audits')
    .select('id, brand, website, status, aggregate, created_at')
    .eq('id', id)
    .maybeSingle()

  const audit = data as AuditRow | null
  if (!audit) notFound()

  if (audit.status !== 'complete' || !audit.aggregate) {
    return (
      <div className="max-w-xl">
        <h1 className="mb-3 text-2xl font-semibold tracking-tight">Still running</h1>
        <p className="text-muted">
          This report is not finished yet. Refresh in a minute.
        </p>
        <p className="label mt-6">Status: {audit.status}</p>
      </div>
    )
  }

  // Weekly runs of this audit, oldest first. This is the trend: same questions,
  // asked again, so the numbers are actually comparable. Without email, this is
  // also how you find the runs the cron made while you were not looking - so
  // keep the parent's report link, it is the one worth bookmarking.
  const { data: runData } = await admin
    .from('audits')
    .select('id, created_at, aggregate, status')
    .or(`id.eq.${id},parent_audit_id.eq.${id}`)
    .eq('status', 'complete')
    .order('created_at', { ascending: true })

  const history = ((runData ?? []) as Array<{
    id: string
    created_at: string
    aggregate: AuditAggregate | null
  }>)
    .filter((r) => r.aggregate)
    .map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      mentionRate: r.aggregate!.mentionRate,
      shareOfVoice: r.aggregate!.shareOfVoice,
    }))

  const { data: promptData } = await admin
    .from('audit_prompts')
    .select('id, idx, prompt, type, status, report, error, cost_usd')
    .eq('audit_id', id)
    .order('idx', { ascending: true })

  const prompts: AuditPromptResult[] = ((promptData ?? []) as PromptRow[]).map((r) => ({
    id: r.id,
    idx: r.idx,
    text: r.prompt,
    type: (r.type as PromptType) ?? 'category',
    status: r.status === 'success' ? 'success' : 'error',
    report: r.report,
    error: r.error ?? undefined,
    costUsd: r.cost_usd ?? 0,
  }))

  return (
    <ReportView
      brand={audit.brand}
      website={audit.website}
      createdAt={audit.created_at}
      aggregate={audit.aggregate}
      prompts={prompts}
      history={history}
      currentId={id}
    />
  )
}
