-- Beta application form, reading progress, and DNF.
-- Run in Supabase SQL editor after migration_beta.sql.

alter table public.beta_invites drop constraint if exists beta_invites_status_check;
alter table public.beta_invites
  add constraint beta_invites_status_check
  check (status in ('pending', 'requested', 'accepted', 'denied', 'revoked', 'dnf'));

alter table public.beta_invites
  add column if not exists application_answers jsonb not null default '{}'::jsonb;

alter table public.beta_invites
  add column if not exists dnf_reason text;

alter table public.beta_invites
  add column if not exists dnf_at timestamptz;

alter table public.beta_invites
  add column if not exists current_chapter_id uuid references public.chapters(id) on delete set null;

alter table public.projects
  add column if not exists beta_application_form jsonb not null default '[]'::jsonb;

create table if not exists public.beta_reading_progress (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.beta_invites(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  percent integer not null default 0 check (percent >= 0 and percent <= 100),
  updated_at timestamptz not null default now(),
  unique (invite_id, chapter_id)
);

create index if not exists idx_beta_progress_invite on public.beta_reading_progress(invite_id);
create index if not exists idx_beta_progress_project on public.beta_reading_progress(project_id);

alter table public.beta_reading_progress enable row level security;

drop policy if exists "beta_progress_own" on public.beta_reading_progress;
create policy "beta_progress_own" on public.beta_reading_progress for all using (
  exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
);
