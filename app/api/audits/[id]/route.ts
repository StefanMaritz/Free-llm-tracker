/**
 * GET /api/audits/[id]
 *
 * Status + results for one audit. The progress screen polls this, and the
 * report page loads from it.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import type { AuditSummary } from '@/lib/tracker/types'

export const runtime = 'nodejs'

interface AuditRow {
  id: string
  brand: string
  website: string | null
  competitors: string[] | null
  status: string
  total_prompts: number
  aggregate: AuditSummary['aggregate']
  created_at: string
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await context.params

  try {
    const admin = createAdminClient()

    const { data } = await admin
      .from('audits')
      .select('id, brand, website, competitors, status, total_prompts, aggregate, created_at')
      .eq('id', id)
      .maybeSingle()

    const audit = data as AuditRow | null
    if (!audit) return NextResponse.json({ error: 'Audit not found.' }, { status: 404 })

    const { count: done } = await admin
      .from('audit_prompts')
      .select('id', { count: 'exact', head: true })
      .eq('audit_id', id)
      .in('status', ['success', 'error'])

    const summary: AuditSummary = {
      id: audit.id,
      brand: audit.brand,
      website: audit.website,
      competitors: audit.competitors ?? [],
      status: audit.status as AuditSummary['status'],
      totalPrompts: audit.total_prompts,
      donePrompts: done ?? 0,
      aggregate: audit.aggregate,
      createdAt: audit.created_at,
    }

    return NextResponse.json(summary)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not load audit.' },
      { status: 500 }
    )
  }
}
