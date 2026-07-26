/**
 * POST /api/analyze
 *
 * Step 1 of the flow. Give it a website, get back a brand profile and a set of
 * suggested prompts. Nothing is saved yet - the user reviews and edits the
 * prompts first, because THEY know their market better than a model does.
 */
import { NextRequest, NextResponse } from 'next/server'
import { analyzeSite } from '@/lib/tracker/analyzer'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      website?: string
      competitors?: string[]
      focusThemes?: string
    }

    const website = body.website?.trim()
    if (!website) {
      return NextResponse.json({ error: 'Enter a website.' }, { status: 400 })
    }

    const result = await analyzeSite(
      website,
      Array.isArray(body.competitors) ? body.competitors : [],
      body.focusThemes ?? ''
    )

    if (result.prompts.length === 0) {
      return NextResponse.json(
        { error: 'Could not generate prompts for that site. Try a different URL.' },
        { status: 502 }
      )
    }

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Analysis failed.' },
      { status: 500 }
    )
  }
}
