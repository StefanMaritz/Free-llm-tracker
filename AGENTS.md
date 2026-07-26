# Agent instructions

See **[CLAUDE.md](CLAUDE.md)** for the full context. It applies to every coding agent working in
this repo, Codex included.

**If the user asks you to set this project up, open CLAUDE.md and follow "THE SETUP RUNBOOK" at
the top of it, exactly and in order.** It covers checking Node, installing dependencies,
collecting their three keys, writing `.env.local`, creating the database tables, verifying with
`npm run smoke`, and starting the app. Assume the user has never opened a terminal.

Quick version of everything else:

- The audience is marketers, not developers. Explain in plain English first
- `countBrandMentions` in `lib/tracker/analyze.ts` decides whether a brand was mentioned. The
  judge LLM never does. Do not change this
- One prompt per HTTP request. Never batch the audit into a single call
- Never send `response_format: json_object` to the AI Gateway, it 400s on some models
- The Supabase secret key must never get a `NEXT_PUBLIC_` prefix
- No em dashes, no emojis, sentence case headings
- Every run costs real money. Test with `TRACKER_PROMPT_COUNT=3` and
  `TRACKER_ENGINES=chatgpt,claude`
- `npm run smoke` verifies setup, `npm run build` typechecks everything
