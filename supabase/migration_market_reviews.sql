-- Creative marketplace: reviews after completed jobs, and a log of editor changes accepted into a book.
-- Run after migration_market_jobs.sql. Safe to run again.

create table if not exists public.market_reviews (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.market_jobs(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  pro_id uuid not null references auth.users(id) on delete cascade,
  stars int not null check (stars between 1 and 5),
  body text not null default '',
  reply text,
  replied_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists market_reviews_pro_idx on public.market_reviews (pro_id, created_at desc);
alter table public.market_reviews enable row level security;

-- Each time an author accepts changes from an editor's Word file into the book (the writing record keeps them apart from typing)
create table if not exists public.market_edit_log (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.market_jobs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  file_id uuid,
  accepted int not null default 0,
  rejected int not null default 0,
  words_changed int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists market_edit_log_project_idx on public.market_edit_log (project_id);
alter table public.market_edit_log enable row level security;
