-- Public reader reviews on launch pages and in the store. Safe to run again.
-- One review per reader per book, labeled by how they read it: bought here, an advance (ARC) copy, or a beta draft.
-- Beta and ARC reviews only appear here when the reader chose to show them.

create table if not exists public.book_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  reviewer_user_id uuid not null references auth.users(id) on delete cascade,
  reviewer_name text not null default '',
  source text not null check (source in ('purchase', 'arc', 'beta')),
  stars int not null check (stars between 1 and 5),
  body text not null default '',
  status text not null default 'published' check (status in ('published', 'hidden')),
  author_reply text,
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, reviewer_user_id)
);
create index if not exists book_reviews_project_idx on public.book_reviews (project_id, status, created_at desc);
alter table public.book_reviews enable row level security;
