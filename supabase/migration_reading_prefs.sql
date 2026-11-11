-- Readers' reading preferences: genres they want, genres they don't, and content warnings to skip. Safe to run again.
-- { "likeGenres": [...], "avoidGenres": [...], "avoidWarnings": [...] }
alter table public.profiles add column if not exists reading_prefs jsonb not null default '{}'::jsonb;
