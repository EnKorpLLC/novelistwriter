-- Audiobook studio A4a: narrator accounts, invites, and agreements.
-- Run after migration_audiobook_export.sql. Safe to run again.

-- Free narrator accounts: a role like is_beta_reader
alter table public.profiles add column if not exists is_narrator boolean not null default false;

create table if not exists public.narrator_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  -- Filled in when the narrator accepts
  narrator_id uuid references auth.users(id) on delete set null,
  invite_email text not null,
  invite_token text not null unique,
  narrator_name text not null default '',
  status text not null default 'invited' check (status in ('invited', 'active', 'declined', 'cancelled', 'completed')),
  -- See src/lib/narration.ts NarrationTerms; terms_version goes up whenever the author changes them
  terms jsonb not null default '{}'::jsonb,
  terms_version int not null default 1,
  author_accepted_at timestamptz,
  narrator_accepted_at timestamptz,
  message text not null default '',
  declined_reason text,
  cancelled_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists narrator_jobs_project_idx on public.narrator_jobs (project_id, created_at desc);
create index if not exists narrator_jobs_narrator_idx on public.narrator_jobs (narrator_id) where narrator_id is not null;
create index if not exists narrator_jobs_email_idx on public.narrator_jobs (lower(invite_email));
-- One open narrator job per book at a time
create unique index if not exists narrator_jobs_one_open on public.narrator_jobs (project_id) where status in ('invited', 'active');
alter table public.narrator_jobs enable row level security;
