-- Beta social layer: author reviews of readers, messaging, follows, notifications.
-- Run after migration_beta_platform.sql.

-- Author reviews of beta readers (visible to other authors on applications)
create table if not exists public.beta_reader_reviews (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references auth.users(id) on delete cascade,
  reader_user_id uuid references auth.users(id) on delete set null,
  reader_email text not null,
  project_id uuid references public.projects(id) on delete set null,
  invite_id uuid references public.beta_invites(id) on delete set null,
  rating int check (rating is null or (rating between 1 and 5)),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_beta_reader_reviews_email
  on public.beta_reader_reviews (lower(reader_email));

create index if not exists idx_beta_reader_reviews_reader
  on public.beta_reader_reviews(reader_user_id)
  where reader_user_id is not null;

create index if not exists idx_beta_reader_reviews_author
  on public.beta_reader_reviews(author_user_id);

alter table public.beta_reader_reviews enable row level security;

-- Authors can read all reader reviews (reputation); readers see their own
drop policy if exists "beta_reader_reviews_select" on public.beta_reader_reviews;
create policy "beta_reader_reviews_select" on public.beta_reader_reviews for select using (
  auth.uid() is not null
  and (
    author_user_id = auth.uid()
    or reader_user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_author = true
    )
  )
);

drop policy if exists "beta_reader_reviews_insert" on public.beta_reader_reviews;
create policy "beta_reader_reviews_insert" on public.beta_reader_reviews for insert with check (
  author_user_id = auth.uid()
  and exists (
    select 1 from public.beta_invites i
    where i.user_id = auth.uid()
      and lower(i.email) = lower(reader_email)
  )
);

drop policy if exists "beta_reader_reviews_update_own" on public.beta_reader_reviews;
create policy "beta_reader_reviews_update_own" on public.beta_reader_reviews for update using (
  author_user_id = auth.uid()
) with check (author_user_id = auth.uid());

drop policy if exists "beta_reader_reviews_delete_own" on public.beta_reader_reviews;
create policy "beta_reader_reviews_delete_own" on public.beta_reader_reviews for delete using (
  author_user_id = auth.uid()
);

-- Conversations + messages between author and reader
create table if not exists public.beta_conversations (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references auth.users(id) on delete cascade,
  reader_user_id uuid references auth.users(id) on delete set null,
  reader_email text not null,
  project_id uuid references public.projects(id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (author_user_id, reader_email)
);

create index if not exists idx_beta_conversations_reader
  on public.beta_conversations(reader_user_id)
  where reader_user_id is not null;

create table if not exists public.beta_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.beta_conversations(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_beta_messages_conversation
  on public.beta_messages(conversation_id, created_at);

alter table public.beta_conversations enable row level security;
alter table public.beta_messages enable row level security;

drop policy if exists "beta_conversations_select" on public.beta_conversations;
create policy "beta_conversations_select" on public.beta_conversations for select using (
  author_user_id = auth.uid() or reader_user_id = auth.uid()
);

drop policy if exists "beta_conversations_insert" on public.beta_conversations;
create policy "beta_conversations_insert" on public.beta_conversations for insert with check (
  author_user_id = auth.uid() or reader_user_id = auth.uid()
);

drop policy if exists "beta_conversations_update" on public.beta_conversations;
create policy "beta_conversations_update" on public.beta_conversations for update using (
  author_user_id = auth.uid() or reader_user_id = auth.uid()
);

drop policy if exists "beta_messages_select" on public.beta_messages;
create policy "beta_messages_select" on public.beta_messages for select using (
  exists (
    select 1 from public.beta_conversations c
    where c.id = conversation_id
      and (c.author_user_id = auth.uid() or c.reader_user_id = auth.uid())
  )
);

drop policy if exists "beta_messages_insert" on public.beta_messages;
create policy "beta_messages_insert" on public.beta_messages for insert with check (
  sender_user_id = auth.uid()
  and exists (
    select 1 from public.beta_conversations c
    where c.id = conversation_id
      and (c.author_user_id = auth.uid() or c.reader_user_id = auth.uid())
  )
);

-- Readers follow authors
create table if not exists public.beta_author_follows (
  id uuid primary key default gen_random_uuid(),
  reader_user_id uuid not null references auth.users(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (reader_user_id, author_user_id),
  check (reader_user_id <> author_user_id)
);

create index if not exists idx_beta_follows_author on public.beta_author_follows(author_user_id);

alter table public.beta_author_follows enable row level security;

drop policy if exists "beta_follows_select" on public.beta_author_follows;
create policy "beta_follows_select" on public.beta_author_follows for select using (
  reader_user_id = auth.uid() or author_user_id = auth.uid()
);

drop policy if exists "beta_follows_insert" on public.beta_author_follows;
create policy "beta_follows_insert" on public.beta_author_follows for insert with check (
  reader_user_id = auth.uid()
);

drop policy if exists "beta_follows_delete" on public.beta_author_follows;
create policy "beta_follows_delete" on public.beta_author_follows for delete using (
  reader_user_id = auth.uid()
);

-- In-platform notifications
create table if not exists public.beta_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in (
    'reader_review',
    'message',
    'author_new_book',
    'author_rerelease',
    'application_update'
  )),
  title text not null,
  body text,
  href text,
  meta jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_beta_notifications_user
  on public.beta_notifications(user_id, created_at desc);

create index if not exists idx_beta_notifications_unread
  on public.beta_notifications(user_id)
  where read_at is null;

alter table public.beta_notifications enable row level security;

drop policy if exists "beta_notifications_own" on public.beta_notifications;
create policy "beta_notifications_own" on public.beta_notifications for all using (
  user_id = auth.uid()
) with check (
  user_id = auth.uid()
);

-- Track prior ready state for re-release detection (optional helper column)
alter table public.projects
  add column if not exists beta_ready_changed_at timestamptz;
