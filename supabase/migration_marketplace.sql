-- Creative marketplace, step 1: pro profiles, applications, author waitlists, and recruiting. Safe to run again.

-- Editors, artists, and narrators listed in the marketplace (a free account; narrators can be pros too)
alter table public.profiles add column if not exists is_pro boolean not null default false;

create table if not exists public.pro_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  headline text not null default '',
  bio text not null default '',
  -- Market types, see src/lib/market-types.ts
  specialties text[] not null default '{}',
  genres text[] not null default '{}',
  rate_note text not null default '',
  turnaround_note text not null default '',
  website text not null default '',
  -- [{ id, title, note, url?, key?, before?, after? }]
  portfolio jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'applied', 'changes', 'approved', 'declined', 'paused', 'removed')),
  promise_at timestamptz,
  -- Their link for inviting other pros
  invite_code text unique,
  -- Who recruited them: another pro, or the admin's invite
  invited_by uuid,
  invite_id uuid,
  admin_note text not null default '',
  founding boolean not null default false,
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pro_profiles_status_idx on public.pro_profiles (status);
create index if not exists pro_profiles_invited_by_idx on public.pro_profiles (invited_by);
alter table public.pro_profiles enable row level security;

-- Invites from the admin: the link lets someone apply and be approved without waiting in the queue
create table if not exists public.pro_invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  email text not null,
  market_type text not null,
  skip_queue boolean not null default true,
  note text not null default '',
  accepted_by uuid,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.pro_invites enable row level security;

-- Authors waiting for a type to open
create table if not exists public.market_waitlist (
  id uuid primary key default gen_random_uuid(),
  market_type text not null,
  email text not null,
  user_id uuid references auth.users(id) on delete set null,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (market_type, email)
);
alter table public.market_waitlist enable row level security;

-- Per type: how many approved pros open it, a manual open or close, and when it opened
create table if not exists public.market_settings (
  market_type text primary key,
  threshold int not null default 5 check (threshold between 1 and 100),
  override text not null default 'auto' check (override in ('auto', 'open', 'closed')),
  opened_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.market_settings enable row level security;
