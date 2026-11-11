-- Audiobook studio A5b: where each reader is in each audiobook, so listening picks up on any device.
-- Run after migration_audiobook_sales.sql. Safe to run again.

create table if not exists public.listening_positions (
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  file_index int not null default 0,
  position_ms int not null default 0,
  speed real not null default 1,
  finished boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, project_id)
);
alter table public.listening_positions enable row level security;
