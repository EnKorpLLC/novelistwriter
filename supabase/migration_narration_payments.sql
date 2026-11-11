-- Audiobook studio A4c: narrator deposits, final payments, payouts, and delivery of the finished files.
-- Run after migration_review_copies.sql. Safe to run again.

-- What the author paid (through our Stripe account). narrator_cents is the narrator's share; platform_cents is our 10%
create table if not exists public.narration_payments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.narrator_jobs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('deposit', 'final')),
  amount_cents int not null,
  narrator_cents int not null,
  platform_cents int not null,
  stripe_fee_cents int not null default 0,
  refunded_cents int not null default 0,
  status text not null default 'paid' check (status in ('paid', 'refunded', 'disputed')),
  stripe_session_id text unique,
  stripe_payment_intent text,
  stripe_charge_id text,
  created_at timestamptz not null default now()
);
create index if not exists narration_payments_job_idx on public.narration_payments (job_id);
create index if not exists narration_payments_pi_idx on public.narration_payments (stripe_payment_intent);
alter table public.narration_payments enable row level security;

-- What the narrator is paid, one row per transfer (each tied to the payment it comes from)
create table if not exists public.narration_payouts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.narrator_jobs(id) on delete cascade,
  narrator_id uuid not null references auth.users(id) on delete cascade,
  payment_id uuid references public.narration_payments(id) on delete set null,
  amount_cents int not null,
  reason text not null default 'fee',
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'cancelled')),
  stripe_transfer_id text,
  error text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists narration_payouts_narrator_idx on public.narration_payouts (narrator_id, created_at desc);
create index if not exists narration_payouts_pending_idx on public.narration_payouts (status) where status = 'pending';
alter table public.narration_payouts enable row level security;

-- The finished, mastered files the narrator delivers; downloadable once the balance is paid
create table if not exists public.narration_deliveries (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.narrator_jobs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  file_name text not null,
  r2_key text not null,
  bytes bigint not null default 0,
  duration_ms int not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (job_id, file_name)
);
alter table public.narration_deliveries enable row level security;

alter table public.narrator_jobs add column if not exists deposit_paid_at timestamptz;
alter table public.narrator_jobs add column if not exists delivered_at timestamptz;
alter table public.narrator_jobs add column if not exists final_paid_at timestamptz;
alter table public.narrator_jobs add column if not exists finished_ms bigint;
