-- Admin Money tab: what comes in (from Stripe), what goes out (bills you enter), and free-tier usage.
-- Run after migration_site_plans.sql. Every table here is read and written by the service role only.

-- One row per payment or refund from Stripe. stripe_ref makes webhook and "Sync from Stripe" safe to repeat.
create table if not exists public.revenue_events (
  id bigint generated always as identity primary key,
  stripe_ref text not null unique,
  kind text not null check (kind in ('subscription', 'credits', 'project_unlock', 'other', 'refund')),
  user_id uuid,
  tier text,
  billing_interval text,
  -- Cents, negative for refunds
  amount_cents int not null,
  currency text not null default 'usd',
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_revenue_events_occurred on public.revenue_events(occurred_at);
alter table public.revenue_events enable row level security;

-- Bills you pay: hosting, database, email, domain, and so on
create table if not exists public.admin_costs (
  id uuid primary key default gen_random_uuid(),
  service text not null,
  amount_cents int not null check (amount_cents >= 0),
  cadence text not null check (cadence in ('monthly', 'yearly', 'one_time')),
  started_on date not null default current_date,
  ended_on date,
  notes text not null default '',
  created_at timestamptz not null default now()
);
alter table public.admin_costs enable row level security;

-- Small settings the Money tab remembers (AI cost per credit, Supabase downloads, first-sale flags, MRR snapshot)
create table if not exists public.admin_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.admin_settings enable row level security;

-- One row per email sent, so the Money tab can compare today's count with Gmail's daily limit
create table if not exists public.email_sends (
  id bigint generated always as identity primary key,
  sent_at timestamptz not null default now(),
  ok boolean not null default true
);
create index if not exists idx_email_sends_sent on public.email_sends(sent_at);
alter table public.email_sends enable row level security;

-- Database and file storage size for the free-tier alarms (service role only)
create or replace function public.admin_db_size()
returns bigint
language sql
security definer
set search_path = public
as $$ select pg_database_size(current_database()) $$;

create or replace function public.admin_storage_size()
returns bigint
language sql
security definer
set search_path = public, storage
as $$ select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects $$;

revoke all on function public.admin_db_size() from public, anon, authenticated;
revoke all on function public.admin_storage_size() from public, anon, authenticated;
grant execute on function public.admin_db_size() to service_role;
grant execute on function public.admin_storage_size() to service_role;
