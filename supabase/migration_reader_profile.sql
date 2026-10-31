-- Readers choose whether their reader profile (badges and reading stats) is public at /r/<handle>.
-- Run after migration_reader_badges.sql.

alter table public.profiles add column if not exists reader_profile_public boolean not null default false;
