/**
 * One prompt, start to finish.
 *
 * This is the heart of the tool and it is only three steps:
 *   1. Fire the prompt at every engine, all at once.
 *   2. Have the judge score every answer, all at once.
 *   3. Roll it up into one Report.
 */
import { getEngines, runEngine } from './engines'
import { applyJudge, buildReport, judgeResponse } from './analyze'
import type { Report } from './types'

export async function runPromptReport(params: {
  prompt: string
  brand: string
  website: string | null
  competitors: string[]
}): Promise<Report> {
  const { prompt, brand, website, competitors } = params

  // 1. Every engine in parallel. runEngine catches its own errors, so one
  //    dead provider does not sink the run.
  const engines = await Promise.all(getEngines().map((def) => runEngine(def, prompt, website)))

  // 2. Judge every answer in parallel, and fold the judge's own cost back in.
  await Promise.all(
    engines.map(async (engine) => {
      if (engine.status !== 'success' || !engine.text.trim()) return
      const judge = await judgeResponse({ prompt, brand, website, competitors, answer: engine.text })
      applyJudge(engine, judge, brand, website)
      engine.costUsd += judge.costUsd
    })
  )

  // 3. Aggregate.
  return buildReport({ prompt, brand, website, competitors, createdAt: new Date().toISOString() }, engines)
}
