-- Creative marketplace, steps 2 to 4: requests, quotes, agreements, milestone payments, delivery, and payouts.
-- Run after migration_marketplace.sql. Safe to run again.

create table if not exists public.market_jobs (
  id uuid primary key default gen_random_uuid(),
  -- Jobs sent to several pros at once share a request; accepting one quote closes the others
  request_id uuid not null,
  author_id uuid not null references auth.users(id) on delete cascade,
  pro_id uuid references auth.users(id) on delete set null,
  -- Private invites: the author's own editor or artist, by email
  invite_email text,
  invite_token text unique,
  source text not null default 'directory' check (source in ('directory', 'private')),
  project_id uuid references public.projects(id) on delete set null,
  market_type text not null,
  title text not null,
  brief text not null default '',
  deadline date,
  budget_note text not null default '',
  status text not null default 'requested' check (status in ('requested', 'quoted', 'agreed', 'completed', 'cancelled', 'declined', 'not_chosen', 'disputed')),
  -- See src/lib/market-quotes.ts
  quote jsonb not null default '{}'::jsonb,
  quote_version int not null default 0,
  quoted_at timestamptz,
  agreement_text text,
  agreed_at timestamptz,
  dispute_note text,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_reason text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists market_jobs_author_idx on public.market_jobs (author_id, created_at desc);
create index if not exists market_jobs_pro_idx on public.market_jobs (pro_id, created_at desc);
create index if not exists market_jobs_request_idx on public.market_jobs (request_id);
alter table public.market_jobs enable row level security;

create table if not exists public.market_milestones (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.market_jobs(id) on delete cascade,
  sort int not null default 0,
  title text not null,
  -- The pro's price; the author pays this plus our fee
  pro_cents int not null check (pro_cents > 0),
  due_on date,
  status text not null default 'unpaid' check (status in ('unpaid', 'paid', 'delivered', 'changes', 'approved', 'refunded', 'cancelled')),
  revisions_used int not null default 0,
  delivery_note text not null default '',
  paid_at timestamptz,
  delivered_at timestamptz,
  approved_at timestamptz,
  auto_approved boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists market_milestones_job_idx on public.market_milestones (job_id, sort);
alter table public.market_milestones enable row level security;

create table if not exists public.market_payments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.market_jobs(id) on delete cascade,
  milestone_id uuid not null references public.market_milestones(id) on delete cascade,
  amount_cents int not null,
  pro_cents int not null,
  platform_cents int not null,
  stripe_fee_cents int not null default 0,
  refunded_cents int not null default 0,
  status text not null default 'paid' check (status in ('paid', 'refunded', 'disputed')),
  stripe_session_id text unique,
  stripe_payment_intent text,
  stripe_charge_id text,
  created_at timestamptz not null default now()
);
create index if not exists market_payments_job_idx on public.market_payments (job_id);
alter table public.market_payments enable row level security;

create table if not exists public.market_payouts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.market_jobs(id) on delete cascade,
  milestone_id uuid,
  payment_id uuid,
  pro_id uuid not null references auth.users(id) on delete cascade,
  amount_cents int not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'cancelled')),
  stripe_transfer_id text,
  error text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists market_payouts_pro_idx on public.market_payouts (pro_id, created_at desc);
alter table public.market_payouts enable row level security;

create table if not exists public.market_messages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.market_jobs(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists market_messages_job_idx on public.market_messages (job_id, created_at);
alter table public.market_messages enable row level security;

-- Files in R2 under market/<jobId>/: the author's references, and the pro's deliveries and process proof
create table if not exists public.market_files (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.market_jobs(id) on delete cascade,
  milestone_id uuid,
  uploader_id uuid references auth.users(id) on delete set null,
  kind text not null default 'delivery' check (kind in ('brief', 'delivery', 'process')),
  name text not null,
  r2_key text not null,
  bytes bigint not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists market_files_job_idx on public.market_files (job_id);
alter table public.market_files enable row level security;
