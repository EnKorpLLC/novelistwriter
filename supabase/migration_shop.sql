-- Physical sales PH3: things the author ships themselves (signed books, bookmarks, prints). Run after migration_print_sales.sql.
-- Safe to run again.

create table if not exists public.shop_items (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references auth.users(id) on delete cascade,
  -- The book it belongs to (signed copies), or none for things like bookmarks
  project_id uuid references public.projects(id) on delete set null,
  kind text not null default 'signed_book' check (kind in ('signed_book', 'bookmark', 'print', 'sticker', 'other')),
  title text not null,
  description text not null default '',
  price_cents int not null check (price_cents between 100 and 99999),
  stock int not null default 0 check (stock >= 0),
  personalize boolean not null default false,
  -- R2 key of a photo for the listing
  photo_key text,
  active boolean not null default true,
  rights_confirmed_at timestamptz,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists shop_items_author_idx on public.shop_items (author_user_id, sort);
create index if not exists shop_items_project_idx on public.shop_items (project_id);
alter table public.shop_items enable row level security;

-- Per author: flat US shipping (first item, each extra) and how many business days they take to ship
create table if not exists public.shop_settings (
  author_user_id uuid primary key references auth.users(id) on delete cascade,
  ship_first_cents int not null default 500 check (ship_first_cents between 0 and 10000),
  ship_each_cents int not null default 100 check (ship_each_cents between 0 and 10000),
  handling_days int not null default 5 check (handling_days between 1 and 10),
  paused_at timestamptz,
  paused_reason text,
  updated_at timestamptz not null default now()
);
alter table public.shop_settings enable row level security;

alter table public.book_purchases drop constraint if exists book_purchases_format_check;
alter table public.book_purchases add constraint book_purchases_format_check check (format in ('ebook', 'audiobook', 'extra', 'paperback', 'item'));
alter table public.book_purchases add column if not exists item_id uuid;
alter table public.book_purchases add column if not exists quantity int not null default 1;
alter table public.book_purchases add column if not exists personalization text;
alter table public.book_purchases add column if not exists ship_by date;
alter table public.book_purchases add column if not exists carrier text;
create index if not exists book_purchases_item_orders_idx on public.book_purchases (author_user_id, format, shipped_at);
