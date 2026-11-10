-- Founding members and lifetime deals (G6). Safe to run again. Run after migration_social_engine.sql.
-- Founding members: the first 500 Pro or Studio subscribers keep 20% off for life (a forever Stripe coupon).
-- Lifetime Pro ($449, 300 spots) and Lifetime Studio ($1,099, 100 spots): one payment, no AI credits.

alter table public.credit_balances add column if not exists founding_member boolean not null default false;
alter table public.credit_balances add column if not exists founding_since timestamptz;
-- 'pro' or 'studio' for lifetime holders; plan checks treat it like that subscription, without AI credits
alter table public.credit_balances add column if not exists lifetime_tier text check (lifetime_tier in ('pro', 'studio'));
alter table public.credit_balances add column if not exists lifetime_since timestamptz;

create table if not exists public.lifetime_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tier text not null check (tier in ('pro', 'studio')),
  amount_cents int not null,
  stripe_session_id text not null unique,
  stripe_payment_intent text,
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists lifetime_purchases_tier_idx on public.lifetime_purchases (tier) where refunded_at is null;
alter table public.lifetime_purchases enable row level security;

-- Everyone already subscribed is a founding member: they keep the price they have and get the badge
update public.credit_balances
set founding_member = true, founding_since = coalesce(founding_since, now())
where subscription_tier in ('pro', 'studio') and not founding_member;
