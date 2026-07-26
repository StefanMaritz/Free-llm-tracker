/**
 * Scoring. Once an engine has answered, this file works out what the answer
 * actually said about you.
 *
 * Two layers, on purpose:
 *
 *  1. Code decides whether you were mentioned. A literal word-boundary count.
 *     Boring, but it is never wrong.
 *  2. An LLM "judge" decides the fuzzy stuff - tone, ranking, and which OTHER
 *     brands were named. That needs judgement, so a model does it.
 *
 * Do not let the judge decide whether you were mentioned. It hallucinates your
 * brand, it scores look-alike names (a brand called "Notio" credited for every
 * mention of "Notion"), and it counts the brand name from the question as if it
 * had appeared in the answer.
 */
import { callGateway } from './gateway'
import type {
  BrandCount,
  BrandStanding,
  AggregatedUrl,
  Citation,
  EngineResult,
  Report,
  Sentiment,
} from './types'

/** Cheap, reliable model for scoring. It only has to read and return JSON. */
const JUDGE_MODEL = process.env.TRACKER_MODEL_JUDGE ?? 'openai/gpt-4o-mini'

// --- URL + brand helpers --------------------------------------------------

export function toDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

/** Accepts "example.com", "https://example.com/path", "www.example.com". */
export function normalizeWebsite(website?: string | null): string | null {
  if (!website?.trim()) return null
  const raw = website.trim()
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  const domain = toDomain(withProto)
  return domain || null
}

export function isBrandDomain(domain: string, brandDomain: string | null): boolean {
  if (!brandDomain || !domain) return false
  return domain === brandDomain || domain.endsWith(`.${brandDomain}`)
}

const URL_RE = /https?:\/\/[^\s<>()[\]"'`]+/gi

/** Pulls clean, deduped URLs out of free text (trailing punctuation stripped). */
export function extractUrls(text: string): string[] {
  const found = text.match(URL_RE) ?? []
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of found) {
    const cleaned = m.replace(/[.,;:!?)\]}'"]+$/, '')
    if (cleaned && !seen.has(cleaned)) {
      seen.add(cleaned)
      out.push(cleaned)
    }
  }
  return out
}

export function makeCitation(url: string, brandDomain: string | null): Citation {
  const domain = toDomain(url)
  return { url, domain, isBrand: isBrandDomain(domain, brandDomain) }
}

/** Pulls a JSON object out of a model reply that may be fenced or chatty. */
export function stripToJson(raw: string): string {
  let s = raw.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) s = s.slice(first, last + 1)
  return s
}

export function normName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|gmbh|corp|co|company|the)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Pulls a domain out of a brand entry that is itself a url/email/domain. */
function entryDomain(raw: string): string | null {
  const at = raw.includes('@') ? raw.split('@').pop() ?? '' : raw
  const m = at.toLowerCase().match(/([a-z0-9-]+\.)+[a-z]{2,}/)
  return m ? m[0].replace(/^www\./, '') : null
}

/**
 * Is this detected brand name actually YOU?
 *
 * Strict on purpose. Your brand is anchored to the name and website you gave
 * us, not to fuzzy substring matching. Loose matching is how a tracker starts
 * telling a company called "Monza" that it is winning, when every mention the
 * model made was actually of "Monzo".
 */
