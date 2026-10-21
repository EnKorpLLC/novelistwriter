-- Release 1 (Trust): writing records, AI off switch, email notification consent.
-- Run after migration_platform_admin.sql.

-- One-time steps that must never re-run (snapshots)
create table if not exists public.app_migrations (
  name text primary key,
  ran_at timestamptz not null default now()
);

-- Writing sessions captured by the editor (typed vs pasted vs deleted characters)
create table if not exists public.writing_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete set null,
  session_key text not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  typed_chars int not null default 0,
  pasted_chars int not null default 0,
  deleted_chars int not null default 0,
  flagged boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, session_key)
);

create index if not exists idx_writing_sessions_project
  on public.writing_sessions(project_id, started_at);

alter table public.writing_sessions enable row level security;

drop policy if exists "writing_sessions_own" on public.writing_sessions;
create policy "writing_sessions_own" on public.writing_sessions for select using (
  user_id = auth.uid()
);

-- Words that weren't typed in the editor: imported files, and everything written before records began
alter table public.chapters
  add column if not exists imported_words int not null default 0;

alter table public.chapters
  add column if not exists prerecord_words int not null default 0;

do $$
begin
  if not exists (select 1 from public.app_migrations where name = 'prerecord_snapshot') then
    update public.chapters set prerecord_words = coalesce(word_count, 0);
    insert into public.app_migrations (name) values ('prerecord_snapshot');
  end if;
end $$;

-- AI off switch, and a per-book stamp that survives deleting saved AI reports
alter table public.profiles
  add column if not exists ai_disabled boolean not null default false;

alter table public.profiles
  add column if not exists ai_disabled_since timestamptz;

alter table public.projects
  add column if not exists ai_used_at timestamptz;

update public.projects p
set ai_used_at = j.first_used
from (
  select project_id, min(created_at) as first_used
  from public.ai_jobs
  where project_id is not null
  group by project_id
) j
where p.id = j.project_id
  and p.ai_used_at is null;

-- Email notification consent (nobody is opted in by default)
alter table public.profiles
  add column if not exists email_notifications boolean not null default false;

alter table public.profiles
  add column if not exists email_notifications_at timestamptz;

alter table public.profiles
  add column if not exists email_prompt_dismissed_at timestamptz;
