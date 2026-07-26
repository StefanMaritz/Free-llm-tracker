/**
 * POST /api/audits/[id]/run
 *
 * Step 3. Runs ONE prompt and returns. The browser calls this over and over
 * until the audit reports done.
 *
 * Why one at a time instead of a big loop? Serverless functions have a time
 * limit. One prompt across five engines takes 15-40 seconds, which fits
 * comfortably. Fifteen prompts in one request would not. Doing it this way
 * also means the progress bar is real, and a failure only costs you one prompt.
 *
 * The browser runs two of these at once (see TrackerFlow), so the claim below
 * has to be safe against two callers grabbing the same prompt. It is: the
 * UPDATE only succeeds if the row is still 'pending', and Postgres decides the
 * winner. The loser just asks for the next one.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { normalizeWebsite } from '@/lib/tracker/analyze'
import { runPromptReport } from '@/lib/tracker/run-prompt'
import { finalizeAudit } from '@/lib/tracker/finalize'

export const runtime = 'nodejs'
// Vercel caps this by plan. 60s is safe everywhere including Hobby.
export const maxDuration = 60

/** A prompt claimed but never finished (dead request) goes back in the queue. */
const STALE_CLAIM_MS = 5 * 60 * 1000

type Admin = ReturnType<typeof createAdminClient>

interface AuditRow {
  id: string
  brand: string
  website: string | null
  competitors: string[] | null
  status: string
}

async function progressOf(admin: Admin, auditId: string) {
  const { count: total } = await admin
    .from('audit_prompts')
    .select('id', { count: 'exact', head: true })
    .eq('audit_id', auditId)
  const { count: done } = await admin
    .from('audit_prompts')
    .select('id', { count: 'exact', head: true })
    .eq('audit_id', auditId)
    .in('status', ['success', 'error'])
  return { total: total ?? 0, done: done ?? 0 }
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await context.params

  try {
    const admin = createAdminClient()

    const { data } = await admin
      .from('audits')
      .select('id, brand, website, competitors, status')
      .eq('id', id)
      .maybeSingle()

    const audit = data as AuditRow | null
    if (!audit) return NextResponse.json({ error: 'Audit not found.' }, { status: 404 })

    if (audit.status === 'complete') {
      return NextResponse.json({ finished: true, ...(await progressOf(admin, id)) })
    }

    // First caller flips the audit into 'running'.
    await admin.from('audits').update({ status: 'running' }).eq('id', id).eq('status', 'review')

    // Put any abandoned claims back in the queue before we look for work.
    await admin
      .from('audit_prompts')
      .update({ status: 'pending', claimed_at: null })
      .eq('audit_id', id)
      .eq('status', 'running')
      .lt('claimed_at', new Date(Date.now() - STALE_CLAIM_MS).toISOString())

    // --- claim one pending prompt -----------------------------------------
    // Look, then conditionally take. If someone beat us to it the UPDATE
    // matches zero rows and we try the next one.
    let claimed: { id: string; prompt: string; type: string } | null = null

    for (let attempt = 0; attempt < 5 && !claimed; attempt++) {
      const { data: next } = await admin
        .from('audit_prompts')
        .select('id, prompt, type')
        .eq('audit_id', id)
        .eq('status', 'pending')
        .order('idx', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (!next) break

      const row = next as { id: string; prompt: string; type: string }
      const { data: won } = await admin
        .from('audit_prompts')
        .update({ status: 'running', claimed_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('status', 'pending')
        .select('id')

      if (won && won.length > 0) claimed = row
    }

    // --- nothing left to claim --------------------------------------------
    if (!claimed) {
      const { count: inFlight } = await admin
        .from('audit_prompts')
        .select('id', { count: 'exact', head: true })
        .eq('audit_id', id)
        .in('status', ['pending', 'running'])

      if ((inFlight ?? 0) > 0) {
        // Another caller is still working. Tell the browser to wait and re-ask.
        return NextResponse.json({ finished: false, waiting: true, ...(await progressOf(admin, id)) })
      }

      await finalizeAudit(admin, audit)
      return NextResponse.json({ finished: true, ...(await progressOf(admin, id)) })
    }

    // --- run it ------------------------------------------------------------
    try {
      const report = await runPromptReport({
        prompt: claimed.prompt,
        brand: audit.brand,
        website: normalizeWebsite(audit.website),
        competitors: audit.competitors ?? [],
      })
      await admin
        .from('audit_prompts')
        .update({ status: 'success', report, cost_usd: report.totalCostUsd })
        .eq('id', claimed.id)
    } catch (err) {
      await admin
        .from('audit_prompts')
        .update({
          status: 'error',
          error: err instanceof Error ? err.message : 'Prompt run failed',
        })
        .eq('id', claimed.id)
    }

    // Was that the last one?
    const { count: remaining } = await admin
      .from('audit_prompts')
      .select('id', { count: 'exact', head: true })
      .eq('audit_id', id)
      .in('status', ['pending', 'running'])

    if ((remaining ?? 0) === 0) {
      await finalizeAudit(admin, audit)
      return NextResponse.json({ finished: true, ...(await progressOf(admin, id)) })
    }

    return NextResponse.json({ finished: false, prompt: claimed.prompt, ...(await progressOf(admin, id)) })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Run failed.' },
      { status: 500 }
    )
  }
}
