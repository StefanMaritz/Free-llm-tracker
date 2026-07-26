/**
 * GET /api/cron/weekly - the scheduled run.
 *
 * Vercel calls this on the schedule in vercel.json. It does two jobs:
 *
 *   1. Any recurring audit that has not run in the last 6 days gets its prompt
 *      set cloned into a fresh audit. Same questions, new answers - which is the
 *      only way a week-on-week comparison means anything.
 *   2. Drain pending prompts until the time budget runs out.
 *
 * Serverless functions have a hard timeout, so instead of trying to do
 * everything in one invocation we work to a budget and then call ourselves
 * again to carry on. `depth` stops that chain running away.
 *
 * You can also hit this by hand to test it - see the README.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { normalizeWebsite } from '@/lib/tracker/analyze'
import { runPromptReport } from '@/lib/tracker/run-prompt'
import { finalizeAudit } from '@/lib/tracker/finalize'
import { getAppUrl } from '@/lib/env'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Stop claiming new work with this much time left, so the last one can finish. */
const TIME_BUDGET_MS = 240_000
/** How many times the run may hand off to itself before giving up. */
const MAX_DEPTH = 8
/** A recurring audit is due once it is this old. Six days, not seven, so a
 *  weekly cron never skips a week by drifting a few minutes late. */
const DUE_AFTER_DAYS = 6

type Admin = ReturnType<typeof createAdminClient>

interface AuditRow {
  id: string
  brand: string
  website: string | null
  competitors: string[] | null
}

/** Clone every recurring audit that is due into a fresh, queued audit. */
async function scheduleDueRuns(admin: Admin): Promise<number> {
  const cutoff = new Date(Date.now() - DUE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data } = await admin
    .from('audits')
    .select('id, brand, website, competitors, last_run_at, created_at')
    .eq('recurring', true)
    .or(`last_run_at.is.null,last_run_at.lt.${cutoff}`)

  const due = (data ?? []) as Array<AuditRow & { last_run_at: string | null }>
  let created = 0

  for (const parent of due) {
    // Claim it first. Stamping last_run_at up front means a retry (or an
    // overlapping invocation) will not queue the same week twice.
    const { data: claim } = await admin
      .from('audits')
      .update({ last_run_at: new Date().toISOString() })
      .eq('id', parent.id)
      .eq('recurring', true)
      .or(`last_run_at.is.null,last_run_at.lt.${cutoff}`)
      .select('id')

    if (!claim || claim.length === 0) continue

    const { data: prompts } = await admin
      .from('audit_prompts')
      .select('idx, prompt, type')
      .eq('audit_id', parent.id)
      .order('idx', { ascending: true })

    const rows = (prompts ?? []) as Array<{ idx: number; prompt: string; type: string }>
    if (rows.length === 0) continue

    const { data: child } = await admin
      .from('audits')
      .insert({
        brand: parent.brand,
        website: parent.website,
        competitors: parent.competitors ?? [],
        status: 'running',
        total_prompts: rows.length,
        parent_audit_id: parent.id,
        recurring: false, // only the parent carries the schedule
      })
      .select('id')
      .single()

    if (!child) continue

    await admin.from('audit_prompts').insert(
      rows.map((r) => ({
        audit_id: child.id,
        idx: r.idx,
        prompt: r.prompt,
        type: r.type,
        status: 'pending',
      }))
    )
    created++
  }

  return created
}

/** Work through pending prompts until the budget runs out. */
async function drain(admin: Admin, startedAt: number): Promise<{ ran: number; remaining: number }> {
  let ran = 0

  while (Date.now() - startedAt < TIME_BUDGET_MS) {
    const { data: next } = await admin
      .from('audit_prompts')
      .select('id, audit_id, prompt')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!next) break

    const row = next as { id: string; audit_id: string; prompt: string }

    // Same conditional claim as the browser loop: only the caller whose UPDATE
    // matches a still-pending row gets to run it.
    const { data: won } = await admin
      .from('audit_prompts')
      .update({ status: 'running', claimed_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id')

    if (!won || won.length === 0) continue

    const { data: auditData } = await admin
      .from('audits')
      .select('id, brand, website, competitors')
      .eq('id', row.audit_id)
      .maybeSingle()
    const audit = auditData as AuditRow | null
    if (!audit) continue

    try {
      const report = await runPromptReport({
        prompt: row.prompt,
        brand: audit.brand,
        website: normalizeWebsite(audit.website),
        competitors: audit.competitors ?? [],
      })
      await admin
        .from('audit_prompts')
        .update({ status: 'success', report, cost_usd: report.totalCostUsd })
        .eq('id', row.id)
    } catch (err) {
      await admin
        .from('audit_prompts')
        .update({ status: 'error', error: err instanceof Error ? err.message : 'Prompt run failed' })
        .eq('id', row.id)
    }
    ran++

    // Finish the audit as soon as its last prompt lands, rather than waiting
    // for the whole queue to empty.
    const { count: left } = await admin
      .from('audit_prompts')
      .select('id', { count: 'exact', head: true })
      .eq('audit_id', audit.id)
      .in('status', ['pending', 'running'])

    if ((left ?? 0) === 0) await finalizeAudit(admin, audit)
  }

  const { count: remaining } = await admin
    .from('audit_prompts')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')

  return { ran, remaining: remaining ?? 0 }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Vercel sends this header automatically when CRON_SECRET is set. Without the
  // secret set the route is open, which is fine locally but not in production.
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const depth = Number(new URL(request.url).searchParams.get('depth') ?? '0')

  try {
    const admin = createAdminClient()

    // Only the first call in a chain schedules new work.
    const scheduled = depth === 0 ? await scheduleDueRuns(admin) : 0
    const { ran, remaining } = await drain(admin, startedAt)

    // Still work left and budget to spare: hand off to a fresh invocation.
    // Deliberately not awaited - we want this response to return now.
    if (remaining > 0 && depth < MAX_DEPTH) {
      const url = `${getAppUrl().replace(/\/$/, '')}/api/cron/weekly?depth=${depth + 1}`
      void fetch(url, {
        headers: secret ? { authorization: `Bearer ${secret}` } : {},
      }).catch(() => {})
    }

    return NextResponse.json({
      scheduled,
      ran,
      remaining,
      depth,
      tookMs: Date.now() - startedAt,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Cron failed.' },
      { status: 500 }
    )
  }
}
