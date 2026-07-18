-- Run in Supabase SQL editor (additive)
alter table public.projects
  add column if not exists cover_path text;

-- Storage: create bucket `covers` (public read) in dashboard, or run:
-- insert into storage.buckets (id, name, public) values ('covers', 'covers', true)
--   on conflict (id) do nothing;
