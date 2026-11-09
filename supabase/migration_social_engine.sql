-- Social content engine (G5): a daily queue of posts for Novelist Writer's own accounts. Nothing posts without
-- admin approval. Captions come from written templates, never AI. Safe to run again. Run after migration_reader_digest.sql.

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  -- release, arc, beta, launch, challenge, milestone, tip
  kind text not null,
  -- One post per thing: "release:<projectId>", "tip:spine:2026-46"
  ref_key text not null unique,
  caption text not null,
  -- Page the post points to (tagged per network when shared)
  link_path text not null,
  -- What the post image shows
  image_title text not null default '',
  image_subtitle text not null default '',
  image_kicker text not null default '',
  image_cover_url text,
  project_id uuid references public.projects(id) on delete set null,
  author_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'posted', 'skipped')),
  -- { "bluesky": { "at": iso, "url": "...", "error": null, "manual": false } }
  results jsonb not null default '{}'::jsonb,
  suggested_on date not null default current_date,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists social_posts_status_idx on public.social_posts (status, suggested_on);
alter table public.social_posts enable row level security;

-- Authors choose to have their books featured on Novelist Writer's accounts
alter table public.profiles add column if not exists feature_on_socials boolean not null default false;
