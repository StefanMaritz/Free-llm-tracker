/**
 * The rollup. Takes every prompt's Report and combines them into the single
 * picture you actually look at: overall mention rate, share of voice, who is
 * beating you, which engines are worst, and which prompt type you are weakest
 * on.
 *
 * Note that every rate is measured per ANSWER, not per prompt. 15 prompts at 5
 * engines is 75 answers, and "mentioned in 30 of 75 answers" is the honest
 * number.
 */
import { isTrackedBrand, normName } from './analyze'
import type {
  AggregatedUrl,
  AuditAggregate,
  AuditPromptResult,
  BrandStanding,
  EngineId,
  EnginePerformance,
  EngineResult,
  PromptRowSummary,
  PromptType,
  PromptTypePerformance,
  Sentiment,
} from './types'

interface Answer {
  promptId: string
  type: PromptType
  engine: EngineResult
}

export function aggregateAudit(
  brand: string,
  brandDomain: string | null,
  prompts: AuditPromptResult[]
): AuditAggregate {
  const done = prompts.filter((p) => p.report)
  const answers: Answer[] = []
  for (const p of done) {
    for (const e of p.report!.engines) {
      if (e.status === 'success') answers.push({ promptId: p.id, type: p.type, engine: e })
    }
  }

  const totalAnswers = answers.length || 1
  const mentionRate = answers.filter((a) => a.engine.brandMentioned).length / totalAnswers
  const citationRate = answers.filter((a) => a.engine.brandCitationCount > 0).length / totalAnswers

  const positions = answers.map((a) => a.engine.position).filter((p): p is number => p != null)
  const averagePosition = positions.length
    ? Math.round((positions.reduce((a, b) => a + b, 0) / positions.length) * 10) / 10
    : null

  const sentimentBreakdown: Record<Sentiment, number> = {
    positive: 0,
    neutral: 0,
    negative: 0,
    not_mentioned: 0,
  }
  for (const a of answers) sentimentBreakdown[a.engine.sentiment]++

  // Share of voice + the leaderboard, from raw mention counts across every answer.
  let totalAll = 0
  let totalBrand = 0
  const standingMap = new Map<string, { name: string; mentions: number; engines: Set<string>; isBrand: boolean }>()
  for (const a of answers) {
    for (const b of a.engine.brands) {
      totalAll += b.count
      const tracked = isTrackedBrand(b.name, brand, brandDomain)
      if (tracked) totalBrand += b.count
      const key = normName(b.name) || b.name.toLowerCase()
      const existing = standingMap.get(key)
      if (existing) {
        existing.mentions += b.count
        existing.engines.add(a.engine.id)
        existing.isBrand = existing.isBrand || tracked
      } else {
        standingMap.set(key, { name: b.name, mentions: b.count, engines: new Set([a.engine.id]), isBrand: tracked })
      }
    }
  }
  const shareOfVoice = totalAll > 0 ? totalBrand / totalAll : 0
  const brandStandings: BrandStanding[] = Array.from(standingMap.values())
    .map((s) => ({
      name: s.name,
      mentions: s.mentions,
      share: totalAll > 0 ? s.mentions / totalAll : 0,
      engineCount: s.engines.size,
      isBrand: s.isBrand,
    }))
    .sort((a, b) => (a.isBrand === b.isBrand ? b.mentions - a.mentions : a.isBrand ? -1 : 1))

  // Per engine. Tells you WHERE you are invisible.
  const engineMap = new Map<
    EngineId,
    { label: string; answered: number; mentioned: number; citing: number; brand: number; all: number }
  >()
  for (const a of answers) {
    const e = a.engine
    const cur = engineMap.get(e.id) ?? { label: e.label, answered: 0, mentioned: 0, citing: 0, brand: 0, all: 0 }
    cur.answered++
    if (e.brandMentioned) cur.mentioned++
    if (e.brandCitationCount > 0) cur.citing++
    for (const b of e.brands) {
      cur.all += b.count
      if (isTrackedBrand(b.name, brand, brandDomain)) cur.brand += b.count
    }
    engineMap.set(e.id, cur)
  }
  const perEngine: EnginePerformance[] = Array.from(engineMap.entries())
    .map(([id, v]) => ({
      id,
      label: v.label,
      answered: v.answered,
      mentionRate: v.answered ? v.mentioned / v.answered : 0,
      shareOfVoice: v.all ? v.brand / v.all : 0,
      citationRate: v.answered ? v.citing / v.answered : 0,
    }))
    .sort((a, b) => b.mentionRate - a.mentionRate)

  // Per prompt type. Tells you WHAT KIND of visibility you are missing.
  const TYPES: PromptType[] = ['brand', 'category', 'comparison']
  const perType: PromptTypePerformance[] = TYPES.map((type) => {
    const typeAnswers = answers.filter((x) => x.type === type)
    const promptIds = new Set(done.filter((p) => p.type === type).map((p) => p.id))
    let allCount = 0
    let brandCount = 0
    for (const x of typeAnswers) {
      for (const b of x.engine.brands) {
        allCount += b.count
        if (isTrackedBrand(b.name, brand, brandDomain)) brandCount += b.count
      }
    }
    return {
      type,
      prompts: promptIds.size,
      mentionRate: typeAnswers.length
        ? typeAnswers.filter((x) => x.engine.brandMentioned).length / typeAnswers.length
        : 0,
      shareOfVoice: allCount > 0 ? brandCount / allCount : 0,
    }
  }).filter((t) => t.prompts > 0)

  // Per prompt, so you can find the exact questions you lose.
  const perPrompt: PromptRowSummary[] = done.map((p) => {
    const r = p.report!
    const mentioned = r.engines.filter((e) => e.status === 'success' && e.brandMentioned).length
    return {
      id: p.id,
      text: p.text,
      type: p.type,
      answered: r.enginesAnswered,
      mentioned,
      mentionRate: r.mentionRate,
      shareOfVoice: r.shareOfVoice,
      averagePosition: r.averagePosition,
    }
  })

  // Every source the models cited, merged. This is your "where do they get it from".
  const urlMap = new Map<string, AggregatedUrl>()
  for (const p of done) {
    for (const u of p.report!.citedUrls) {
      const existing = urlMap.get(u.url)
      if (existing) {
        existing.count += u.count
        for (const id of u.engines) if (!existing.engines.includes(id)) existing.engines.push(id)
      } else {
        urlMap.set(u.url, { ...u, engines: [...u.engines] })
      }
    }
  }
  const citedUrls = Array.from(urlMap.values()).sort(
    (a, b) => Number(b.isBrand) - Number(a.isBrand) || b.engines.length - a.engines.length || b.count - a.count
  )

  return {
    totalPrompts: prompts.length,
    answeredPrompts: done.length,
    mentionRate: answers.length ? mentionRate : 0,
    shareOfVoice,
    citationRate: answers.length ? citationRate : 0,
    averagePosition,
    sentimentBreakdown,
    perEngine,
    perType,
    perPrompt,
    brandStandings,
    citedUrls,
    totalCostUsd: prompts.reduce((sum, p) => sum + (p.costUsd || 0), 0),
  }
}
