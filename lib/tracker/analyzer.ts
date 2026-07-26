/**
 * Site analyzer: turn a URL into a prompt set.
 *
 * We fetch the homepage, work out what the company is, who it sells to and who
 * it competes with, then write the prompts a real buyer would actually type.
 *
 * The split matters more than the count:
 *   brand      - do the models know you, and what do they say?
 *   category   - do you show up when nobody named you? (this is the hard one)
 *   comparison - what gets said when you are put next to a competitor?
 *
 * The homepage fetch is best effort. If the site blocks us we still generate
 * from the domain name alone rather than failing the whole run.
 */
import { callGateway } from './gateway'
import { normalizeWebsite, stripToJson } from './analyze'
import type { AnalyzeResult, GeneratedPrompt, PromptType } from './types'

const ANALYZER_MODEL = process.env.TRACKER_MODEL_ANALYZER ?? 'openai/gpt-4o-mini'
const FETCH_TIMEOUT_MS = 15_000
const MAX_HOMEPAGE_CHARS = 6000

/** Default 15 keeps a run at roughly $0.10-$0.30. Raise it once it works. */
const TARGET_PROMPTS = Math.min(60, Math.max(3, Number(process.env.TRACKER_PROMPT_COUNT ?? '15')))

const TYPES: PromptType[] = ['brand', 'category', 'comparison']

/** Crude but dependency-free HTML to text: drop script/style, strip tags. */
function htmlToText(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return [
    titleMatch ? `TITLE: ${titleMatch[1].trim()}` : '',
    descMatch ? `DESCRIPTION: ${descMatch[1].trim()}` : '',
    body,
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_HOMEPAGE_CHARS)
}

async function fetchHomepage(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LlmTrackerBot/1.0)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    })
    if (!res.ok) return ''
    return htmlToText(await res.text())
  } catch {
    return ''
  }
}

function clampType(t: unknown): PromptType {
  return TYPES.includes(t as PromptType) ? (t as PromptType) : 'category'
}

export async function analyzeSite(
  rawUrl: string,
  userCompetitors: string[] = [],
  focusThemes = ''
): Promise<AnalyzeResult> {
  const website = normalizeWebsite(rawUrl)
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`
  const homepage = await fetchHomepage(url)
  const seeded = userCompetitors.map((c) => c.trim()).filter(Boolean).slice(0, 12)
  const themes = focusThemes.trim().slice(0, 400)

  // Roughly 20% brand, 50% category, 30% comparison. Category gets the most
  // because unbranded intent is where visibility is actually won or lost.
  const nBrand = Math.max(1, Math.round(TARGET_PROMPTS * 0.2))
  const nComparison = Math.max(1, Math.round(TARGET_PROMPTS * 0.3))
  const nCategory = Math.max(1, TARGET_PROMPTS - nBrand - nComparison)

  const system =
    'You are a brand visibility analyst. From a company website you infer what the brand is, ' +
    'its category, who it sells to, and its main competitors - then write the prompts a real ' +
    'person would type into ChatGPT / Perplexity that this brand would want to show up in. ' +
    'Return ONLY raw JSON (no markdown, no code fences).'

  const user = [
    `WEBSITE: ${website ?? rawUrl}`,
    homepage
      ? `\nHOMEPAGE CONTENT:\n"""\n${homepage}\n"""`
      : `\n(Homepage content could not be fetched - infer from the domain name.)`,
    `\nReturn JSON with exactly these keys:`,
    `{`,
    `  "brand": string,                 // the brand/company name`,
    `  "category": string,              // the product category, e.g. "AI content marketing platform"`,
    `  "audience": string,              // who they sell to`,
    `  "competitors": string[],         // 3-8 real, named competitors`,
    `  "prompts": [ { "text": string, "type": "brand" | "category" | "comparison" } ]`,
    `}`,
    `\nGenerate exactly ${TARGET_PROMPTS} prompts a buyer would realistically ask an AI assistant:`,
    `- ${nBrand} "brand": directly about this brand (what it is, is it any good, pricing, reviews, is it right for X).`,
    `- ${nCategory} "category": UNBRANDED buying questions where the brand would want to appear`,
    `  (e.g. "best X tools for Y", "how do I do Z") - do NOT name the brand in these.`,
    `- ${nComparison} "comparison": head-to-head and alternatives, naming competitors`,
    `  (e.g. "X vs <competitor>", "<competitor> alternatives", "who is better for Y").`,
    seeded.length
      ? `\nThe user especially wants to track these competitors: ${seeded.join(', ')}. ` +
        `Include several "comparison" prompts that reference them by brand name (not URL), ` +
        `and treat them as known competitors in the "competitors" array.`
      : '',
    themes
      ? `\nFOCUS THEMES: weight the "category" prompts toward these themes / use cases / ` +
        `sub-topics: ${themes}. Bias most category prompts toward them while keeping the ` +
        `questions natural and how a real buyer would phrase them.`
      : '',
    `\nMake them natural, varied, and specific to this brand's real category. No numbering.`,
  ]
    .filter(Boolean)
    .join('\n')

  let parsed: {
    brand?: string
    category?: string
    audience?: string
    competitors?: unknown
    prompts?: Array<{ text?: string; type?: string }>
  } = {}

  try {
    const res = await callGateway(
      ANALYZER_MODEL,
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { maxTokens: 3000 }
    )
    parsed = JSON.parse(stripToJson(res.text))
  } catch (err) {
    throw new Error(`Could not analyze the website. ${err instanceof Error ? err.message : 'Try again.'}`)
  }

  const seen = new Set<string>()
  const prompts: GeneratedPrompt[] = (parsed.prompts ?? [])
    .map((p) => ({ text: String(p.text ?? '').trim(), type: clampType(p.type) }))
    .filter((p) => {
      const key = p.text.toLowerCase()
      if (!p.text || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, TARGET_PROMPTS)

  const modelCompetitors = Array.isArray(parsed.competitors)
    ? parsed.competitors.map((c) => String(c).trim()).filter(Boolean)
    : []
  // Competitors the user typed win, then the model's, deduped.
  const seenComp = new Set<string>()
  const competitors = [...seeded, ...modelCompetitors]
    .filter((c) => {
      const key = c.toLowerCase()
      if (seenComp.has(key)) return false
      seenComp.add(key)
      return true
    })
    .slice(0, 12)

  return {
    brand: String(parsed.brand ?? '').trim() || (website ?? rawUrl),
    website,
    category: String(parsed.category ?? '').trim(),
    audience: String(parsed.audience ?? '').trim(),
    competitors,
    prompts,
  }
}
