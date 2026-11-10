-- Direct sales release 3: bundles (several books at one price, delivered as separate ebooks). Safe to run again.
-- Run after migration_direct_sales.sql and migration_direct_sales_2.sql.

create table if not exists public.book_bundles (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  project_ids uuid[] not null,
  price_cents int not null check (price_cents >= 99),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (cardinality(project_ids) between 2 and 10)
);
create index if not exists book_bundles_author_idx on public.book_bundles (author_user_id);
alter table public.book_bundles enable row level security;

-- One checkout can now hold several books: they share an order_ref (the Stripe session id)
alter table public.book_purchases add column if not exists bundle_id uuid;
alter table public.book_purchases add column if not exists order_ref text;
create index if not exists book_purchases_order_idx on public.book_purchases (order_ref);
update public.book_purchases set order_ref = stripe_session_id where order_ref is null and stripe_session_id like 'cs_%';
