# Agent instructions

See **[CLAUDE.md](CLAUDE.md)** for the full context. It applies to every coding agent working in
this repo, Codex included.

Quick version:

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
