# Building this with Claude Code or Codex

Two ways to use this repo:

- **Clone it and change it.** Fastest way to a working tracker
- **Build it yourself with an AI agent driving.** Slower, but you actually learn the thing

This guide covers both. Every block below is meant to be copied and pasted straight in.

---

## Install the agent

### Claude Code

```bash
npm install -g @anthropic-ai/claude-code
```

Then, inside the project folder:

```bash
claude
```

First run asks you to log in with your Anthropic account. Needs a Claude subscription or API
credit.

### Codex

```bash
npm install -g @openai/codex
```

Then:

```bash
codex
```

Log in with your ChatGPT account.

Both do the same job here. Use whichever you already pay for.

---

## The rules that make agents useful

Four habits, and they matter more than any prompt below.

1. **One thing at a time.** "Build me an AI visibility platform" gets you slop. "Add a CSV export
   button to the report page" gets you a CSV export button
2. **Make it run before you make it pretty.** Working and ugly beats beautiful and broken
3. **Read the diff.** Agents are confidently wrong sometimes. If you do not understand a change,
   ask before you accept it
4. **Commit whenever something works.** `git add . && git commit -m "works"` is your undo button.
   Use it constantly

---

## Path A. You cloned the repo

### Understand it first

```
Read README.md and lib/tracker/types.ts, then explain how this app works in plain
English. I am a marketer, not a developer. Walk me through what happens between me
typing a website and seeing a report.
```

```
Walk me through lib/tracker/analyze.ts. I want to understand exactly how it decides
whether my brand was mentioned, and why the code does the counting instead of the AI.
```

### Get it running

```
Help me get this running locally. I have already created my Supabase project and my
Vercel AI Gateway key. Check my setup, tell me exactly what to put in .env.local, and
run the smoke test. If anything fails, diagnose it.
```

### Then make it yours

Pick one. Do not do all five at once.

```
Add a "Download CSV" button to the report page that exports the per-prompt table:
prompt text, type, mention rate, share of voice, and average position.
```

```
Add a history page at /history listing every audit ever run, newest first, showing
brand, date, prompt count, and mention rate, each linking to its report.
```

```
After an audit finishes, add a step that reads the answers where my brand was NOT
mentioned, works out which sources those answers cited instead, and writes three
concrete recommendations. Show them at the top of the report.
```

```
Let me re-run an existing audit with the same prompts, then show mention rate and
share of voice for this run versus the previous one, with the change in each.
```

```
Restyle the report page. Keep it black, white, and grey, keep it minimal, but make the
headline numbers hit harder and make it feel designed rather than defaulted.
```

### Adding Google AI Overviews and AI Mode

Bigger than the rest, and it needs a paid SerpAPI account on top of your gateway key. See the
README section on this before you start.

```
Add Google AI Overviews and Google AI Mode as two extra engines, using SerpAPI.
They are not gateway models, so they need their own runner rather than
callGateway. Read SERPAPI_KEY from the environment and skip both engines
cleanly when it is not set, so the app still works for people without a key.

Three things to get right:

1. A normal engine=google search usually returns the AI Overview as only a
   page_token. Getting the text needs a SECOND call to
   engine=google_ai_overview with that token. Handle both calls.
2. The presence of that token means an AI Overview EXISTS even if fetching the
   text fails. Record "detected but unavailable" - never record it as "no AI
   Overview", because that silently under-reports visibility.
3. Google AI Mode is a separate engine: engine=google_ai_mode.

Feed the retrieved text through the same judge and scoring path as the other
engines so the report treats them consistently, and make sure the per-engine
cost reflects SerpAPI search credits, not gateway token cost.
```

---

## Path B. Build it from scratch

Do this if you want to understand it rather than just own it. Run the prompts in order. Each one
builds on the last. Check it works before moving on.

### 1. Scaffold

```
Create a new Next.js 16 app with TypeScript, the App Router, and Tailwind v4. No src
directory. Then add @supabase/supabase-js. Do not write any features yet - I just want
a clean project that runs with npm run dev.
```

### 2. The gateway

```
I want to call ChatGPT, Claude, Gemini, Perplexity, and Grok through the Vercel AI
Gateway using one API key. It is OpenAI-compatible, at
https://ai-gateway.vercel.sh/v1/chat/completions, and model ids look like
"anthropic/claude-sonnet-4.6".

Write lib/tracker/gateway.ts exporting one callGateway(model, messages, opts) function
that returns the text plus the real cost from usage.cost. Retry on 429 and 5xx with
backoff, because firing five models at once gets rate limited.

Do NOT send response_format json_object - the gateway rejects it for some models.
```

Test it before moving on:

```
Write a throwaway script that calls the gateway once with openai/gpt-4o-mini and prints
the reply and the cost. Run it so I can see it working.
```

### 3. Prompt generation

