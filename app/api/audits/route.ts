/**
 * POST /api/audits
 *
 * Step 2. The user has reviewed the prompts. Save the audit and its prompt
 * list to the database and hand back an id. Nothing is run yet.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { normalizeWebsite } from '@/lib/tracker/analyze'
import type { PromptType } from '@/lib/tracker/types'

export const runtime = 'nodejs'

const TYPES: PromptType[] = ['brand', 'category', 'comparison']

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      brand?: string
      website?: string
      competitors?: string[]
      prompts?: Array<{ text?: string; type?: string }>
      notifyEmail?: string
      recurring?: boolean
    }

    const brand = body.brand?.trim()
    if (!brand) return NextResponse.json({ error: 'Brand name is required.' }, { status: 400 })

    const prompts = (body.prompts ?? [])
      .map((p) => ({
        text: String(p.text ?? '').trim(),
        type: (TYPES.includes(p.type as PromptType) ? p.type : 'category') as PromptType,
      }))
      .filter((p) => p.text)
      .slice(0, 60)

    if (prompts.length === 0) {
      return NextResponse.json({ error: 'Add at least one prompt.' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: audit, error: auditErr } = await admin
      .from('audits')
      .insert({
        brand,
        website: normalizeWebsite(body.website),
        competitors: (body.competitors ?? []).map((c) => c.trim()).filter(Boolean).slice(0, 12),
        status: 'review',
        total_prompts: prompts.length,
        notify_email: body.notifyEmail?.trim() || null,
        // Marking it recurring makes the weekly cron re-run this exact prompt
        // set. last_run_at starts now so the first repeat is a week away, not
        // on the next cron tick.
        recurring: Boolean(body.recurring),
        last_run_at: body.recurring ? new Date().toISOString() : null,
      })
      .select('id')
      .single()

    if (auditErr || !audit) {
      return NextResponse.json({ error: auditErr?.message ?? 'Could not create audit.' }, { status: 500 })
    }

    const { error: promptErr } = await admin.from('audit_prompts').insert(
      prompts.map((p, idx) => ({
        audit_id: audit.id,
        idx,
        prompt: p.text,
        type: p.type,
        status: 'pending',
      }))
    )

    if (promptErr) {
      // Clean up the orphan so a failed save does not leave a dead audit behind.
      await admin.from('audits').delete().eq('id', audit.id)
      return NextResponse.json({ error: promptErr.message }, { status: 500 })
    }

    return NextResponse.json({ id: audit.id, totalPrompts: prompts.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not create audit.' },
      { status: 500 }
    )
  }
}
