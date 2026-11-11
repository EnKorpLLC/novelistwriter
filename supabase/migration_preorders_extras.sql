-- Direct pre-orders, digital extras, and box sets sold as one ebook. Safe to run again.
-- Run after migration_audiobook_sales.sql.

-- Pre-orders: the release date the buyer was promised, and when the ebook reached them
alter table public.book_purchases add column if not exists preorder_release date;
alter table public.book_purchases add column if not exists delivered_at timestamptz;
create index if not exists book_purchases_preorder_idx on public.book_purchases (project_id) where preorder_release is not null and delivered_at is null;

-- Digital extras (character art, maps, bonus writing). Files live in R2 under extras/<projectId>/<extraId>/
create table if not exists public.book_extras (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  kind text not null default 'art' check (kind in ('art', 'writing')),
  -- Null when it isn't sold on its own
  price_cents int check (price_cents is null or price_cents between 99 and 9999),
  -- Free for everyone who buys the ebook here
  with_ebook boolean not null default false,
  -- [{ name, key, bytes }]
  files jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  rights_confirmed_at timestamptz,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists book_extras_project_idx on public.book_extras (project_id, sort);
alter table public.book_extras enable row level security;

alter table public.book_purchases add column if not exists extra_id uuid;
alter table public.book_purchases drop constraint if exists book_purchases_format_check;
alter table public.book_purchases add constraint book_purchases_format_check check (format in ('ebook', 'audiobook', 'extra'));

-- A box set sold as one ebook: a bundle tied to the box set (box sets hold up to 12 books)
alter table public.book_bundles add column if not exists box_set_id uuid references public.box_sets(id) on delete cascade;
create unique index if not exists book_bundles_box_set_uidx on public.book_bundles (box_set_id) where box_set_id is not null;
alter table public.book_bundles drop constraint if exists book_bundles_check;
alter table public.book_bundles drop constraint if exists book_bundles_project_ids_check;
alter table public.book_bundles add constraint book_bundles_project_ids_check check (cardinality(project_ids) between 2 and 12);
alter table public.book_purchases add column if not exists box_set_id uuid;
