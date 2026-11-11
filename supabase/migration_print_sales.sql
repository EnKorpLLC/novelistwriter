-- Physical sales PH1 and PH2: paperbacks printed and shipped by Lulu, sold direct. Run after migration_preorders_extras.sql.
-- Safe to run again.

-- One paperback edition per book: Lulu's product, the print-ready files in R2, their checks, the proof, and the price
create table if not exists public.print_editions (
  project_id uuid primary key references public.projects(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  trim text not null default '6x9',
  paper text not null default 'cream' check (paper in ('cream', 'white')),
  finish text not null default 'matte' check (finish in ('matte', 'gloss')),
  page_count int not null default 0,
  interior_key text,
  cover_key text,
  -- none, checking, ok, error
  interior_status text not null default 'none',
  cover_status text not null default 'none',
  interior_check_id text,
  cover_check_id text,
  file_errors jsonb not null default '[]'::jsonb,
  -- One copy to a US address, before shipping: print plus Lulu's fulfillment fee
  print_cost_cents int,
  proof_ok_at timestamptz,
  price_cents int not null default 1699 check (price_cents between 499 and 99999),
  sale_on boolean not null default false,
  free_ebook boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.print_editions enable row level security;

-- Printed orders live with the other purchases
alter table public.book_purchases drop constraint if exists book_purchases_format_check;
alter table public.book_purchases add constraint book_purchases_format_check check (format in ('ebook', 'audiobook', 'extra', 'paperback'));
alter table public.book_purchases add column if not exists shipping_cents int not null default 0;
alter table public.book_purchases add column if not exists print_cost_cents int not null default 0;
alter table public.book_purchases add column if not exists print_job_id text;
alter table public.book_purchases add column if not exists print_status text;
alter table public.book_purchases add column if not exists tracking_url text;
alter table public.book_purchases add column if not exists shipped_at timestamptz;
-- Where it ships and how, kept so a print job that fails to start can be sent again
alter table public.book_purchases add column if not exists ship_to jsonb;
alter table public.book_purchases add column if not exists ship_level text;
alter table public.book_purchases add column if not exists print_error text;
-- The author's own proof copy: paid at cost, no fee, never paid out
alter table public.book_purchases add column if not exists is_proof boolean not null default false;
create index if not exists book_purchases_print_job_idx on public.book_purchases (print_job_id) where print_job_id is not null;
