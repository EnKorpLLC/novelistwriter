-- Novelist Writer schema
-- Run in Supabase SQL editor

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  challenge_level int not null default 50 check (challenge_level between 0 and 100),
  word_goal_daily int not null default 500,
  critique_preferences jsonb not null default '{}'::jsonb,
  byok_anthropic_key text,
  byok_openai_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance int not null default 0 check (balance >= 0),
  monthly_allowance_remaining int not null default 0,
  stripe_customer_id text unique,
  subscription_tier text not null default 'free' check (subscription_tier in ('free', 'pro', 'studio')),
  subscription_status text,
  subscription_period_end timestamptz,
  free_ai_taste_remaining int not null default 3,
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta int not null,
  reason text not null,
  job_type text,
  stripe_event_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.project_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_payment_intent text,
  unlocked_at timestamptz not null default now()
);

create table if not exists public.series (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  notes text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  series_id uuid references public.series(id) on delete set null,
  title text not null default 'Untitled Novel',
  subtitle text default '',
  genre text default '',
  pov text default '',
  status text not null default 'draft' check (status in ('draft', 'revising', 'complete')),
  blurb text default '',
  metadata jsonb not null default '{}'::jsonb,
  kdp_settings jsonb not null default '{"trim":"6x9","font":"Garamond","margins":"standard"}'::jsonb,
  is_unlocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Chapter',
  sort_order int not null default 0,
  content_html text not null default '',
  content_text text not null default '',
  word_count int not null default 0,
  goal text default '',
  conflict text default '',
  outcome text default '',
  pov text default '',
  timeline_position text default '',
  summary text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scenes (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Scene',
  sort_order int not null default 0,
  goal text default '',
  conflict text default '',
  outcome text default '',
  pov text default '',
  timeline_position text default '',
  summary text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.bible_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  series_id uuid references public.series(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_type text not null check (entry_type in ('character', 'place', 'note', 'lore', 'rule', 'timeline')),
  name text not null,
  summary text default '',
  details jsonb not null default '{}'::jsonb,
  speech_notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.matter_blocks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  matter_type text not null check (matter_type in (
    'front_copyright', 'front_dedication', 'front_toc', 'front_epigraph',
    'back_also_by', 'back_about_author', 'back_sample', 'back_newsletter'
  )),
  title text not null default '',
  content_html text not null default '',
  enabled boolean not null default true,
  sort_order int not null default 0
);

create table if not exists public.chapter_versions (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content_html text not null,
  content_text text not null,
  word_count int not null default 0,
  label text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete set null,
  job_type text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'complete', 'failed')),
  credit_cost int not null default 0,
  input jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.critique_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.ai_jobs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  severity text not null check (severity in ('must_fix', 'consider', 'style')),
  confidence numeric not null default 0.7,
  category text not null,
  title text not null,
  body text not null,
  citation_excerpt text,
  citation_chapter_id uuid,
  example_text text,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.story_promises (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  planted_chapter_id uuid references public.chapters(id) on delete set null,
  paid_chapter_id uuid references public.chapters(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'paid', 'abandoned')),
  source text not null default 'manual' check (source in ('manual', 'ai')),
  created_at timestamptz not null default now()
);

create table if not exists public.arc_tracks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  arc_type text not null check (arc_type in ('character', 'story', 'relationship')),
  subject text not null,
  beats jsonb not null default '[]'::jsonb,
  notes text default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.writing_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  words_written int not null default 0,
  primary key (user_id, day)
);

create table if not exists public.beta_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now()
);

create table if not exists public.beta_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete cascade,
  invite_id uuid references public.beta_invites(id) on delete set null,
  body text not null,
  excerpt text,
  created_at timestamptz not null default now()
);

create index if not exists idx_projects_user on public.projects(user_id);
create index if not exists idx_chapters_project on public.chapters(project_id, sort_order);
create index if not exists idx_bible_project on public.bible_entries(project_id);
create index if not exists idx_ai_jobs_user on public.ai_jobs(user_id, created_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  insert into public.credit_balances (user_id, balance, free_ai_taste_remaining)
  values (new.id, 0, 3);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.credit_balances enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.project_unlocks enable row level security;
alter table public.series enable row level security;
alter table public.projects enable row level security;
alter table public.chapters enable row level security;
alter table public.scenes enable row level security;
alter table public.bible_entries enable row level security;
alter table public.matter_blocks enable row level security;
alter table public.chapter_versions enable row level security;
alter table public.ai_jobs enable row level security;
alter table public.critique_items enable row level security;
alter table public.story_promises enable row level security;
alter table public.arc_tracks enable row level security;
alter table public.writing_days enable row level security;
alter table public.beta_invites enable row level security;
alter table public.beta_comments enable row level security;

create policy "profiles_own" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "credits_select_own" on public.credit_balances for select using (auth.uid() = user_id);
create policy "ledger_select_own" on public.credit_ledger for select using (auth.uid() = user_id);
create policy "unlocks_own" on public.project_unlocks for select using (auth.uid() = user_id);
create policy "series_own" on public.series for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "projects_own" on public.projects for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "chapters_own" on public.chapters for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "scenes_own" on public.scenes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "bible_own" on public.bible_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "matter_own" on public.matter_blocks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "versions_own" on public.chapter_versions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ai_jobs_own" on public.ai_jobs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "critique_own" on public.critique_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "promises_own" on public.story_promises for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "arcs_own" on public.arc_tracks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "writing_days_own" on public.writing_days for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "beta_invites_own" on public.beta_invites for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "beta_comments_own" on public.beta_comments for select using (
  exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
);
create policy "beta_comments_insert" on public.beta_comments for insert with check (true);

-- Storage bucket note: create private bucket `manuscripts` in dashboard
-- and add policies for authenticated users on folder {user_id}/*
