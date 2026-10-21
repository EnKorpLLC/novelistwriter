-- Site metrics for the admin dashboard: first-party page views (no cookies; visitor ids rotate daily)
-- and where each new account came from.
-- Run after migration_writing_record.sql.

create table if not exists public.site_page_views (
  id bigint generated always as identity primary key,
  day date not null,
  path text not null,
  referrer_host text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  visitor_hash text not null,
  signed_in boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_site_page_views_day on public.site_page_views(day);

-- Written and read by the service role only
alter table public.site_page_views enable row level security;

-- First-touch source captured at signup: { utm_source, utm_medium, utm_campaign, referrer_host, landing_path }
alter table public.profiles add column if not exists signup_source jsonb;
