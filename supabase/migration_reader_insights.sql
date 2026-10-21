-- Reader insights for the Beta and ARC panels: which days each reader opened the book, and how far
-- ARC readers got into each chapter (beta already has beta_reading_progress).
-- Run after migration_site_metrics.sql.

create table if not exists public.reader_book_days (
  phase text not null check (phase in ('beta', 'arc')),
  invite_id uuid not null,
  project_id uuid not null references public.projects(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (phase, invite_id, day)
);

create index if not exists idx_reader_book_days_project on public.reader_book_days(project_id, phase, day);

-- Written and read by the service role only
alter table public.reader_book_days enable row level security;

create table if not exists public.arc_reading_progress (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.arc_invites(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  percent int not null default 0 check (percent between 0 and 100),
  updated_at timestamptz not null default now(),
  unique (invite_id, chapter_id)
);

create index if not exists idx_arc_reading_progress_project on public.arc_reading_progress(project_id);

alter table public.arc_reading_progress enable row level security;

-- Seed reading days from what was already recorded, so existing books have some history
insert into public.reader_book_days (phase, invite_id, project_id, day)
select distinct 'beta', p.invite_id, p.project_id, (p.updated_at at time zone 'utc')::date
from public.beta_reading_progress p
where p.updated_at is not null
on conflict do nothing;

insert into public.reader_book_days (phase, invite_id, project_id, day)
select distinct 'beta', c.invite_id, c.project_id, (c.created_at at time zone 'utc')::date
from public.beta_comments c
where c.invite_id is not null and c.author_user_id is null
on conflict do nothing;

insert into public.reader_book_days (phase, invite_id, project_id, day)
select 'arc', a.id, a.project_id, (a.last_read_at at time zone 'utc')::date
from public.arc_invites a
where a.last_read_at is not null
on conflict do nothing;
