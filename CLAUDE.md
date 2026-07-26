# Context for AI coding agents

This file is read automatically by Claude Code. `AGENTS.md` points here for Codex and other
agents. Keep them in sync.

---

# THE SETUP RUNBOOK

**If the user asks you to set this up, get it running, or says anything like "set this up for
me" - follow this runbook exactly, top to bottom. Do not improvise the order.**

Assume the user is a marketer who has never opened a terminal. They have already created a Vercel
account and a Supabase account. Everything else is your job.

Work one step at a time. After each step, say what you did in one plain sentence and what is
happening next. Never dump a wall of instructions on them.

### Step 1 - check the machine

Run `node --version`. Node 20 or newer is required.

If Node is missing or too old, stop and tell them to install the LTS build from nodejs.org, then
close and reopen the terminal. Do not continue until `node --version` prints a number.

### Step 2 - install dependencies

Run `npm install` from the project root. It takes about 30 seconds. Warnings are normal, red
errors are not.

### Step 3 - ask for their three values

Ask for all three in ONE message, formatted exactly like this, and wait for their reply:

> I need three things from you. All three are free to get.
>
> **1. Vercel AI Gateway key.** Go to vercel.com/dashboard, click **AI Gateway** in the top nav,
> then **API Keys**, then **Create key**. Copy it - it is only shown once.
>
> **2. Supabase Project URL.** Open your project at supabase.com/dashboard, then
> **Project Settings -> API Keys**. It looks like `https://abcdefgh.supabase.co`.
>
> **3. Supabase secret key.** Same page. Take the one labelled **secret**, starting `sb_secret_`.
> Do NOT give me the publishable key - it cannot write to the database and everything will fail
> later in a confusing way. On older projects this key is called `service_role` instead.
>
> Paste all three and I will wire them up.

Sanity-check what they paste before writing it:

- the URL must look like `https://<something>.supabase.co`
- the secret key must start with `sb_secret_` or be a long JWT starting `eyJ`
- **if they paste something starting `sb_publishable_`, stop and ask again for the secret key.**
  This is the single most common mistake and it produces a misleading error much later

### Step 4 - write .env.local

Create `.env.local` in the project root with exactly these three lines and their values:

```
AI_GATEWAY_API_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SECRET_KEY=...
```

Then tell them: this file stays on their machine, is already git-ignored, and must never be
pasted anywhere public.

Also add `TRACKER_PROMPT_COUNT=5` for now, so their first run costs about 12 cents instead of 35.
Tell them you did this and that they can raise it later.

### Step 5 - create the database tables

You cannot do this one for them - it needs a browser. Give them exactly this:

> Open your Supabase project, click **SQL Editor** in the left sidebar, then **New query**.
> Copy everything out of `supabase/schema.sql` in this project, paste it in, and click **Run**.
> You should see "Success. No rows returned." Tell me when that is done.

If they report an error, read `supabase/schema.sql` and diagnose it. Do not guess.

### Step 6 - verify before spending anything

Run `npm run smoke`.

This checks both keys and the database. Read the output and act on it:

| Output | Cause | What to do |
|---|---|---|
| `AI Gateway returned 401` | bad or mistyped gateway key | ask them to re-copy it |
| `AI Gateway returned 404` | a model id was retired | check https://ai-gateway.vercel.sh/v1/models and set the matching `TRACKER_MODEL_*` in `.env.local` |
| `credit` / `quota` in a 402 or 429 | no credit on their gateway account | tell them to add credit; nothing else will work until they do |
| `audits table does not exist` | step 5 not done or failed | send them back to step 5 |
| `permission denied` / `42501` | the GRANT lines did not run | have them re-run the WHOLE schema.sql, not just part |
| `Supabase rejected your key` | they used the publishable key | ask for the secret key again |

**Do not move on until every line says PASS.** This is the whole point of the step.

### Step 7 - run it

Run `npm run dev` in the background and tell them to open http://localhost:3000.

Walk them through their first run: enter a website they know well, review the generated prompts,
click Run. Tell them it takes a few minutes and costs a few cents, and that the report link keeps
working afterwards.

### Step 8 - offer what is next

Once they have seen a report, offer, and let them pick ONE:

- **deploy it live on Vercel** so it has a real URL, and turn on the weekly schedule
- **turn on emailed reports** - needs a free Resend key, see below
- add a CSV export to the report
- add a history page listing every past run
- change what the prompts ask about

Then stop and wait. Do not start building things they did not ask for.

### Optional - emailed reports

Only if they ask. Both features already exist; there is nothing to build.

1. They get a free API key at resend.com
2. Add `RESEND_API_KEY` to `.env.local`, and to Vercel if they have deployed

Warn them about the one thing that confuses people: Resend's shared sender only delivers to the
address that owns the Resend account. Mailing themselves works immediately; mailing anyone else
needs a verified domain in Resend and `EMAIL_FROM` set to an address on it.

With no key set, email is skipped silently and nothing else changes.

### Optional - the weekly schedule

The schedule already lives in `vercel.json` (Mondays, 08:00 UTC). It only runs once the project is
deployed to Vercel - it does nothing locally.

1. Deploy to Vercel
2. Add a `CRON_SECRET` env var, any random string. Vercel presents it automatically when it
   triggers the job
3. Redeploy

Then tell them to tick "run this same prompt set every week" on the review screen before starting a
run. Point out the cost: a weekly 15-prompt run is roughly $18 a year per brand.

To prove it works without waiting for Monday, run `curl http://localhost:3000/api/cron/weekly` and
read the JSON it returns.

## Runbook rules

- **Never invent a key or a URL.** If you do not have a value, ask for it
- **Never put a real key in any file except `.env.local`**, and never echo a full key back into
  the chat
- **Never run a full audit to test a change.** That costs real money. Use `npm run smoke`
- If a step fails twice, stop and explain plainly what is wrong rather than trying a third fix

---

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
