-- Launch engine (Studio). Safe to run again as later launch parts add to this file.
-- Run after migration_challenges.sql.

-- L1: the launch countdown. { "done": { stepId: isoDate }, "arcTarget": 15, "sample": {...}, "liveSentAt": iso, "spotlight": bool }
alter table public.projects add column if not exists launch_plan jsonb not null default '{}'::jsonb;

-- L2: readers who asked to hear when a specific book is out (on top of the author-wide list)
alter table public.author_subscribers add column if not exists release_project_ids uuid[] not null default '{}';

-- L2: bulk email waits here and goes out in daily batches that stay under Gmail's sending limit
create table if not exists public.email_queue (
  id bigint generated always as identity primary key,
  to_email text not null,
  subject text not null,
  html text not null,
  text_body text not null,
  reply_to text,
  list_unsubscribe text,
  kind text not null default 'launch',
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts int not null default 0,
  last_error text
);
create index if not exists email_queue_pending_idx on public.email_queue (id) where sent_at is null;
alter table public.email_queue enable row level security;

-- L4: clicks on launch page buy buttons, logged by /go/... then forwarded to the store
create table if not exists public.buy_clicks (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  store text not null,
  day date not null,
  visitor_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists buy_clicks_project_day_idx on public.buy_clicks (project_id, day);
alter table public.buy_clicks enable row level security;

-- L5: readers who volunteer to help launch a book. tasks: { "share": iso, "review": iso, "library": iso }
create table if not exists public.launch_team (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  tasks jsonb not null default '{}'::jsonb,
  primary key (project_id, user_id)
);
create index if not exists launch_team_user_idx on public.launch_team (user_id);
alter table public.launch_team enable row level security;
drop policy if exists launch_team_own on public.launch_team;
create policy launch_team_own on public.launch_team for select using (user_id = auth.uid());

-- L7: thank-you notes from authors to their readers
create table if not exists public.author_thanks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  reader_user_id uuid references auth.users(id) on delete set null,
  reader_email text,
  kind text not null default 'reader',
  message text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists author_thanks_author_idx on public.author_thanks (author_user_id, created_at);
alter table public.author_thanks enable row level security;

-- New notification types for launches and thank-yous
alter table public.beta_notifications drop constraint if exists beta_notifications_type_check;
alter table public.beta_notifications add constraint beta_notifications_type_check check (type in (
  'reader_review',
  'message',
  'author_new_book',
  'author_rerelease',
  'application_update',
  'reading_reminder',
  'author_new_arc',
  'arc_invite',
  'arc_deadline',
  'studio_pass',
  'book_released',
  'arc_review_push',
  'launch_team',
  'author_thanks',
  'reader_milestone'
));
