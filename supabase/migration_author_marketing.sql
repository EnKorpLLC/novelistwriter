-- Author marketing (growth engine): posting calendar with reminders. Safe to run again.
-- Run after migration_launch_engine.sql.

create table if not exists public.marketing_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  post_on date not null,
  network text not null default 'any',
  body text not null default '',
  -- Which card goes with the post: quote, review, progress, cover, or none
  card text not null default 'none',
  status text not null default 'planned' check (status in ('planned', 'posted', 'skipped')),
  posted_at timestamptz,
  reminded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Year-round plan: what the post is for ("Backlist spotlight: ...") and which plan idea it came from
alter table public.marketing_posts add column if not exists note text not null default '';
alter table public.marketing_posts add column if not exists plan_key text;
create index if not exists marketing_posts_user_day_idx on public.marketing_posts (user_id, post_on);
create index if not exists marketing_posts_due_idx on public.marketing_posts (post_on) where status = 'planned';
alter table public.marketing_posts enable row level security;
drop policy if exists marketing_posts_own on public.marketing_posts;
create policy marketing_posts_own on public.marketing_posts for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Posting reminders
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
  'reader_milestone',
  'marketing_reminder'
));
