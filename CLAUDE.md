# Context for AI coding agents

This file is read automatically by Claude Code. `AGENTS.md` points here for Codex and other
agents. Keep them in sync.

## What this project is

An LLM brand visibility tracker. It sends prompts to five AI models, reads the answers, and
measures whether a brand gets mentioned, how it is described, and which sources the models cite.

Built as a teaching project for a workshop audience of **marketers, not developers**. That shapes
every decision below.

## Who you are talking to

Assume the person running you is a smart marketer with little or no coding background.

- Explain in plain English before you explain in code
- Say what a change does and what it might break
- Never assume they know what a serverless function, a migration, or an env var is
- If they paste an error, diagnose it before you touch anything

## Stack

- Next.js 16, App Router, TypeScript
- Tailwind v4 (config lives in `app/globals.css` under `@theme`, there is no tailwind.config file)
- Supabase Postgres, accessed only server-side with the secret key
- Vercel AI Gateway for every model call

## Architecture

```
app/page.tsx           -> components/TrackerFlow.tsx   three-step client flow
app/a/[id]/page.tsx    -> components/ReportView.tsx    server-rendered report
app/api/analyze        website -> brand profile + prompts (nothing saved)
app/api/audits         save a reviewed prompt set
app/api/audits/[id]    status + progress
app/api/audits/[id]/run  runs exactly ONE prompt, called in a loop by the browser
lib/tracker/*          all the real logic, no framework code
```

## Rules that are not up for debate

**1. Code counts mentions, the model does not.**
`countBrandMentions` in `lib/tracker/analyze.ts` is a literal word-boundary regex and it is the
only source of truth for "was the brand mentioned". The judge LLM handles sentiment, position, and
the competitor list, nothing more. Judges hallucinate the brand, score look-alike names, and count
the brand from the question. Every one of those failures inflates the numbers, which is the worst
way for this tool to be wrong. Do not "simplify" this by trusting the judge.

**2. One prompt per HTTP request.**
Serverless functions time out. `maxDuration = 60` is set for Hobby-plan safety. Never batch the
whole audit into one request.

**3. The claim has to be race-safe.**
The browser runs two run-loops at once. Claiming works by conditional UPDATE (`.eq('status',
'pending')`) so Postgres picks the winner. Do not replace it with a plain read-then-write.

**4. Never send `response_format: json_object` to the gateway.**
It returns HTTP 400 for several models. Ask for JSON in the prompt and parse defensively with
`stripToJson`.

**5. The secret key never reaches the browser.**
No `NEXT_PUBLIC_` prefix on it, ever. Database access happens in API routes and server components
only.

**6. Model ids get retired.**
When an engine 404s, check <https://ai-gateway.vercel.sh/v1/models> for the current id rather than
guessing. Every engine is env-overridable via `TRACKER_MODEL_*`.

## Writing style for anything user-facing

Applies to UI copy, docs, and comments.

- No em dashes. Use a spaced hyphen instead
- No emojis, anywhere
- Sentence case for headings, never title case
- Short sentences. Say the thing, then stop
- Comments explain **why**, not what. The code already says what

## Cost

Every run spends real money. About $0.025 per prompt across all five engines.

- Default `TRACKER_PROMPT_COUNT` is 15, roughly 35 cents a run
- When testing, tell the user to set `TRACKER_PROMPT_COUNT=3` and
  `TRACKER_ENGINES=chatgpt,claude`
- Never trigger a full run just to check a UI change

## Verifying

`npm run smoke` checks both keys and the database before anything expensive runs. Point people at
it whenever setup seems wrong.

Prefer `npm run build` over guessing. It typechecks the whole project.