```
Write lib/tracker/analyzer.ts. It takes a website URL, fetches the homepage, strips it
to text, and makes ONE cheap LLM call that returns JSON with: brand name, category,
audience, competitors, and a set of prompts.

Prompts must be split into three types:
- "brand": about the company by name (about 20%)
- "category": unbranded buying questions that never name the brand (about 50%)
- "comparison": head-to-head and alternatives, naming competitors (about 30%)

Make the count configurable via TRACKER_PROMPT_COUNT, default 15. If the homepage
fetch fails, still generate from the domain name rather than erroring.
```

### 4. Asking the engines

```
Write lib/tracker/engines.ts with five engines - ChatGPT, Claude, Gemini, Perplexity,
Grok - each with a model id overridable by env var. Export runEngine(def, prompt,
brandDomain) that asks one engine one question and returns the answer text, latency,
cost, and any URLs found in the text.

The system prompt should tell it to answer like it would for a real user and to name
companies explicitly and include source URLs.

runEngine must never throw. A failed engine is a result with status "error".
```

### 5. Scoring, and the part everyone gets wrong

```
Write lib/tracker/analyze.ts to score an answer. Two layers:

1. Code decides whether my brand was mentioned, using a literal word-boundary regex
   count of the brand name and the root of its domain.
2. A cheap LLM judge returns JSON for the fuzzy parts: sentiment toward my brand,
   my 1-based rank against other brands, and EVERY other brand named in the answer.

Critically: the judge must NOT be trusted on whether I was mentioned. It hallucinates
my brand, it scores look-alike names as me, and it counts the brand from the question
as an answer mention. Code wins on mention counting, the judge only handles tone,
position, and the competitor list. Reconcile the two in an applyJudge function.

Also handle: parse the JSON defensively since models wrap it in code fences, and fall
back to a literal substring check if the judge call fails entirely.
```

### 6. Wire one prompt end to end

```
Write lib/tracker/run-prompt.ts: fire one prompt at every engine in parallel, judge
every answer in parallel, then aggregate into a single report with mention rate, share
of voice, citation rate, average position, a brand leaderboard, and all cited URLs.

Then write a script that runs it against notion.so with a real category prompt, and run
it so I can see the numbers.
```

Stop here and actually look at the output. This is the moment the project becomes real.

### 7. Database

```
I want to save audits. Write supabase/schema.sql with two tables: audits (brand,
website, competitors, status, total_prompts, aggregate jsonb, cost) and audit_prompts
(audit_id, idx, prompt, type, status, report jsonb, error, cost, claimed_at).

Enable RLS with no policies - all access is server-side with the secret key. Include
explicit GRANTs to service_role, because newer Supabase projects do not grant table
permissions automatically and you get error 42501 without them.

Then write lib/supabase.ts with a server-only admin client that accepts either
SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.
```

### 8. The queue

```
Add these API routes:
- POST /api/analyze - website in, brand profile and prompts out, nothing saved
- POST /api/audits - save a reviewed prompt set, return the audit id
- GET /api/audits/[id] - status and progress
- POST /api/audits/[id]/run - run exactly ONE prompt and return

The run route matters. Serverless functions time out, so one request does one prompt.
The browser calls it in a loop. Two calls run at once, so claiming a prompt must be
safe against two callers grabbing the same row: select the next pending one, then
UPDATE it only if it is still pending, and if that matches zero rows try the next.

When no prompts are left, aggregate everything and mark the audit complete - guarded so
two simultaneous finishers cannot both write.

Also requeue any prompt stuck on "running" for more than 5 minutes.
```

### 9. The front end

```
Build a three-step flow in one client component: setup (enter website, competitors,
focus themes), review (edit, add, delete, retype the generated prompts), and running (a
progress bar driven by calling the run route in a loop with two parallel workers).

When it finishes, go to /a/[id].

Style it minimalist: black, white, grey, lots of whitespace, no rounded corners, one
accent-free palette. It should look deliberate, not like a default template.
```

### 10. The report

```
Build /a/[id] as a server component that loads the audit and renders: headline numbers,
a breakdown by prompt type with an explanation of what each type means, a per-engine
table, a brand leaderboard with bars, the cited sources, and every prompt expandable to
read each model's raw answer. Use native <details> so it needs no client JavaScript.
```

### 11. Ship it

```
Walk me through pushing this to GitHub and deploying it on Vercel, including which
environment variables to set. I have a GitHub account and a Vercel account.
```

---

## Prompts worth keeping

For when something breaks:

```
Here is the exact error: [paste it]. Explain what it means in plain English, then tell
me the most likely cause before you change any code.
```

For when you do not trust it:

```
You just changed [file]. Explain what that change does and why, then tell me what could
break because of it.
```

For when it goes off the rails:

```
Stop. Revert to the last working state. We are doing one thing at a time. The only
thing I want right now is [one specific thing].
```

For when it works:

```
Commit this with a clear message.
```
