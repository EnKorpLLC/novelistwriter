-- Site text you edit in admin (home page, For authors, For readers, plan lists, pricing questions).
-- Only your edits are stored; anything not edited keeps the built-in wording. Safe to run again.
-- Run after migration_search_content.sql.

create table if not exists public.site_text (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.site_text enable row level security;
