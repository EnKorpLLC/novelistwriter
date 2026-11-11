-- Audiobook studio A3: opening and closing credits takes, and the audiobook's export settings.
-- Run after migration_audiobook_review.sql. Safe to run again.

-- Credits aren't chapters: their takes have a segment instead of a chapter
alter table public.audio_takes alter column chapter_id drop not null;
alter table public.audio_takes add column if not exists segment text check (segment in ('opening', 'closing'));
create index if not exists audio_takes_segment_idx on public.audio_takes (project_id, segment) where segment is not null;

-- Narrator name for the credits, the retail sample's chapter and starting sentence
alter table public.projects add column if not exists audio_settings jsonb not null default '{}'::jsonb;
