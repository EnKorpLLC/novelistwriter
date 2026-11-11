-- Audiobook studio A5a: selling the audiobook direct, alone or with the ebook. Run after
-- migration_narration_payments.sql and migration_direct_sales_3.sql. Safe to run again.

-- { on, priceCents, bundlePriceCents, humanNarrated } (see AudiobookSale in src/lib/direct-sale-rules.ts)
alter table public.projects add column if not exists audiobook_sale jsonb;

-- The listening copy: one MP3 per chapter and the credits, plus the retail sample, stored in R2
create table if not exists public.audiobook_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  sort int not null default 0,
  title text not null default '',
  file_name text not null,
  r2_key text not null,
  bytes bigint not null default 0,
  duration_ms int not null default 0,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  unique (project_id, file_name)
);
create index if not exists audiobook_files_project_idx on public.audiobook_files (project_id, sort);
alter table public.audiobook_files enable row level security;

-- Which format a purchase row is; ebook + audiobook in one checkout is two rows with one order_ref
alter table public.book_purchases add column if not exists format text not null default 'ebook';
alter table public.book_purchases drop constraint if exists book_purchases_format_check;
alter table public.book_purchases add constraint book_purchases_format_check check (format in ('ebook', 'audiobook'));
-- A narrator's royalty share of an audiobook sale, taken from the author's share
alter table public.book_purchases add column if not exists royalty_cents int not null default 0;

-- Royalty payouts wait out the refund window like author payouts
alter table public.narration_payouts add column if not exists available_at timestamptz not null default now();
alter table public.narration_payouts add column if not exists purchase_id uuid;
