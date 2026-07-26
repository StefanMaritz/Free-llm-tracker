/**
 * The engines we ask, and how we ask them.
 *
 * There is no API that tells you "does ChatGPT mention my brand". The only way
 * to find out is to actually send the prompt and read the answer. That is what
 * this file does.
 *
 * Every engine is a current flagship-tier chat model from a different provider,
 * so the answers approximate what a real person sees. Non-reasoning variants
 * are used where available so the model returns visible answer text rather than
 * hidden thinking, and so cost stays predictable.
 */
import { callGateway } from './gateway'
import { extractUrls, makeCitation } from './analyze'
import type { EngineId, EngineResult } from './types'

export interface EngineDef {
  id: EngineId
  label: string
  model: string
}

const ALL_ENGINES: EngineDef[] = [
  { id: 'chatgpt', label: 'ChatGPT', model: process.env.TRACKER_MODEL_CHATGPT ?? 'openai/gpt-5.3-chat' },
  { id: 'claude', label: 'Claude', model: process.env.TRACKER_MODEL_CLAUDE ?? 'anthropic/claude-sonnet-4.6' },
  { id: 'gemini', label: 'Gemini', model: process.env.TRACKER_MODEL_GEMINI ?? 'google/gemini-3-flash' },
  { id: 'perplexity', label: 'Perplexity', model: process.env.TRACKER_MODEL_PERPLEXITY ?? 'perplexity/sonar' },
  { id: 'grok', label: 'Grok', model: process.env.TRACKER_MODEL_GROK ?? 'xai/grok-4.1-fast-non-reasoning' },
]

/**
 * Set TRACKER_ENGINES=chatgpt,claude to run fewer engines (cheaper while you
 * are building). Unset means all five.
 */
export function getEngines(): EngineDef[] {
  const raw = process.env.TRACKER_ENGINES?.trim()
  if (!raw) return ALL_ENGINES
  const wanted = new Set(raw.split(',').map((s) => s.trim().toLowerCase()))
  const picked = ALL_ENGINES.filter((e) => wanted.has(e.id))
  return picked.length ? picked : ALL_ENGINES
}

/**
 * Answer like you would for a real user. We explicitly ask the model to name
 * companies and include source URLs, because "which brands did it name" and
 * "where did it get that" are the two things we are measuring.
 */
const SYSTEM_PROMPT =
  'You are a knowledgeable assistant answering a user question, exactly as you would for a real user. ' +
  'Give a direct, useful answer. When you reference specific companies, products, or tools, name them explicitly. ' +
  'When you know authoritative source URLs, include the full https links inline.'

function emptyResult(def: EngineDef): EngineResult {
  return {
    id: def.id,
    label: def.label,
    model: def.model,
    status: 'error',
    text: '',
    latencyMs: 0,
    costUsd: 0,
    citations: [],
    brandMentioned: false,
    mentionCount: 0,
    sentiment: 'not_mentioned',
    position: null,
    brands: [],
    shareOfVoice: 0,
    brandCitationCount: 0,
  }
}

/** Ask one engine one prompt. Never throws - a failed engine is a result too. */
export async function runEngine(
  def: EngineDef,
  prompt: string,
  brandDomain: string | null
): Promise<EngineResult> {
  const result = emptyResult(def)
  const start = Date.now()

  try {
    const out = await callGateway(
      def.model,
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      { maxTokens: 6000 }
    )
    result.text = out.text.trim()
    result.costUsd = out.costUsd
    result.status = result.text ? 'success' : 'empty'
    result.citations = extractUrls(result.text).map((u) => makeCitation(u, brandDomain))
  } catch (err) {
    result.status = 'error'
    result.error = err instanceof Error ? err.message : 'Engine failed'
  }

  result.latencyMs = Date.now() - start
  return result
}
