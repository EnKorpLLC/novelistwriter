-- Reader library (RX2) and better recommendations (RX3). Safe to run again. Run after migration_reader_trust.sql.

-- One row per book on a reader's shelves: a Novelist Writer book, or one imported from Goodreads or StoryGraph
create table if not exists public.library_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null default '',
  author text not null default '',
  isbn text not null default '',
  source text not null default 'here' check (source in ('here', 'goodreads', 'storygraph', 'manual')),
  shelf text not null default 'want' check (shelf in ('want', 'reading', 'finished', 'dnf')),
  custom_shelves text[] not null default '{}',
  rating smallint check (rating between 1 and 5),
  finished_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Not partial, so upserts can target it; imported books (no project) have null project_id and never collide
create unique index if not exists library_entries_user_project_uidx on public.library_entries (user_id, project_id);
create index if not exists library_entries_user_idx on public.library_entries (user_id, shelf);
create index if not exists library_entries_project_idx on public.library_entries (project_id) where project_id is not null;
alter table public.library_entries enable row level security;

-- "Tell me when the next book in this series is out": follows the series, not just the author
create table if not exists public.series_follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- A series id, or "<author id>:<series name>" for books that only name their series
  series_key text not null,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  series_name text not null default '',
  last_notified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, series_key)
);
create index if not exists series_follows_key_idx on public.series_follows (series_key);
alter table public.series_follows enable row level security;

-- Reader-made lists ("Cozy mysteries with no AI")
create table if not exists public.reader_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reader_lists_user_idx on public.reader_lists (user_id);
alter table public.reader_lists enable row level security;

create table if not exists public.reader_list_items (
  list_id uuid not null references public.reader_lists(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  note text not null default '',
  position int not null default 0,
  created_at timestamptz not null default now(),
  primary key (list_id, project_id)
);
alter table public.reader_list_items enable row level security;

-- Readers follow readers
create table if not exists public.reader_follows (
  follower_user_id uuid not null references auth.users(id) on delete cascade,
  followed_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_user_id, followed_user_id),
  check (follower_user_id <> followed_user_id)
);
create index if not exists reader_follows_followed_idx on public.reader_follows (followed_user_id);
alter table public.reader_follows enable row level security;

-- Opt-ins: show finished and loved books on the public reader profile; content the reader would rather not see
alter table public.profiles add column if not exists library_public boolean not null default false;
alter table public.profiles add column if not exists content_filters text[] not null default '{}';
