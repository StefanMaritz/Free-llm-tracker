# Setup, from nothing

This guide assumes you have never used a terminal, never installed Node, and do not have a GitHub
account. Every step is here. If you already have some of it, skip ahead.

Budget about 40 minutes the first time. Roughly 25 of that is accounts and installs you only ever
do once.

**Total cost:** the tools are free. The AI calls are not. A 15-prompt run costs about 35 cents.

---

## Part 0. The four accounts

Open these in tabs and sign up. Use the same email for all four.

1. **GitHub** - <https://github.com/signup> - stores your code
2. **Vercel** - <https://vercel.com/signup> - hosts the app AND provides the AI Gateway. Sign up
   with your GitHub account, it saves a step later
3. **Supabase** - <https://supabase.com/dashboard/sign-up> - your database. Sign up with GitHub too
4. **Anthropic** (<https://claude.ai>) or **OpenAI** (<https://chatgpt.com>) - only if you want
   Claude Code or Codex to build it with you. Optional

---

## Part 1. Install the two tools

### Git

Git tracks changes to your code and pushes it to GitHub.

- **Windows:** download from <https://git-scm.com/download/win>. Run the installer and click Next
  through everything. The defaults are fine
- **Mac:** open Terminal and type `git --version`. If it is not installed, macOS offers to install
  it. Say yes

### Node.js

Node runs JavaScript on your computer. Next.js needs it.

- Go to <https://nodejs.org>
- Download the **LTS** version (the left button, the one that says "Recommended")
- Run the installer, click through with defaults

### Check both worked

Open your terminal.

- **Windows:** press the Windows key, type `powershell`, hit Enter
- **Mac:** press Cmd+Space, type `terminal`, hit Enter

Type these two commands, pressing Enter after each:

```bash
git --version
node --version
```

You want two version numbers back, something like `git version 2.43.0` and `v22.11.0`. If you get
"command not found", the install did not finish. Reinstall, then **close and reopen the terminal**
(this is the fix 90% of the time).

---

## Part 2. Get the code

### Fork it

"Forking" makes your own copy of the project on GitHub.

1. Go to the project on GitHub
2. Click **Fork** (top right)
3. Click **Create fork**

You now have your own copy at `github.com/YOUR-USERNAME/Free-llm-tracker`.

### Download it to your computer

On your fork, click the green **Code** button and copy the HTTPS URL.

In your terminal:

```bash
cd Desktop
git clone https://github.com/YOUR-USERNAME/Free-llm-tracker.git
cd Free-llm-tracker
```

> `cd` means "change directory". `cd Desktop` walks into your Desktop folder. You are now working
> inside the project.

### Install the project's dependencies

```bash
npm install
```

This downloads the libraries the project needs. Takes about 30 seconds and prints a lot. Warnings
are normal. Errors in red are not.

---

## Part 3. The database (Supabase)

### Create the project

1. Go to <https://supabase.com/dashboard>
2. Click **New project**
3. Name it `llm-tracker`
4. **Generate a database password and save it somewhere.** You will not be shown it again
5. Pick the region closest to you
6. Click **Create new project**

It takes about two minutes to build. Get a coffee.

### Create the tables

1. In the left sidebar, click **SQL Editor**
2. Click **New query**
3. Open the file `supabase/schema.sql` from the project folder (any text editor works)
4. Copy the **whole file**, paste it into the Supabase editor
5. Click **Run** (or press Ctrl+Enter)

You want to see **"Success. No rows returned."** That is what success looks like here.

To confirm: click **Table Editor** in the sidebar. You should see `audits` and `audit_prompts`.

### Get your two keys

1. Click **Project Settings** (the gear, bottom left)
2. Click **API Keys**
3. You need two things:
   - **Project URL** - looks like `https://abcdefgh.supabase.co`
   - The key labelled **secret** - starts with `sb_secret_`

> Older Supabase projects call the secret key the **service_role** key instead. Either works.
>
> **Do not use the publishable key.** It is the other one on that page and it cannot write to your
> tables. This is the single most common thing people get wrong.

---

## Part 4. The AI key (Vercel AI Gateway)

This one key calls ChatGPT, Claude, Gemini, Perplexity, and Grok. Without it you would need five
separate accounts with five separate credit cards.

1. Go to <https://vercel.com/dashboard>
2. Click **AI Gateway** in the top navigation
3. Click **API Keys**
4. Click **Create key**, name it `llm-tracker`
5. Copy it. **You only get shown it once**

Vercel gives you some free credit to start. Once it runs out you add a card and pay per call. Check
the AI Gateway pricing page for the current amount.

---

## Part 5. Wire up your keys

In the project folder there is a file called `.env.example`. Make a copy called `.env.local`.

**Windows PowerShell:**

```powershell
Copy-Item .env.example .env.local
```

**Mac:**

```bash
cp .env.example .env.local
```

Open `.env.local` in any text editor and fill in the three values:

```
AI_GATEWAY_API_KEY=your-vercel-ai-gateway-key
NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
SUPABASE_SECRET_KEY=sb_secret_your-key-here
```

No quotes, no spaces around the `=`.

> **`.env.local` is where secrets live and it is already in `.gitignore`, so it never gets pushed
> to GitHub.** Never paste these keys into a file that does get pushed. Anything starting with
> `NEXT_PUBLIC_` ends up visible in the browser, which is why the secret key does not have that
> prefix.

### Check it before you go further

```bash
npm run smoke
```

This makes one cheap test call to the AI Gateway and one query to Supabase. You want all PASS
lines. If something fails it tells you exactly which key is wrong. Fix it and run again.

Do not skip this. Two minutes here saves you twenty minutes of confusion later.

---

## Part 6. Run it

```bash
npm run dev
```

Open <http://localhost:3000>.

Enter a website you know well (try a competitor, it is more interesting), and click **Generate
prompts**. Review them, then **Run the tracker**.

Watch the terminal while it runs. That is your app talking to five AI models.

To stop the server, press **Ctrl+C** in the terminal.

> **Start small.** Set `TRACKER_PROMPT_COUNT=5` in `.env.local` for your first few runs. Change it
> to 15 or more once you are happy. Restart `npm run dev` after any `.env.local` change - it only
> reads that file on startup.

---

## Part 7. Put it on the internet

### Push your changes to GitHub

```bash
git add .
git commit -m "My LLM tracker"
git push
```

> `add` picks up your changes, `commit` saves a snapshot with a message, `push` sends it to GitHub.
> That is the whole loop, and you will do it hundreds of times.

If Git asks who you are, tell it once:

```bash
git config --global user.email "you@example.com"
git config --global user.name "Your Name"
```

### Deploy on Vercel

1. Go to <https://vercel.com/new>
2. Find your `Free-llm-tracker` repo, click **Import**
3. Before clicking Deploy, open **Environment Variables** and add all three:
   - `AI_GATEWAY_API_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SECRET_KEY`
4. Click **Deploy**

Two minutes later you have a live URL.

**From now on, every `git push` deploys automatically.** That is the whole workflow.

---

## When something breaks

| What you see | What it means | Fix |
|---|---|---|
| `command not found: npm` | Node did not install, or terminal is stale | Reinstall Node, close and reopen the terminal |
| `AI_GATEWAY_API_KEY is not set` | Missing or misnamed key | Check `.env.local`, restart `npm run dev` |
| `permission denied for table audits` | Grants did not run | Re-run the whole `supabase/schema.sql` |
| `relation "audits" does not exist` | Tables were never created | Run `supabase/schema.sql` in the SQL editor |
| Gateway returns `404` on a model | That model id was retired | See the list at <https://ai-gateway.vercel.sh/v1/models>, set the matching `TRACKER_MODEL_*` in `.env.local` |
| Gateway returns `429` | Rate limited | Normal. It retries itself. If it persists, cut `TRACKER_ENGINES` down |
| It works locally, breaks on Vercel | Env vars only exist on your machine | Add all three in Vercel, then redeploy |
| Report page says "Still running" | A prompt is stuck | Wait a minute and refresh. Stuck prompts requeue after 5 minutes |

**The universal first move:** read the actual error text. Then paste it into Claude Code or Codex
and ask what it means. That is not cheating, that is the job now.
