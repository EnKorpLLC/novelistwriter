-- Release 3 (Rewards): Studio pass days earned by sharing, banked up to 28;
-- 7-day reader grace and export-only project lock when Studio ends.
-- Run after migration_launch_share.sql.

-- Pass bank and running pass (no AI credits ever come with a pass)
alter table public.credit_balances add column if not exists pass_bank_days int not null default 0;
alter table public.credit_balances add column if not exists pass_active_until timestamptz;
alter table public.credit_balances add column if not exists pass_started_at timestamptz;
alter table public.credit_balances add column if not exists pass_warned_3d_at timestamptz;
alter table public.credit_balances add column if not exists pass_warned_1d_at timestamptz;
alter table public.credit_balances add column if not exists pass_ended_emailed_at timestamptz;
alter table public.credit_balances add column if not exists pass_ended_dismissed_at timestamptz;

-- Every earned or spent day, with a unique key so the same reward never pays twice
create table if not exists public.studio_pass_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  days int not null,
  credited_days int not null,
  reason text not null,
  ref_key text not null unique,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_pass_ledger_user on public.studio_pass_ledger(user_id, created_at desc);

alter table public.studio_pass_ledger enable row level security;

drop policy if exists "pass_ledger_own" on public.studio_pass_ledger;
create policy "pass_ledger_own" on public.studio_pass_ledger for select using (user_id = auth.uid());

-- Days a reader actually read (progress on a beta or ARC manuscript)
create table if not exists public.reader_activity_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);

alter table public.reader_activity_days enable row level security;

drop policy if exists "reader_activity_own" on public.reader_activity_days;
create policy "reader_activity_own" on public.reader_activity_days for select using (user_id = auth.uid());

-- When Studio ends: readers keep reading until reader_grace_until; extra projects lock on Free
alter table public.projects add column if not exists reader_grace_until timestamptz;
alter table public.projects add column if not exists locked_at timestamptz;

-- In-app notices about the pass
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
    'arc_deadline',
    'studio_pass'
  ));
