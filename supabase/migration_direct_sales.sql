-- Direct sales and ebook delivery, release 1: sellers, purchases, payouts. Safe to run again.
-- Novelist Writer is the seller (Stripe Tax on our account); authors are paid monthly through Connect Express.

-- An author's payout account and acceptance of the seller terms
create table if not exists public.seller_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_account_id text,
  payouts_enabled boolean not null default false,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.seller_accounts enable row level security;

-- Per book: { on: boolean, priceCents: number, salePriceCents: number | null, saleStarts: "YYYY-MM-DD" | null, saleEnds: "YYYY-MM-DD" | null }
alter table public.projects add column if not exists direct_sale jsonb;

-- One row per ebook sold. Money columns are in cents; author_cents goes negative on a refund (Stripe keeps its fee)
create table if not exists public.book_purchases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  buyer_user_id uuid references auth.users(id) on delete set null,
  buyer_email text not null default '',
  buyer_name text not null default '',
  title text not null default '',
  price_cents int not null,
  tax_cents int not null default 0,
  stripe_fee_cents int not null default 0,
  platform_fee_cents int not null default 0,
  author_cents int not null default 0,
  currency text not null default 'usd',
  status text not null default 'paid' check (status in ('paid', 'refunded', 'disputed')),
  stripe_session_id text not null unique,
  stripe_payment_intent text,
  stripe_charge_id text,
  available_at timestamptz not null,
  payout_id uuid,
  download_token text not null unique,
  downloads int not null default 0,
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists book_purchases_author_idx on public.book_purchases (author_user_id, created_at desc);
create index if not exists book_purchases_buyer_idx on public.book_purchases (buyer_user_id);
create index if not exists book_purchases_email_idx on public.book_purchases (lower(buyer_email));
create index if not exists book_purchases_charge_idx on public.book_purchases (stripe_charge_id);
create index if not exists book_purchases_pi_idx on public.book_purchases (stripe_payment_intent);
alter table public.book_purchases enable row level security;

create table if not exists public.seller_payouts (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references auth.users(id) on delete cascade,
  amount_cents int not null,
  stripe_transfer_id text,
  status text not null default 'paid' check (status in ('paid', 'failed')),
  error text,
  created_at timestamptz not null default now()
);
create index if not exists seller_payouts_author_idx on public.seller_payouts (author_user_id, created_at desc);
alter table public.seller_payouts enable row level security;

-- Our fee on each sale shows in the Money tab as its own kind of revenue
alter table public.revenue_events drop constraint if exists revenue_events_kind_check;
alter table public.revenue_events add constraint revenue_events_kind_check check (kind in ('subscription', 'credits', 'project_unlock', 'other', 'refund', 'sales_fee'));

-- Sale notices for authors
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
  'affiliate',
  'book_sale'
));
