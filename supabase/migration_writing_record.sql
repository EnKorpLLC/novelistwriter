-- Release 4 (Writing record): the author's choice to publish a book's writing record.
-- Run after migration_rewards.sql.

alter table public.projects
  add column if not exists record_public boolean not null default false;
