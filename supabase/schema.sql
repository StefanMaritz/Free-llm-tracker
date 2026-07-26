-- ===========================================================================
-- LLM TRACKER - DATABASE SCHEMA
--
-- HOW TO RUN THIS:
--   1. Go to https://supabase.com/dashboard and open your project
--   2. Click "SQL Editor" in the left sidebar
--   3. Click "New query"
--   4. Copy this ENTIRE file, paste it in, click "Run"
--   5. You should see "Success. No rows returned". That is correct.
--
-- Safe to run more than once.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- One row per audit. An audit is "check this brand across this set of prompts".
-- ---------------------------------------------------------------------------
create table if not exists public.audits (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  website text,
  competitors text[] not null default '{}',

  -- review   = prompts generated, waiting for the user to press Run
  -- running  = prompts are being fired at the engines right now
  -- complete = every prompt is done and the rollup is saved
  -- error    = something went wrong, see error_message
  status text not null default 'review',

  total_prompts int not null default 0,
  aggregate jsonb,
  total_cost_usd numeric(10, 5),
  error_message text,

  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- ---------------------------------------------------------------------------
-- One row per prompt inside an audit. Kept separate from the audit so a run
-- can be processed a piece at a time instead of rewriting one giant blob.
-- ---------------------------------------------------------------------------
create table if not exists public.audit_prompts (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits (id) on delete cascade,
  idx int not null,
  prompt text not null,

  -- brand | category | comparison
  type text not null,

  -- pending | running | success | error
  status text not null default 'pending',

  -- when this prompt was picked up. If a request dies mid-run the prompt would
  -- be stuck on 'running' forever, so anything claimed too long ago gets put
  -- back in the queue.
  claimed_at timestamptz,

  -- the full Report object: every engine's answer text, scores, and citations
  report jsonb,
  error text,
  cost_usd numeric(10, 5),

  created_at timestamptz not null default now()
);

-- If you created these tables before claimed_at existed, this adds it.
alter table public.audit_prompts add column if not exists claimed_at timestamptz;

create index if not exists audits_created_idx on public.audits (created_at desc);
create index if not exists audit_prompts_audit_idx on public.audit_prompts (audit_id, idx);
create index if not exists audit_prompts_status_idx on public.audit_prompts (audit_id, status);

-- ---------------------------------------------------------------------------
-- PERMISSIONS
--
-- Newer Supabase projects do NOT hand out table permissions automatically, so
-- we grant them explicitly. Without this you get a confusing
-- "permission denied for table audits" (error 42501) even though your key is
-- correct. This line is the single most common reason this app fails to run.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.audits to service_role;
grant select, insert, update, delete on public.audit_prompts to service_role;

-- ---------------------------------------------------------------------------
-- SECURITY
--
-- Row Level Security is ON and there are NO policies. That means: nobody can
-- read or write these tables using a public/publishable key. Every read and
-- write in this app goes through a server-side API route using the secret key,
-- which bypasses RLS.
--
-- The audit's UUID is the share link. Anyone with the link can open the report,
-- which is what you want for sharing a result - but the link is unguessable, so
-- nobody stumbles onto it.
--
-- If you later add user accounts, this is where you would add policies like
-- "users can read their own audits".
-- ---------------------------------------------------------------------------
alter table public.audits enable row level security;
alter table public.audit_prompts enable row level security;
