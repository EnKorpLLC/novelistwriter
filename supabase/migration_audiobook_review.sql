-- Audiobook studio A2: review notes pinned to sentences, pickups spliced into takes, chapter approval.
-- Run after migration_audiobook.sql. Safe to run again.

-- A pickup covers sentences from_sentence..to_sentence (to_sentence null = to the end of the chapter)
-- and is cut into its parent take between splice_in_ms and splice_out_ms (null = to the end of the parent).
alter table public.audio_takes add column if not exists to_sentence int;
alter table public.audio_takes add column if not exists parent_take_id uuid references public.audio_takes(id) on delete set null;
alter table public.audio_takes add column if not exists splice_in_ms int;
alter table public.audio_takes add column if not exists splice_out_ms int;
alter table public.audio_takes add column if not exists note_id uuid;

create table if not exists public.audio_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sentence int not null,
  to_sentence int not null,
  -- The sentence as it read when the note was made, so the note can find it again if the text changes
  quote text not null default '',
  body text not null default '',
  -- Where in the chapter audio the reviewer was listening
  at_ms int,
  status text not null default 'open' check (status in ('open', 'fixed', 'dismissed')),
  pickup_take_id uuid references public.audio_takes(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists audio_notes_chapter_idx on public.audio_notes (chapter_id, sentence);
create index if not exists audio_notes_project_idx on public.audio_notes (project_id);
alter table public.audio_notes enable row level security;

create table if not exists public.audio_chapters (
  chapter_id uuid primary key references public.chapters(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  status text not null default 'recording' check (status in ('recording', 'review', 'approved')),
  -- Times the chapter went back for more recording after a review
  rounds int not null default 0,
  approved_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists audio_chapters_project_idx on public.audio_chapters (project_id);
alter table public.audio_chapters enable row level security;
