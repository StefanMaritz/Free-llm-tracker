/**
 * Vercel AI Gateway client.
 *
 * This is the trick that makes the whole project small: ONE endpoint and ONE
 * API key gets you every model. You pass a model id like
 * "anthropic/claude-sonnet-4.6" or "openai/gpt-5.3-chat" and the gateway
 * routes it. No five separate SDKs, no five separate billing accounts.
 *
 * It speaks the OpenAI chat-completions format, so it is a plain fetch call.
 * It also returns the real billed cost per call in `usage.cost`, which is how
 * the app can show you exactly what a run cost.
 */

const GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1/chat/completions'
const TIMEOUT_MS = 120_000

export interface GatewayMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface GatewayResult {
  text: string
  /** real billed cost in USD for this call (0 if the gateway omitted it) */
  costUsd: number
  inputTokens: number
  outputTokens: number
}

export function getGatewayKey(): string {
  const key = process.env.AI_GATEWAY_API_KEY
  if (!key) {
    throw new Error('AI_GATEWAY_API_KEY is not set. Add it to .env.local (see .env.example).')
  }
  return key
}

// Rate limits (429) and temporary server errors (5xx) get retried with a
// growing wait. Firing five engines at once bursts the gateway's limiter, so
// without this you would randomly lose engines mid-run.
const MAX_ATTEMPTS = 4
const BACKOFF_MS = [2000, 5000, 10000]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function callGateway(
  model: string,
  messages: GatewayMessage[],
  opts: { maxTokens?: number } = {}
): Promise<GatewayResult> {
  // Note: we deliberately do NOT send `response_format: json_object`. The
  // gateway rejects it (HTTP 400) for several models. Where we need JSON we
  // ask for it in the prompt and parse defensively instead.
  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: opts.maxTokens ?? 1200,
  }

  let lastDetail = ''
  let lastStatus = 0

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getGatewayKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (res.ok) {
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>
        usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number }
      }
      const rawContent = data.choices?.[0]?.message?.content
      const text = typeof rawContent === 'string' ? rawContent : ''
      const usage = data.usage ?? {}
      return {
        text,
        costUsd: typeof usage.cost === 'number' ? usage.cost : 0,
        inputTokens: usage.prompt_tokens ?? 0,
        outputTokens: usage.completion_tokens ?? 0,
      }
    }

    lastStatus = res.status
    lastDetail = (await res.text().catch(() => '')).slice(0, 300)

    const retryable = res.status === 429 || res.status >= 500
    if (!retryable || attempt === MAX_ATTEMPTS - 1) break

    const retryAfter = Number(res.headers.get('retry-after'))
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : BACKOFF_MS[attempt]
    await sleep(waitMs)
  }

  throw new Error(`Gateway ${model} returned ${lastStatus}: ${lastDetail}`)
}
