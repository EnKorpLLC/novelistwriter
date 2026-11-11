-- Creative marketplace: editor notes pinned to the manuscript, and free sample edits. Run after migration_market_reviews.sql.
-- Safe to run again.

-- A note from the editor on a passage of a chapter, which the author can mark done
create table if not exists public.market_notes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.market_jobs(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  excerpt text not null default '',
  body text not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists market_notes_job_idx on public.market_notes (job_id, chapter_id);
alter table public.market_notes enable row level security;

-- The author can ask for a free sample edit (up to 1,000 words) before choosing; the pro attaches it before quoting
alter table public.market_jobs add column if not exists wants_sample boolean not null default false;
alter table public.market_files drop constraint if exists market_files_kind_check;
alter table public.market_files add constraint market_files_kind_check check (kind in ('brief', 'delivery', 'process', 'sample'));
