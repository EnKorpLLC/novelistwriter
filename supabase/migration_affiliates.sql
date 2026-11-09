-- Affiliate program (G3): 30% of what referred customers pay for subscriptions in their first 12 months,
-- held 60 days, paid monthly through Stripe Connect Express once $25 is owed. Safe to run again.
-- Run after migration_cross_promo.sql.

create table if not exists public.affiliates (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'applied' check (status in ('applied', 'approved', 'rejected', 'suspended')),
  -- Where and how they'll promote, from the application
  website text not null default '',
  audience text not null default '',
  agreed_terms_at timestamptz,
  applied_at timestamptz not null default now(),
  decided_at timestamptz,
  admin_note text not null default '',
  stripe_account_id text,
  payouts_enabled boolean not null default false,
  country text not null default 'US'
);
create index if not exists affiliates_status_idx on public.affiliates (status);
alter table public.affiliates enable row level security;

-- One row per paid subscription invoice from a referred customer; negative rows claw back refunds after payout
create table if not exists public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_user_id uuid not null references auth.users(id) on delete cascade,
  customer_user_id uuid references auth.users(id) on delete set null,
  stripe_invoice_id text,
  stripe_charge_id text,
  basis_cents int not null default 0,
  amount_cents int not null,
  currency text not null default 'usd',
  status text not null default 'pending' check (status in ('pending', 'paid', 'reversed')),
  available_at timestamptz not null,
  note text not null default '',
  payout_id uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists affiliate_commissions_invoice_uidx on public.affiliate_commissions (stripe_invoice_id) where amount_cents > 0;
create index if not exists affiliate_commissions_affiliate_idx on public.affiliate_commissions (affiliate_user_id, status);
create index if not exists affiliate_commissions_charge_idx on public.affiliate_commissions (stripe_charge_id);
alter table public.affiliate_commissions enable row level security;

create table if not exists public.affiliate_payouts (
  id uuid primary key default gen_random_uuid(),
  affiliate_user_id uuid not null references auth.users(id) on delete cascade,
  amount_cents int not null,
  currency text not null default 'usd',
  stripe_transfer_id text,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error text,
  created_at timestamptz not null default now()
);
create index if not exists affiliate_payouts_affiliate_idx on public.affiliate_payouts (affiliate_user_id, created_at);
alter table public.affiliate_payouts enable row level security;

-- Affiliate notices (approved, payout sent)
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
  'marketing_reminder',
  'cross_promo',
  'affiliate'
));
