-- P2: where each chapter is posted (Royal Road, Wattpad, Substack…) and the author's release schedule. Safe to run again.

create table if not exists public.serial_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  platform text not null,
  url text not null default '',
  posted_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (chapter_id, platform)
);
create index if not exists serial_posts_project_idx on public.serial_posts (project_id, platform);
alter table public.serial_posts enable row level security;

-- { platforms: string[], weekdays: number[] (0 = Sunday), remind: boolean, noteAfter: string, lastRemindedOn: "YYYY-MM-DD" }
alter table public.projects add column if not exists serial_settings jsonb;
