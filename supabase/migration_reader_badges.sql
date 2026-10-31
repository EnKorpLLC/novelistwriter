-- Author's per-book choice of what readers see on Beta and ARC listings (reader dashboard Available tab,
-- blurb popup, and the beta / ARC book pages).
-- Run after migration_reader_insights.sql.

-- "No AI used on this book", "AI tools off since…", and the AI action list (if that list is also public)
alter table public.projects add column if not exists reader_show_badges boolean not null default true;

-- Writing record summary: the "Written in Novelist Writer" badge, share typed here, sessions, and days
alter table public.projects add column if not exists reader_show_record boolean not null default false;
