-- Platform admin, contact inbox, author audience, ARC desk, published books.
-- Run after migration_beta_social.sql and migration_beta_backup.sql.

-- Platform admin + author public profile links
alter table public.profiles
  add column if not exists is_platform_admin boolean not null default false;

alter table public.profiles
  add column if not exists public_links jsonb not null default '{}'::jsonb;

update public.profiles
set is_platform_admin = true
where lower(email) = 'ryan.jamison87@gmail.com';

-- Contact us inbox (read/written by the service role only)
create table if not exists public.platform_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  email text not null,
  subject text not null default '',
  body text not null,
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'new' check (status in ('new', 'read', 'archived')),
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_messages_created
  on public.platform_messages(created_at desc);

alter table public.platform_messages enable row level security;

-- Beta reminder cap
alter table public.beta_invites
  add column if not exists last_reminded_at timestamptz;

-- Author email list (one row per email per author)
create table if not exists public.author_subscribers (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  sources text[] not null default '{}',
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (author_user_id, email)
);

create index if not exists idx_author_subscribers_author
  on public.author_subscribers(author_user_id);

alter table public.author_subscribers enable row level security;

drop policy if exists "author_subscribers_own" on public.author_subscribers;
create policy "author_subscribers_own" on public.author_subscribers for select using (
  author_user_id = auth.uid()
);

-- ARC settings per book
alter table public.projects
  add column if not exists arc_open boolean not null default false;

alter table public.projects
  add column if not exists arc_deadline timestamptz;

alter table public.projects
  add column if not exists arc_collect_address boolean not null default false;

alter table public.projects
  add column if not exists arc_review_links jsonb not null default '[]'::jsonb;

-- Published listing
alter table public.projects
  add column if not exists published boolean not null default false;

alter table public.projects
  add column if not exists published_at timestamptz;

alter table public.projects
  add column if not exists tropes text[] not null default '{}';

alter table public.projects
  add column if not exists buy_links jsonb not null default '[]'::jsonb;

create index if not exists idx_projects_published
  on public.projects(published_at desc)
  where published = true;

-- ARC readers
create table if not exists public.arc_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  reader_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'active' check (status in ('requested', 'active', 'denied', 'revoked')),
  deadline timestamptz,
  current_chapter_id uuid references public.chapters(id) on delete set null,
  last_read_at timestamptz,
  finished_at timestamptz,
  last_reminded_at timestamptz,
  review_body text,
  review_posts jsonb not null default '{}'::jsonb,
  mailing_address jsonb,
  created_at timestamptz not null default now(),
  unique (project_id, email)
);

create index if not exists idx_arc_invites_project on public.arc_invites(project_id);
create index if not exists idx_arc_invites_reader
  on public.arc_invites(reader_user_id)
  where reader_user_id is not null;

alter table public.arc_invites enable row level security;

drop policy if exists "arc_invites_own" on public.arc_invites;
create policy "arc_invites_own" on public.arc_invites for select using (
  user_id = auth.uid() or reader_user_id = auth.uid()
);

-- New notification types
alter table public.beta_notifications
  drop constraint if exists beta_notifications_type_check;

alter table public.beta_notifications
  add constraint beta_notifications_type_check check (type in (
    'reader_review',
    'message',
    'author_new_book',
    'author_rerelease',
    'application_update',
    'reading_reminder',
    'author_new_arc',
    'arc_invite',
    'arc_deadline'
  ));
