'use client'

/**
 * The whole front end, in three steps.
 *
 *   1. setup    - enter a website, we work out the brand and write the prompts
 *   2. review   - edit / add / delete prompts before spending money on them
 *   3. running  - fire them at the engines, then redirect to the report
 *
 * The running step is worth understanding: the browser calls /run in a loop.
 * Each call does exactly one prompt. Two loops run side by side so it finishes
 * roughly twice as fast without hammering the AI Gateway's rate limits.
 */

import { useCallback, useRef, useState } from 'react'
import type { AnalyzeResult, GeneratedPrompt, PromptType } from '@/lib/tracker/types'

type Step = 'setup' | 'review' | 'running'

const TYPE_LABEL: Record<PromptType, string> = {
  brand: 'Brand',
  category: 'Category',
  comparison: 'Comparison',
}

const TYPE_HELP: Record<PromptType, string> = {
  brand: 'Do the models know you, and what do they say?',
  category: 'Do you show up when nobody named you?',
  comparison: 'What gets said when you are put next to a rival?',
}

/** How many /run calls to keep in flight at once. */
const PARALLEL = 2

export default function TrackerFlow() {
  const [step, setStep] = useState<Step>('setup')
  const [error, setError] = useState('')

  // step 1
  const [website, setWebsite] = useState('')
  const [competitorText, setCompetitorText] = useState('')
  const [focusThemes, setFocusThemes] = useState('')
  const [analyzing, setAnalyzing] = useState(false)

  // step 2
  const [profile, setProfile] = useState<AnalyzeResult | null>(null)
  const [prompts, setPrompts] = useState<GeneratedPrompt[]>([])

  // step 2 - optional weekly repeat
  const [recurring, setRecurring] = useState(false)

  // step 3
  const [auditId, setAuditId] = useState('')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const cancelled = useRef(false)

  // --- step 1: analyze ------------------------------------------------------
  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setAnalyzing(true)
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          website,
          competitors: competitorText.split(',').map((c) => c.trim()).filter(Boolean),
          focusThemes,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Analysis failed.')

      const result = data as AnalyzeResult
      setProfile(result)
      setPrompts(result.prompts)
      setStep('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed.')
    } finally {
      setAnalyzing(false)
    }
  }

  // --- step 3: the run loop -------------------------------------------------
  const drain = useCallback(async (id: string) => {
    // Each worker asks for the next prompt until the server says it is finished.
    async function worker() {
      while (!cancelled.current) {
        const res = await fetch(`/api/audits/${id}/run`, { method: 'POST' })
        const data = (await res.json()) as {
          error?: string
          finished?: boolean
          waiting?: boolean
          done?: number
          total?: number
        }

        if (!res.ok) {
          // Stop the sibling worker too, otherwise it keeps calling after we bail.
          cancelled.current = true
          throw new Error(data.error ?? 'Run failed.')
        }

        setProgress({ done: data.done ?? 0, total: data.total ?? 0 })

        if (data.finished) return
        // Another worker holds the last prompt - pause briefly, then re-ask.
        if (data.waiting) await new Promise((r) => setTimeout(r, 1500))
      }
    }

    await Promise.all(Array.from({ length: PARALLEL }, () => worker()))
  }, [])

  async function handleRun() {
    setError('')
    setStep('running')
    cancelled.current = false
    try {
      const res = await fetch('/api/audits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: profile?.brand,
          website: profile?.website ?? website,
          competitors: profile?.competitors ?? [],
          prompts,
          recurring,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not start the run.')

      setAuditId(data.id)
      setProgress({ done: 0, total: data.totalPrompts })

      await drain(data.id)
      window.location.href = `/a/${data.id}`
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Run failed.')
      setStep('review')
    }
  }

  // --- prompt editing -------------------------------------------------------
  function updatePrompt(i: number, patch: Partial<GeneratedPrompt>) {
    setPrompts((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  }
  function removePrompt(i: number) {
    setPrompts((prev) => prev.filter((_, idx) => idx !== i))
  }
  function addPrompt(type: PromptType) {
    setPrompts((prev) => [...prev, { text: '', type }])
  }

  const counts = prompts.reduce(
    (acc, p) => ({ ...acc, [p.type]: (acc[p.type] ?? 0) + 1 }),
    {} as Record<PromptType, number>
  )

  // =========================================================================

  if (step === 'setup') {
    return (
      <div className="max-w-2xl">
        <h1 className="mb-3 text-3xl font-semibold tracking-tight">
          Find out what AI says about your brand
        </h1>
        <p className="mb-10 text-muted">
          There is no dashboard that tells you this. The only way to know is to ask the models
          directly, hundreds of times, and count the answers. That is all this tool does.
        </p>

        <form onSubmit={handleAnalyze} className="space-y-6">
          <div>
            <label className="label mb-2 block">Website</label>
            <input
              className="field"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="notion.so"
              required
            />
          </div>

          <div>
            <label className="label mb-2 block">Competitors (optional, comma separated)</label>
            <input
              className="field"
              value={competitorText}
              onChange={(e) => setCompetitorText(e.target.value)}
              placeholder="Coda, Obsidian, Confluence"
            />
            <p className="mt-2 text-sm text-muted">
              Leave blank and we will work them out from the site.
            </p>
          </div>

          <div>
            <label className="label mb-2 block">Focus themes (optional)</label>
            <input
              className="field"
              value={focusThemes}
              onChange={(e) => setFocusThemes(e.target.value)}
              placeholder="team wikis, meeting notes"
            />
            <p className="mt-2 text-sm text-muted">
              Push the category prompts toward the topics you actually care about.
            </p>
          </div>

          {error && <p className="border border-ink px-4 py-3 text-sm">{error}</p>}

          <button className="btn" disabled={analyzing}>
            {analyzing ? 'Reading the site...' : 'Generate prompts'}
          </button>
        </form>
      </div>
    )
  }

  if (step === 'review') {
    return (
      <div>
        <div className="mb-10 grid gap-6 border border-line p-6 sm:grid-cols-2">
          <div>
            <p className="label mb-1">Brand</p>
            <p className="font-medium">{profile?.brand}</p>
          </div>
          <div>
            <p className="label mb-1">Category</p>
            <p className="font-medium">{profile?.category || '-'}</p>
          </div>
          <div>
            <p className="label mb-1">Audience</p>
            <p className="text-sm">{profile?.audience || '-'}</p>
          </div>
          <div>
            <p className="label mb-1">Competitors we will watch</p>
            <p className="text-sm">{profile?.competitors.join(', ') || '-'}</p>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Review the prompts</h2>
            <p className="mt-1 text-sm text-muted">
              You know your buyers better than the model does. Fix anything that does not sound
              like a real question someone would type.
            </p>
          </div>
          <p className="label">{prompts.length} prompts</p>
        </div>

        <div className="mb-8 grid gap-px border border-line bg-line sm:grid-cols-3">
          {(['brand', 'category', 'comparison'] as PromptType[]).map((t) => (
            <div key={t} className="bg-paper p-4">
              <p className="label mb-1">
                {TYPE_LABEL[t]} &middot; {counts[t] ?? 0}
              </p>
              <p className="text-sm text-muted">{TYPE_HELP[t]}</p>
            </div>
          ))}
        </div>

        <ul className="mb-8 divide-y divide-line border-y border-line">
          {prompts.map((p, i) => (
            <li key={i} className="flex items-center gap-3 py-2">
              <select
                className="field w-36 shrink-0 border-0 font-mono text-xs uppercase tracking-wider"
                value={p.type}
                onChange={(e) => updatePrompt(i, { type: e.target.value as PromptType })}
              >
                <option value="brand">Brand</option>
                <option value="category">Category</option>
                <option value="comparison">Comparison</option>
              </select>
              <input
                className="field border-0"
                value={p.text}
                onChange={(e) => updatePrompt(i, { text: e.target.value })}
                placeholder="Type the question a buyer would ask"
              />
              <button
                type="button"
                onClick={() => removePrompt(i)}
                className="shrink-0 px-2 text-muted hover:text-ink"
                aria-label="Remove prompt"
              >
                &times;
              </button>
            </li>
          ))}
        </ul>

        <div className="mb-10 flex flex-wrap gap-2">
          {(['brand', 'category', 'comparison'] as PromptType[]).map((t) => (
            <button key={t} type="button" className="btn btn-ghost" onClick={() => addPrompt(t)}>
              + {TYPE_LABEL[t]} prompt
            </button>
          ))}
        </div>

        <div className="mb-10 border border-line p-6">
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
            />
            <span>
              Run this same prompt set every week
              <span className="mt-1 block text-muted">
                One run is a snapshot. Repeating the exact same questions is what turns it into a
                trend you can act on. Costs the same as this run, once a week. Only runs once
                deployed.
              </span>
            </span>
          </label>
        </div>

        {error && <p className="mb-6 border border-ink px-4 py-3 text-sm">{error}</p>}

        <div className="flex flex-wrap items-center gap-4">
          <button className="btn" onClick={handleRun} disabled={prompts.length === 0}>
            Run the tracker
          </button>
          <button className="btn btn-ghost" onClick={() => setStep('setup')}>
            Back
          </button>
          <p className="text-sm text-muted">
            {prompts.length} prompts across every engine. Takes a few minutes.
          </p>
        </div>
      </div>
    )
  }

  // step === 'running'
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0

  // Show the full link rather than the path, so it is obviously bookmarkable.
  // On a deployed app this is your Vercel URL; locally it is localhost. Both
  // read the same database, so a run started on your laptop opens on the live
  // site at the same address once you deploy.
  const reportUrl =
    typeof window === 'undefined' ? `/a/${auditId}` : `${window.location.origin}/a/${auditId}`

  return (
    <div className="max-w-2xl">
      <h2 className="mb-3 text-2xl font-semibold tracking-tight">Running</h2>
      <p className="mb-8 text-muted">
        Every prompt is being sent to every engine, and every answer is being read and scored.
        Keep this tab open.
      </p>

      <div className="mb-3 h-px w-full bg-line">
        <div className="h-px bg-ink transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="label">
        {progress.done} of {progress.total} prompts &middot; {pct}%
      </p>

      {auditId && (
        <div className="mt-8 text-sm text-muted">
          <p className="mb-2">
            Bookmark your report link. It keeps working after this finishes, and if you turned on
            weekly runs, every future run appears on this same page as a trend.
          </p>
          <a className="break-all font-mono text-xs underline" href={`/a/${auditId}`}>
            {reportUrl}
          </a>
        </div>
      )}

      {error && <p className="mt-6 border border-ink px-4 py-3 text-sm">{error}</p>}
    </div>
  )
}
