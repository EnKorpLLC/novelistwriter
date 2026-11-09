-- Weekly reader digest (G4): opt-in email every Thursday with launches, new books, promos, and free advance copies.
-- Sent through email_queue in Gmail-sized batches. Safe to run again. Run after migration_affiliates.sql.

alter table public.profiles add column if not exists reader_digest boolean not null default false;
-- Optional comma-separated genres to focus on; empty means everything
alter table public.profiles add column if not exists reader_digest_genres text not null default '';
-- Last day a digest was queued, so a re-run never sends twice
alter table public.profiles add column if not exists reader_digest_sent_on date;
create index if not exists profiles_reader_digest_idx on public.profiles (reader_digest) where reader_digest;

-- Digests go out after launch and list emails that are already waiting
create index if not exists email_queue_kind_pending_idx on public.email_queue (kind, id) where sent_at is null;
