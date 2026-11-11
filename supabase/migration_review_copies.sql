-- Audiobook studio A4b: review copies the narrator sends the author, and the 15-minute checkpoint.
-- Run after migration_narrators.sql. Safe to run again.

-- A small MP3 of a chapter as it stands, stored in Cloudflare R2 for 30 days or until the chapter is approved
create table if not exists public.audio_review_copies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  -- Who sent it (the narrator)
  user_id uuid not null references auth.users(id) on delete cascade,
  r2_key text not null,
  bytes bigint not null default 0,
  duration_ms int not null default 0,
  -- Where each sentence starts in this copy, so the author's notes land on the right line
  cuts jsonb not null default '[]'::jsonb,
  is_checkpoint boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  deleted_at timestamptz
);
create index if not exists audio_review_copies_chapter_idx on public.audio_review_copies (chapter_id, created_at desc);
create index if not exists audio_review_copies_expiry_idx on public.audio_review_copies (expires_at) where deleted_at is null;
alter table public.audio_review_copies enable row level security;

-- The checkpoint: the narrator's first ~15 minutes, approved before full production
alter table public.narrator_jobs add column if not exists checkpoint_status text not null default 'pending'
  check (checkpoint_status in ('pending', 'submitted', 'approved', 'changes'));
alter table public.narrator_jobs add column if not exists checkpoint_copy_id uuid;
alter table public.narrator_jobs add column if not exists checkpoint_note text;
alter table public.narrator_jobs add column if not exists checkpoint_at timestamptz;
