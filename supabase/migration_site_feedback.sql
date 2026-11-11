-- "Tell Us What You Think!" feedback from the dashboards: a type, the page it came from, and screenshots.
-- Run after migration_platform_admin.sql. Safe to run again.

alter table public.platform_messages add column if not exists kind text;
alter table public.platform_messages add column if not exists page text;
-- Storage paths in the private site-feedback bucket
alter table public.platform_messages add column if not exists attachments jsonb not null default '[]'::jsonb;

-- Screenshots can show private manuscripts, so the bucket is private; the admin inbox opens them with short-lived links
insert into storage.buckets (id, name, public)
values ('site-feedback', 'site-feedback', false)
on conflict (id) do nothing;
