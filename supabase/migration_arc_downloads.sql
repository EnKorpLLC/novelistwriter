-- Lets an author turn off EPUB downloads for ARC readers, so the book is only read in the browser. Safe to run again.
alter table public.projects add column if not exists arc_downloads boolean not null default true;
