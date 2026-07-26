# Free LLM Tracker

Find out what ChatGPT, Claude, Gemini, Perplexity, and Grok actually say about your brand.

Point it at a website. It reads the site, works out what the company sells and who it competes
with, writes the questions a real buyer would ask an AI, fires every question at five models, reads
every answer, and reports where you show up and who shows up instead.

Built as a live build session for **The Workflow**. Everything here is real, working code, not a
demo. You can ship it and use it on Monday.

| | |
|---|---|
| **5** | AI models queried |
| **3** | Prompt types |
| **$0.025** | Cost per prompt, all five engines |
| **~20 min** | Zero to your first report |

---

## Quickest start: let Claude set it up for you

You need two free accounts first - **[Vercel](https://vercel.com/signup)** and
**[Supabase](https://supabase.com/dashboard/sign-up)** - plus **[Node.js](https://nodejs.org)**
installed (take the LTS button).

Then get the code, open [Claude Code](https://claude.com/claude-code) or Codex in the folder, and
paste this:

```
Set this project up for me. Follow the setup runbook in CLAUDE.md exactly.

I am not a developer, so explain each step in plain English, do the work
yourself where you can, and tell me exactly what to click where you cannot.
I already have a Vercel account and a Supabase account.
```

That is it. The repo ships a runbook in [CLAUDE.md](CLAUDE.md) that walks the agent through
installing dependencies, collecting your keys, writing your config, setting up the database,
verifying everything works before you spend a cent, and starting the app.

It will ask you for three things - a Vercel AI Gateway key and two values from Supabase - and
handle the rest.

> **Everything runs on your own accounts.** There are no keys in this repo and no shared backend.
> The code reads your keys from a local file and throws an error if they are missing. Nobody else
> can see your data, and nobody else pays for your runs.

> **What it costs.** There is no paywall, no licence, no signup. You pay your AI provider directly
> for the calls you make - about 2.5 cents per prompt across all five models. The runbook starts
> you at 5 prompts, so your first report costs around 12 cents. Set `TRACKER_ENGINES=chatgpt,claude`
> to halve it while you experiment.

Prefer to do it by hand? The [full setup](#setup-from-nothing-to-deployed) is below.

---

## Contents

- [How it actually works](#how-it-actually-works)
- [The three prompt types](#the-three-prompt-types)
- [The one design decision worth stealing](#the-one-design-decision-worth-stealing)
- [Google AI Overviews and AI Mode](#google-ai-overviews-and-ai-mode)
- [The stack](#the-stack)
- [Setup, from nothing to deployed](#setup-from-nothing-to-deployed) - including building it with Claude Code or Codex
- [When it breaks](#when-it-breaks)
- [The code, in reading order](#the-code-in-reading-order)
- [Weekly runs and emailed reports](#weekly-runs-and-emailed-reports)
- [Making it yours](#making-it-yours)

---

## How it actually works

This is the part most people get wrong, so it is worth being blunt about it.

**There is no API that tells you whether ChatGPT recommends your brand.** OpenAI does not publish
it. Neither does Anthropic, Google, Perplexity, or xAI. There is no Search Console for AI answers,
no index you can query, no rank tracker quietly reading the models' minds.

The only honest way to find out what an AI says about you is to **ask it, and read the answer**.
Then ask it again, hundreds of times, across different questions and different models, and count
what comes back.

That is the entire product. Everything else in this repo is plumbing around that one idea.

```
prompt -> "What are the best tools for creating a team wiki?"
             |
   +---------+---------+---------+---------+
   |         |         |         |         |
ChatGPT   Claude    Gemini   Perplexity   Grok
   |         |         |         |         |
   +---------+---------+---------+---------+
             |
   five answers, each scored: were you named, how many
   times, in what tone, ranked where against which
   competitors, and which sources did the model cite
```

The models it queries:

| Engine | Model id |
|---|---|
| ChatGPT | `openai/gpt-5.3-chat` |
| Claude | `anthropic/claude-sonnet-4.6` |
| Gemini | `google/gemini-3-flash` |
| Perplexity | `perplexity/sonar` |
| Grok | `xai/grok-4.1-fast-non-reasoning` |

---

## The three prompt types

Every prompt falls into one of three buckets. They answer completely different questions about your
visibility, and you have to read them separately.

### Brand

> "What is Acme?" &middot; "Is Acme any good for agencies?" &middot; "Acme pricing and reviews"

You by name. This tests whether the models know you exist at all, what they believe about you, and
crucially **where they got that information from** - the cited sources tell you which pages are
shaping your reputation.

It is also where you catch the models being confidently wrong about your pricing, your features, or
your positioning.

**Answers:** do they know me, what do they say, and who told them?

### Category

> "Best CRM for a small agency" &middot; "How do I automate client reporting?" &middot; "Top team wiki tools"

Buying questions where **nobody named you**. This is intent-heavy territory: someone with a problem
and a budget, asking an AI what to do about it.

Showing up here means being recommended when the buyer has never heard of you. It is the hardest of
the three and the one that actually grows pipeline.

**Answers:** am I recommended when nobody asked for me?

### Comparison

> "Acme vs Globex" &middot; "Globex alternatives" &middot; "Which is better for enterprise?"

You directly against a named competitor. The models will happily pick a winner, list your
weaknesses, and tell a buyer who to choose.

This is the most uncomfortable report to read and the most immediately useful. If a model is telling
your prospects a competitor handles your best use case better, you want to know that today.

**Answers:** what gets said when I am put head to head?

### Read them separately, never as one average

The most common result is a strong brand score with a weak category score. That combination means
the models know exactly who you are, and still never bring you up when it counts. It is also the
most expensive problem to leave unmeasured.

---

## The one design decision worth stealing

**Code decides whether you were mentioned. Not the AI.**

It is tempting to hand the whole answer to a model and ask "was this brand mentioned, and how did it
do?" Do not. Judge models hallucinate your brand into answers that never named it. They score
look-alike names as you. They count the brand from the question as if it appeared in the answer.

Every one of those failures makes your numbers *look better* than reality, which is the worst
possible direction for a bug in a measurement tool.

So: a literal word-boundary count in code decides whether you were mentioned. The model only judges
the fuzzy things it is genuinely good at - tone, ranking, and which other brands got named. Use each
for what it is actually good at.

See `countBrandMentions` and `applyJudge` in [`lib/tracker/analyze.ts`](lib/tracker/analyze.ts).

---

## Google AI Overviews and AI Mode

Not covered by the five engines above, and worth understanding why.

Everything this tool queries is reachable through an API. **Google's AI Overviews (the AI snippet
above the results) and AI Mode are not.** They only exist inside a real Google search results page.
There is no endpoint, no model id, nothing to call. The only way to capture them is to fetch an
actual SERP and read what Google rendered.

That means a scraping provider, and the usual choice is **[SerpAPI](https://serpapi.com)**. It is a
separate paid account with its own key, billed per search, on top of your AI Gateway spend.

> **This repo does not ship SerpAPI support.** Adding a key alone will not switch anything on. The
> five engines here are all gateway-based. If Google AI surfaces matter to you, that is a feature
> you (or your agent) build, and the notes below are what you need to know before you start.

If you do add it, three things will bite you:

- **AI Overviews usually arrive in two steps.** A normal `engine=google` search typically returns
  the AI Overview as nothing but a `page_token`. You then make a *second* call to
  `engine=google_ai_overview` with that token to get the text. Budget two searches per query
- **Detection is reliable, text is not.** The presence of that token proves an AI Overview exists,
  even when fetching its content fails. Treat "no text" as "could not retrieve", never as "no AI
  Overview". Getting this backwards silently under-reports your Google visibility
- **AI Mode is its own engine** (`engine=google_ai_mode`) and a separate call again

The honest framing for a client: the five engines here cover the assistants people talk to. Google
AI surfaces are a different measurement problem with a different cost base, and they are worth
adding once the rest is running, not on day one.

[AI-GUIDE.md](AI-GUIDE.md) has a ready-made prompt for building it.

---

## The stack

| Piece | What it does | Why |
|---|---|---|
| **Next.js** | The app and its API in one codebase | The pages you see and the server code that calls the models live in the same project |
| **Supabase** | Postgres database | Free tier, and a SQL editor in the browser. Two tables is all this needs |
| **Vercel AI Gateway** | Calls every model | One key reaches all five providers, instead of five accounts with five cards. It also reports the real cost of every call |
| **Vercel** | Hosting | Connect the repo once. Every push deploys itself |

---

## Setup, from nothing to deployed

Assumes you have never opened a terminal. Roughly 25 minutes of this is accounts and installs you
only ever do once.

You will build this with an AI agent driving, so the agent is set up in step 3 and used from there
on. Every step that benefits from one has the exact prompt to paste.

[SETUP.md](SETUP.md) is the same path with more hand-holding, including Windows and Mac differences.

### 1. Create four accounts

Use the same email for all of them. Sign up to Vercel and Supabase *with* your GitHub account, it
saves steps later.

- **[GitHub](https://github.com/signup)** stores your code
- **[Vercel](https://vercel.com/signup)** hosts the app and gives you the AI Gateway key
- **[Supabase](https://supabase.com/dashboard/sign-up)** is your database
- **Claude or ChatGPT** if you want an AI agent building alongside you. Optional

### 2. Install Git and Node

Git tracks your code and pushes it to GitHub. Node runs the app on your machine. Download Node's
**LTS** version from [nodejs.org](https://nodejs.org), and click through both installers with the
defaults.

Then open a terminal (PowerShell on Windows, Terminal on Mac) and check both landed:

```bash
git --version
node --version
```

Two version numbers back means you are good. "Command not found" usually means you need to close and
reopen the terminal.

### 3. Install your AI agent

You are going to build with Claude Code or Codex from here on, so install one now. Use whichever you
already pay for.

```bash
npm install -g @anthropic-ai/claude-code   # then run: claude
npm install -g @openai/codex               # then run: codex
```

Both do the same job here. First run asks you to log in.

**Four habits that matter more than any prompt:**

1. **One thing at a time.** "Build me an AI visibility platform" gets you slop. "Add a CSV export
   button to the report page" gets you a CSV export button
2. **Make it run before you make it pretty.** Working and ugly beats beautiful and broken
3. **Read the diff.** Agents are confidently wrong sometimes. If you do not understand a change, ask
   before you accept it
4. **Commit whenever something works.** That is your undo button. Use it constantly

And whenever anything below goes wrong, this is the move:

```
Here is the exact error: [paste it]. Explain what it means in plain English,
then tell me the most likely cause before you change any code.
```

### 4. Fork the repo and pull it down

Forking makes your own copy on GitHub. Hit **Fork** at the top of this page, then clone your copy and
install what it needs:

```bash
cd Desktop
git clone https://github.com/YOUR-USERNAME/Free-llm-tracker.git
cd Free-llm-tracker
npm install
```

`cd` means change directory. You are now working inside the project folder. Swap in your own GitHub
username on the clone line.

> Git giving you trouble? There is a `llm-tracker-starter.zip` with the identical project inside.
> Unzip it, `cd` into the folder, run `npm install`, and carry on from step 5.

Now start your agent in that folder (`claude` or `codex`) and get the lay of the land before you
change anything:

```
Read README.md and lib/tracker/types.ts, then explain how this app works in plain
English. I am a marketer, not a developer. Walk me through what happens between me
typing a website and seeing a report.
```

### 5. Create the database

In Supabase, create a new project and **save the database password it generates**. It takes about two
minutes to build.

Then open **SQL Editor**, click New query, paste the entire contents of
[`supabase/schema.sql`](supabase/schema.sql), and hit Run. You want to see
**"Success. No rows returned."**

> That file ends with a set of `GRANT` lines. They are not optional. Newer Supabase projects hand out
> no table permissions by default, and skipping them produces a `permission denied for table audits`
> error that looks exactly like a wrong key.

### 6. Collect three keys

- **AI Gateway key** from the [Vercel dashboard](https://vercel.com/dashboard), under AI Gateway then
  API Keys. You are shown it once
- **Project URL** from Supabase, under Project Settings then API Keys
- **Secret key** from the same page, the one starting `sb_secret_`

> Take the **secret** key, not the publishable one. The publishable key cannot write to your tables,
> and picking the wrong one is the single most common mistake here. Older Supabase projects call the
> secret key `service_role` instead.

### 7. Wire up your keys

Copy `.env.example` to a new file called `.env.local` and fill in the three values. No quotes, no
spaces around the equals sign.

```bash
AI_GATEWAY_API_KEY=your-gateway-key
NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
SUPABASE_SECRET_KEY=sb_secret_your-key
```

> `.env.local` is already git-ignored, so your keys never reach GitHub. Anything named
> `NEXT_PUBLIC_` ends up visible in the browser, which is exactly why the secret key does not carry
> that prefix.

### 8. Check your setup before spending anything

```bash
npm run smoke
```

One cheap test call to the gateway, one query to the database. If a key is wrong it tells you which
one. Two minutes here saves twenty minutes of confusion later.

Anything red, hand it straight to your agent:

```
npm run smoke is failing. Here is the output: [paste it]. Diagnose which key or
step is wrong and tell me exactly what to change.
```

### 9. Run it

```bash
npm run dev
```

Open <http://localhost:3000>, enter a website you know well, and watch the terminal while it runs.
That is your app talking to five AI models.

> Set `TRACKER_PROMPT_COUNT=5` in `.env.local` for your first few runs, then raise it. Restart the
> dev server after any change to that file.

It works. Now change something, while it is still small enough to understand:

```
Walk me through lib/tracker/analyze.ts. I want to understand exactly how it
decides whether my brand was mentioned, and why the code does the counting
instead of the AI.
```

```
Add a "Download CSV" button to the report page that exports the per-prompt
table: prompt text, type, mention rate, share of voice, and average position.
```

Commit the moment it works: `git add . && git commit -m "csv export"`.

### 10. Put it on the internet

```bash
git add .
git commit -m "My LLM tracker"
git push
```

Then import the repo at **[vercel.com/new](https://vercel.com/new)**.

> Before you click Deploy, open **Environment Variables** and add all three keys, set to
> **Production**. Your `.env.local` only exists on your laptop, so without this the site loads but
> every run fails.

From then on, every `git push` deploys automatically. That is the whole workflow.

Stuck on any of it:

```
Walk me through pushing this to GitHub and deploying it on Vercel, including
which environment variables to set. I have a GitHub account and a Vercel account.
```

[AI-GUIDE.md](AI-GUIDE.md) has the full script: prompts for understanding the code, extending it, and
building the whole thing from scratch in eleven steps.

---

## When it breaks

| What you see | What it means | Fix |
|---|---|---|
| `command not found: npm` | Node did not install, or your terminal is stale | Reinstall Node, then close and reopen the terminal |
| `AI_GATEWAY_API_KEY is not set` | Missing or misnamed key | Check `.env.local`, restart `npm run dev` |
| `permission denied for table audits` | The grants never ran | Re-run the whole `supabase/schema.sql` |
| `relation "audits" does not exist` | Tables were never created | Run `supabase/schema.sql` in the SQL editor |
| Gateway returns `404` | That model id was retired. It happens without warning | Check <https://ai-gateway.vercel.sh/v1/models> and set the matching `TRACKER_MODEL_*` in `.env.local` |
| Gateway returns `429` | Rate limited from firing five models at once | Normal. It retries itself. If it persists, cut `TRACKER_ENGINES` down |
| Works locally, breaks live | Your keys only exist on your laptop | Add all three env vars in Vercel, then redeploy |
| Report says "Still running" | A prompt is stuck | Wait a minute and refresh. Stuck prompts requeue after 5 minutes |

**The universal first move:** read the actual error text, then paste it into your agent and ask what
it means. That is not cheating. That is the job now.

---

## The code, in reading order

| File | What it does |
|---|---|
| [`lib/tracker/types.ts`](lib/tracker/types.ts) | Every shape in the app. Read this first |
| [`lib/tracker/gateway.ts`](lib/tracker/gateway.ts) | One fetch call to any model |
| [`lib/tracker/analyzer.ts`](lib/tracker/analyzer.ts) | Website in, prompt set out |
| [`lib/tracker/engines.ts`](lib/tracker/engines.ts) | Asks one engine one question |
| [`lib/tracker/analyze.ts`](lib/tracker/analyze.ts) | Scores an answer. The judge lives here |
| [`lib/tracker/run-prompt.ts`](lib/tracker/run-prompt.ts) | One prompt, all engines, one report |
| [`lib/tracker/aggregate.ts`](lib/tracker/aggregate.ts) | Every report rolled into one picture |
| [`app/api/audits/[id]/run/route.ts`](app/api/audits/%5Bid%5D/run/route.ts) | The queue. Runs one prompt per request |
| [`app/api/cron/weekly/route.ts`](app/api/cron/weekly/route.ts) | The weekly scheduled re-run |
| [`lib/tracker/finalize.ts`](lib/tracker/finalize.ts) | Closing an audit, and the email that follows |
| [`components/TrackerFlow.tsx`](components/TrackerFlow.tsx) | The three-step front end |
| [`components/ReportView.tsx`](components/ReportView.tsx) | The report. No client JavaScript |

---

## Weekly runs and emailed reports

One run is a snapshot. The value is in the trend, so both of these ship built in and both are
optional.

On the review screen, before you run, you can enter an email address and tick **run this same
prompt set every week**. Repeating the *exact same questions* is the point - change the questions
and you are no longer measuring movement, you are measuring two different things.

### Emailing the report

1. Get a free API key at [resend.com](https://resend.com)
2. Add `RESEND_API_KEY` to `.env.local` (and to Vercel for the live site)

That is it. Finish a run with an email filled in and you get the headline numbers, mention rate by
prompt type, who else the models named, and a link to the full report.

> Resend's shared sender only delivers to the address that owns the Resend account. That is usually
> fine, because you are mailing yourself. To send anywhere else, verify a domain in Resend and set
> `EMAIL_FROM` to an address on it.

**Without a Resend key, email is skipped silently and everything else works exactly the same.** No
fourth account required.

### The weekly schedule

[`vercel.json`](vercel.json) already contains the schedule:

```json
{ "crons": [{ "path": "/api/cron/weekly", "schedule": "0 8 * * 1" }] }
```

That is Monday 08:00 UTC. Change the [cron expression](https://crontab.guru) to whatever suits.
Vercel picks it up on your next deploy - nothing to configure in the dashboard.

Add a `CRON_SECRET` env var in Vercel (any random string). Vercel sends it automatically when it
triggers the job, and the route rejects anyone who cannot present it.

Each week the job finds every recurring audit that has not run in six days, clones its prompt set
into a fresh run, and works through it. Finished runs email out if an address was set.

> **Cost is the thing to keep an eye on.** A weekly 15-prompt run is about 35 cents a week, so
> roughly $18 a year per brand you track. Fewer prompts or fewer engines brings it down.

To test it without waiting until Monday, just call it:

```bash
curl http://localhost:3000/api/cron/weekly
```

It reports what it scheduled and how much it got through.

> Serverless functions time out, so the job works to a time budget and then calls itself to carry
> on where it left off. That is what `depth` in the response means. On Vercel's Hobby plan crons
> fire at most once a day, which a weekly schedule sits comfortably inside.

---

## Making it yours

- Feed the cited sources into a content plan, because those pages are what shape the answers
- Add a step that reads the answers you lost and writes back what the winners had that you did not
- Chart mention rate over time by reading the linked weekly runs (`parent_audit_id`)
- Track several brands in one account

The tracker is not the point. Knowing what to fix is.

---

## Contributions

This is a teaching repo, kept deliberately small and readable. Issues and pull requests are turned
off by design.

**Fork it and make it yours** - that is what it is for. Your fork is yours completely: change
anything, break anything, ship it under your own name.

If you build something good on top of it, share it in The Workflow community.

---

## Licence

MIT. Do whatever you want with it.
