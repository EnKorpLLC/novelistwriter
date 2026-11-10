-- Audiobook studio A1: takes and recording sessions. Audio files stay on the narrator's computer;
-- this stores only what the studio and the narration record need. Safe to run again.

create table if not exists public.audio_takes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  -- Whoever recorded it (the author now; invited narrators in A4)
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid,
  take_no int not null,
  -- File name in the narrator's chosen folder, so the studio can find it again
  file_name text not null,
  -- Sentence the take starts from (0 = the chapter's start); pickups start later
  from_sentence int not null default 0,
  duration_ms int not null default 0,
  sample_rate int not null default 48000,
  peak_db real,
  rms_db real,
  chosen boolean not null default false,
  -- Recorded somewhere else and brought in: doesn't count toward "Recorded in Novelist Writer"
  imported boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists audio_takes_chapter_idx on public.audio_takes (chapter_id, take_no);
create index if not exists audio_takes_project_idx on public.audio_takes (project_id);
alter table public.audio_takes enable row level security;

create table if not exists public.narration_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  recorded_ms int not null default 0,
  takes int not null default 0,
  -- Room check at the start of the session
  noise_floor_db real,
  room_tone_file text
);
create index if not exists narration_sessions_project_idx on public.narration_sessions (project_id, started_at);
alter table public.narration_sessions enable row level security;
