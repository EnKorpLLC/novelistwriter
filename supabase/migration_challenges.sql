-- Verified writing challenges: platform challenges with any dates, author-run group challenges,
-- participants with verified word totals, daily streaks, and winner badges.
-- Run after migration_formatting.sql.

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  goal_words int not null default 50000 check (goal_words between 100 and 1000000),
  starts_on date not null,
  ends_on date not null,
  kind text not null default 'platform' check (kind in ('platform', 'group')),
  created_by uuid references auth.users(id) on delete set null,
  -- Group challenges are reached by link; platform challenges are listed publicly
  is_public boolean not null default true,
  join_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create index if not exists challenges_dates_idx on public.challenges (starts_on, ends_on);

create table if not exists public.challenge_participants (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Days count in the writer's own time zone
  time_zone text not null default 'UTC',
  joined_at timestamptz not null default now(),
  verified_words int not null default 0,
  days_written int not null default 0,
  current_streak int not null default 0,
  best_streak int not null default 0,
  -- { "YYYY-MM-DD": words } for the progress chart
  daily jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  show_on_leaderboard boolean not null default true,
  last_computed_at timestamptz,
  primary key (challenge_id, user_id)
);

create index if not exists challenge_participants_user_idx on public.challenge_participants (user_id);
create index if not exists challenge_participants_board_idx on public.challenge_participants (challenge_id, verified_words desc);

-- Everything goes through the API with the service role; signed-in users can read their own rows
alter table public.challenges enable row level security;
alter table public.challenge_participants enable row level security;

drop policy if exists challenges_read_public on public.challenges;
create policy challenges_read_public on public.challenges for select using (is_public or created_by = auth.uid());

drop policy if exists challenge_participants_own on public.challenge_participants;
create policy challenge_participants_own on public.challenge_participants for select using (user_id = auth.uid());