export function isTrackedBrand(name: string, brand: string, brandDomain?: string | null): boolean {
  const a = normName(name)
  const b = normName(brand)
  if (a && b && a === b) return true
  if (brandDomain) {
    const d = entryDomain(name)
    if (d && (d === brandDomain || d.endsWith(`.${brandDomain}`))) return true
  }
  return false
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The source of truth for "was I mentioned": a literal, word-boundary count.
 * Matches your brand name and, when it is different, the root of your domain
 * (so "linear" counts for "linear.app").
 */
export function countBrandMentions(text: string, brand: string, brandDomain?: string | null): number {
  if (!text) return 0
  const tokens: string[] = []
  const name = brand.trim()
  if (name) tokens.push(name)
  if (brandDomain) {
    const root = brandDomain.split('.')[0]
    if (root && root.length >= 3 && normName(root) !== normName(name)) tokens.push(root)
  }
  let count = 0
  for (const t of tokens) {
    const re = new RegExp(`(?<![A-Za-z0-9])${escapeRegex(t)}(?![A-Za-z0-9])`, 'gi')
    count += (text.match(re) ?? []).length
  }
  return count
}

// --- the judge ------------------------------------------------------------

export interface JudgeOutput {
  brandMentioned: boolean
  mentionCount: number
  sentiment: Sentiment
  position: number | null
  brands: BrandCount[]
  costUsd: number
}

const EMPTY_JUDGE: JudgeOutput = {
  brandMentioned: false,
  mentionCount: 0,
  sentiment: 'not_mentioned',
  position: null,
  brands: [],
  costUsd: 0,
}

export async function judgeResponse(params: {
  prompt: string
  brand: string
  website: string | null
  competitors: string[]
  answer: string
}): Promise<JudgeOutput> {
  const { prompt, brand, website, competitors, answer } = params
  if (!answer.trim()) return EMPTY_JUDGE

  const system =
    'You analyse an AI assistant answer to measure brand visibility. ' +
    'Return ONLY raw JSON (no markdown, no code fences, no prose). ' +
    'Be precise and literal - do not invent mentions that are not in the answer.'

  const user = [
    `USER PROMPT:\n${prompt}`,
    `\nTRACKED BRAND: ${brand}${website ? ` (website: ${website})` : ''}`,
    competitors.length ? `KNOWN COMPETITORS (hint, not exhaustive): ${competitors.join(', ')}` : '',
    `\nASSISTANT ANSWER:\n"""\n${answer.slice(0, 12000)}\n"""`,
    `\nReturn JSON with exactly these keys:`,
    `{`,
    `  "brand_mentioned": boolean,                // is the tracked brand named anywhere (incl. its domain or obvious variants)?`,
    `  "mention_count": integer,                  // how many times the tracked brand is referenced`,
    `  "sentiment": "positive" | "neutral" | "negative" | "not_mentioned",  // tone toward the tracked brand specifically`,
    `  "position": integer | null,                // 1-based rank of the tracked brand vs other brands by order/prominence; null if not mentioned`,
    `  "brands": [ { "name": string, "count": integer } ]  // EVERY distinct company/product/brand named in the answer, including the tracked brand`,
    `}`,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const res = await callGateway(
      JUDGE_MODEL,
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { maxTokens: 800 }
    )

    const parsed = JSON.parse(stripToJson(res.text)) as {
      brand_mentioned?: boolean
      mention_count?: number
      sentiment?: string
      position?: number | null
      brands?: Array<{ name?: string; count?: number }>
    }

    const brands: BrandCount[] = (parsed.brands ?? [])
      .map((b) => ({ name: String(b.name ?? '').trim(), count: Math.max(1, Number(b.count) || 1) }))
      .filter((b) => b.name)

    const sentiment: Sentiment = (['positive', 'neutral', 'negative', 'not_mentioned'] as const).includes(
      parsed.sentiment as Sentiment
    )
      ? (parsed.sentiment as Sentiment)
      : 'not_mentioned'

    return {
      brandMentioned: Boolean(parsed.brand_mentioned),
      mentionCount: Math.max(0, Number(parsed.mention_count) || 0),
      sentiment: parsed.brand_mentioned ? sentiment : 'not_mentioned',
      position:
        parsed.position === null || parsed.position === undefined
          ? null
          : Math.max(1, Number(parsed.position) || 1),
      brands,
      costUsd: res.costUsd,
    }
  } catch {
    // Judge failed. Fall back to a literal check so we still report something.
    const mentioned = answer.toLowerCase().includes(brand.toLowerCase())
    return {
      ...EMPTY_JUDGE,
      brandMentioned: mentioned,
      mentionCount: mentioned ? 1 : 0,
      sentiment: mentioned ? 'neutral' : 'not_mentioned',
      brands: mentioned ? [{ name: brand, count: 1 }] : [],
    }
  }
}

/** Folds the judge's output into one engine result, with code as the referee. */
export function applyJudge(
  engine: EngineResult,
  judge: JudgeOutput,
  brand: string,
  brandDomain?: string | null
): void {
  const literalCount = countBrandMentions(engine.text, brand, brandDomain)
  const mentioned = literalCount > 0

  engine.brandMentioned = mentioned
  engine.mentionCount = literalCount
  engine.sentiment = mentioned ? (judge.sentiment === 'not_mentioned' ? 'neutral' : judge.sentiment) : 'not_mentioned'
  engine.position = mentioned ? judge.position : null

  // Reconcile the brand list against the literal truth: add you back if the
  // judge missed you, strip you out if the judge invented you.
  let brands = judge.brands
  if (mentioned) {
    if (!brands.some((b) => isTrackedBrand(b.name, brand, brandDomain))) {
      brands = [...brands, { name: brand, count: literalCount }]
    }
  } else {
    brands = brands.filter((b) => !isTrackedBrand(b.name, brand, brandDomain))
  }
  engine.brands = brands

  const totalMentions = brands.reduce((sum, b) => sum + b.count, 0)
  const brandMentions = brands
    .filter((b) => isTrackedBrand(b.name, brand, brandDomain))
    .reduce((sum, b) => sum + b.count, 0)

  engine.shareOfVoice = totalMentions > 0 ? brandMentions / totalMentions : 0
  engine.brandCitationCount = engine.citations.filter((c) => c.isBrand).length
}

// --- one prompt, all engines, rolled up -----------------------------------

export function buildReport(
  base: Pick<Report, 'prompt' | 'brand' | 'website' | 'competitors' | 'createdAt'>,
  engines: EngineResult[]
): Report {
  const brand = base.brand
  const answered = engines.filter((e) => e.status === 'success')
  const denom = answered.length || 1

  const mentioned = answered.filter((e) => e.brandMentioned)
  const mentionRate = answered.length ? mentioned.length / denom : 0

  let totalAll = 0
  let totalBrand = 0
  const standingMap = new Map<string, { name: string; mentions: number; engines: Set<string>; isBrand: boolean }>()

  for (const e of answered) {
    for (const b of e.brands) {
      totalAll += b.count
      const key = normName(b.name) || b.name.toLowerCase()
      const tracked = isTrackedBrand(b.name, brand, base.website)
      if (tracked) totalBrand += b.count
      const existing = standingMap.get(key)
      if (existing) {
        existing.mentions += b.count
        existing.engines.add(e.id)
        existing.isBrand = existing.isBrand || tracked
      } else {
        standingMap.set(key, { name: b.name, mentions: b.count, engines: new Set([e.id]), isBrand: tracked })
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

  const citingBrand = answered.filter((e) => e.brandCitationCount > 0)
  const citationRate = answered.length ? citingBrand.length / denom : 0

  const positions = answered.map((e) => e.position).filter((p): p is number => p != null)
  const averagePosition = positions.length
    ? Math.round((positions.reduce((a, b) => a + b, 0) / positions.length) * 10) / 10
    : null

  const sentimentBreakdown: Record<Sentiment, number> = {
    positive: 0,
    neutral: 0,
    negative: 0,
    not_mentioned: 0,
  }
  for (const e of answered) sentimentBreakdown[e.sentiment]++

  const urlMap = new Map<string, AggregatedUrl>()
  for (const e of engines) {
    for (const c of e.citations) {
      const existing = urlMap.get(c.url)
      if (existing) {
        existing.count++
        if (!existing.engines.includes(e.id)) existing.engines.push(e.id)
      } else {
        urlMap.set(c.url, { url: c.url, domain: c.domain, isBrand: c.isBrand, engines: [e.id], count: 1 })
      }
    }
  }
  const citedUrls = Array.from(urlMap.values()).sort(
    (a, b) => Number(b.isBrand) - Number(a.isBrand) || b.engines.length - a.engines.length || b.count - a.count
  )

  return {
    ...base,
    engines,
    enginesAnswered: answered.length,
    mentionRate,
    shareOfVoice,
    citationRate,
    averagePosition,
    sentimentBreakdown,
    brandStandings,
    citedUrls,
    totalCostUsd: engines.reduce((sum, e) => sum + e.costUsd, 0),
  }
}
