-- Content warnings an author ticks for a book, from the same list readers filter by (src/lib/reading-prefs.ts). Safe to run again.
alter table public.projects add column if not exists content_warnings text[] not null default '{}';
