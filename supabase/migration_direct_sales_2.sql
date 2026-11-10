-- Direct sales release 2: discount codes and reader magnets. Safe to run again. Run after migration_direct_sales.sql.

create table if not exists public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  percent_off int check (percent_off between 1 and 90),
  amount_off_cents int check (amount_off_cents > 0),
  -- Empty means every book the author sells
  project_ids uuid[] not null default '{}',
  max_uses int check (max_uses > 0),
  uses int not null default 0,
  ends_on date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (percent_off is not null or amount_off_cents is not null)
);
create unique index if not exists discount_codes_author_code_uidx on public.discount_codes (author_user_id, upper(code));
alter table public.discount_codes enable row level security;

alter table public.book_purchases add column if not exists discount_code_id uuid;
alter table public.book_purchases add column if not exists regular_price_cents int;

-- A free book for joining the author's list: waits here until the reader confirms their email
create table if not exists public.magnet_claims (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  status text not null default 'pending' check (status in ('pending', 'delivered')),
  purchase_id uuid,
  created_at timestamptz not null default now(),
  unique (project_id, email)
);
create index if not exists magnet_claims_author_email_idx on public.magnet_claims (author_user_id, email) where status = 'pending';
alter table public.magnet_claims enable row level security;
