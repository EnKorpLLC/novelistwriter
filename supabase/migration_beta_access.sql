-- Beta access controls: reasons, auto-approve, expiry, contacts, display names, last read.
-- Run in Supabase SQL editor after migration_beta_comments.sql.

alter table public.beta_invites
  add column if not exists display_name text;

alter table public.beta_invites
  add column if not exists status_reason text;

alter table public.beta_invites
  add column if not exists last_read_at timestamptz;

alter table public.projects
  add column if not exists beta_expires_at timestamptz;

alter table public.projects
  add column if not exists beta_auto_approve jsonb not null default '{"mode":"off","rules":[]}'::jsonb;

create table if not exists public.beta_contacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, email)
);

create index if not exists idx_beta_contacts_project on public.beta_contacts(project_id);

alter table public.beta_contacts enable row level security;

drop policy if exists "beta_contacts_own" on public.beta_contacts;
create policy "beta_contacts_own" on public.beta_contacts for all using (
  auth.uid() = user_id
) with check (
  auth.uid() = user_id
);
