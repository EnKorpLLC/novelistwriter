-- Reader lists: deleting a beta or ARC reader from your lists (their comments and reviews stay), and launch team invites. Safe to run again.
alter table public.beta_invites add column if not exists removed_at timestamptz;
alter table public.arc_invites add column if not exists removed_at timestamptz;

create table if not exists public.launch_team_invites (
  project_id uuid not null references public.projects(id) on delete cascade,
  email text not null,
  invited_at timestamptz not null default now(),
  primary key (project_id, email)
);
alter table public.launch_team_invites enable row level security;
