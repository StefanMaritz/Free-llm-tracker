/**
 * Shared types for the LLM mention tracker.
 *
 * The shape of the whole app in one file. Read this first - everything else
 * is just code that fills these objects in.
 *
 * One "audit" = a set of prompts. Each prompt gets fired at every engine.
 * Each answer gets scored. Then it all rolls up into one Aggregate.
 */

export type EngineId = 'chatgpt' | 'claude' | 'gemini' | 'perplexity' | 'grok'

export type Sentiment = 'positive' | 'neutral' | 'negative' | 'not_mentioned'

export type EngineStatus = 'success' | 'empty' | 'error'

/**
 * The three kinds of prompt. This split is the whole point of the tool -
 * each one answers a different question about your visibility.
 *
 *  brand      - "What is Acme?"           Do the models know you, and what do they say?
 *  category   - "Best CRM for startups"   Do you show up when nobody named you?
 *  comparison - "Acme vs Globex"          What do they say when you are put side by side?
 */
export type PromptType = 'brand' | 'category' | 'comparison'

export interface Citation {
  url: string
  domain: string
  /** true when this URL is on the tracked brand's own domain */
  isBrand: boolean
}

export interface BrandCount {
  name: string
  count: number
}

/** One engine's answer to one prompt, plus everything we scored about it. */
export interface EngineResult {
  id: EngineId
  label: string
  /** the model id we actually called, e.g. "openai/gpt-5.3-chat" */
  model: string
  status: EngineStatus
  error?: string

  /** the full answer text, kept so you can read what the model actually said */
  text: string
  latencyMs: number
  /** real billed cost for this call, reported by the AI Gateway */
  costUsd: number

  citations: Citation[]

  // --- scoring ---
  brandMentioned: boolean
  mentionCount: number
  sentiment: Sentiment
  /** 1-based rank of your brand against the other brands named; null if absent */
  position: number | null
  brands: BrandCount[]
  /** your mentions / all brand mentions in this one answer (0..1) */
  shareOfVoice: number
  /** how many of this answer's links point at your own domain */
  brandCitationCount: number
}

export interface BrandStanding {
  name: string
  mentions: number
  /** share of all brand mentions (0..1) */
  share: number
  /** how many engines named this brand */
  engineCount: number
  isBrand: boolean
}

export interface AggregatedUrl {
  url: string
  domain: string
  isBrand: boolean
  engines: EngineId[]
  count: number
}

/** Everything we learned from firing ONE prompt at every engine. */
export interface Report {
  prompt: string
  brand: string
  website: string | null
  competitors: string[]
  createdAt: string

  engines: EngineResult[]

  enginesAnswered: number
  /** engines that named you / engines that answered (0..1) */
  mentionRate: number
  shareOfVoice: number
  /** engines that linked to your site / engines that answered (0..1) */
  citationRate: number
  averagePosition: number | null
  sentimentBreakdown: Record<Sentiment, number>

  brandStandings: BrandStanding[]
  citedUrls: AggregatedUrl[]

  totalCostUsd: number
}

export interface GeneratedPrompt {
  text: string
  type: PromptType
}

/** What the site analyzer works out before you run anything. */
export interface AnalyzeResult {
  brand: string
  website: string | null
  category: string
  audience: string
  competitors: string[]
  prompts: GeneratedPrompt[]
}

/** One prompt inside an audit. */
export interface AuditPromptResult {
  id: string
  idx: number
  text: string
  type: PromptType
  status: 'pending' | 'running' | 'success' | 'error'
  report: Report | null
  error?: string
  costUsd: number
}

export interface EnginePerformance {
  id: EngineId
  label: string
  answered: number
  mentionRate: number
  shareOfVoice: number
  citationRate: number
}

export interface PromptTypePerformance {
  type: PromptType
  prompts: number
  mentionRate: number
  shareOfVoice: number
}

export interface PromptRowSummary {
  id: string
  text: string
  type: PromptType
  answered: number
  mentioned: number
  mentionRate: number
  shareOfVoice: number
  averagePosition: number | null
}

/** The final rollup across every prompt in the audit. */
export interface AuditAggregate {
  totalPrompts: number
  answeredPrompts: number
  mentionRate: number
  shareOfVoice: number
  citationRate: number
  averagePosition: number | null
  sentimentBreakdown: Record<Sentiment, number>
  perEngine: EnginePerformance[]
  perType: PromptTypePerformance[]
  perPrompt: PromptRowSummary[]
  brandStandings: BrandStanding[]
  citedUrls: AggregatedUrl[]
  totalCostUsd: number
}

/** The audit row as the front end sees it. */
export interface AuditSummary {
  id: string
  brand: string
  website: string | null
  competitors: string[]
  status: 'review' | 'running' | 'complete' | 'error'
  totalPrompts: number
  donePrompts: number
  aggregate: AuditAggregate | null
  createdAt: string
}
