-- Reader trust (RX1) and beta reader protections (RX4). Safe to run again. Run after migration_site_text.sql.

-- "Seen by the author": set when the author opens a reader's comments
alter table public.beta_comments add column if not exists author_seen_at timestamptz;

-- A reader can block an author: their books leave the reader's catalog, and they can't invite or message the reader
create table if not exists public.reader_blocks (
  reader_user_id uuid not null references auth.users(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reader_user_id, author_user_id),
  check (reader_user_id <> author_user_id)
);
create index if not exists reader_blocks_author_idx on public.reader_blocks (author_user_id);
alter table public.reader_blocks enable row level security;

-- Private reports to admin: a concern about how a book was written, or about someone's conduct. Never shown publicly.
create table if not exists public.trust_reports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('ai_concern', 'conduct', 'content')),
  reporter_user_id uuid references auth.users(id) on delete set null,
  reporter_email text,
  project_id uuid references public.projects(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  reason text not null,
  details text not null default '',
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed', 'actioned')),
  admin_note text not null default '',
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists trust_reports_status_idx on public.trust_reports (status, created_at desc);
create index if not exists trust_reports_target_idx on public.trust_reports (target_user_id);
alter table public.trust_reports enable row level security;

-- Authors removed from the reader catalogs after repeated conduct reports (set by admin)
alter table public.profiles add column if not exists catalog_suspended_at timestamptz;
