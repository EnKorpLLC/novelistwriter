-- Beta reader platform: roles, ready flag, social comments, book reviews.
-- Run after migration_beta_access.sql / migration_beta_comments.sql.

-- Profiles: dual roles (one auth user per email)
alter table public.profiles
  add column if not exists is_author boolean not null default true;

alter table public.profiles
  add column if not exists is_beta_reader boolean not null default false;

alter table public.profiles
  add column if not exists beta_onboarded_at timestamptz;

update public.profiles set is_author = true where is_author is distinct from true;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  role_hint text := coalesce(new.raw_user_meta_data->>'signup_role', 'author');
  as_author boolean := role_hint is distinct from 'beta_reader';
  as_beta boolean := role_hint = 'beta_reader';
begin
  insert into public.profiles (id, email, display_name, referral_code, is_author, is_beta_reader, beta_onboarded_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
    as_author,
    as_beta,
    case when as_beta then now() else null end
  );
  insert into public.credit_balances (user_id, balance, free_ai_taste_remaining)
  values (new.id, 0, 3);
  return new;
end;
$$;

-- Projects: open for beta catalog
alter table public.projects
  add column if not exists beta_ready boolean not null default false;

-- Backfill: books with active beta readers are ready; others stay false
update public.projects p
set beta_ready = true
where exists (
  select 1
  from public.beta_invites i
  where i.project_id = p.id
    and i.status in ('pending', 'accepted', 'dnf')
);

-- Invites linked to logged-in readers
alter table public.beta_invites
  add column if not exists reader_user_id uuid references auth.users(id) on delete set null;

alter table public.beta_invites
  add column if not exists finished_at timestamptz;

create index if not exists idx_beta_invites_reader_user
  on public.beta_invites(reader_user_id)
  where reader_user_id is not null;

-- Comment threading + author replies
alter table public.beta_comments
  add column if not exists parent_id uuid references public.beta_comments(id) on delete cascade;

alter table public.beta_comments
  add column if not exists author_user_id uuid references auth.users(id) on delete set null;

alter table public.beta_comments
  add column if not exists reader_user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_beta_comments_parent on public.beta_comments(parent_id);
create index if not exists idx_beta_comments_invite on public.beta_comments(invite_id);

-- Author reactions on comments
create table if not exists public.beta_comment_reactions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.beta_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('thumbsup', 'thumbsdown', 'heart', 'laugh', 'thanks')),
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);

create index if not exists idx_beta_reactions_comment on public.beta_comment_reactions(comment_id);

alter table public.beta_comment_reactions enable row level security;

drop policy if exists "beta_reactions_select" on public.beta_comment_reactions;
create policy "beta_reactions_select" on public.beta_comment_reactions for select using (
  exists (
    select 1 from public.beta_comments c
    join public.projects p on p.id = c.project_id
    where c.id = comment_id
      and (
        p.user_id = auth.uid()
        or exists (
          select 1 from public.beta_invites i
          where i.id = c.invite_id and i.reader_user_id = auth.uid()
        )
        or c.reader_user_id = auth.uid()
      )
  )
);

drop policy if exists "beta_reactions_author_write" on public.beta_comment_reactions;
create policy "beta_reactions_author_write" on public.beta_comment_reactions for all using (
  exists (
    select 1 from public.beta_comments c
    join public.projects p on p.id = c.project_id
    where c.id = comment_id and p.user_id = auth.uid()
  )
) with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.beta_comments c
    join public.projects p on p.id = c.project_id
    where c.id = comment_id and p.user_id = auth.uid()
  )
);

-- Finished-book reviews (public while beta_ready)
create table if not exists public.beta_book_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  invite_id uuid not null references public.beta_invites(id) on delete cascade,
  reader_user_id uuid references auth.users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  unique (project_id, invite_id)
);

create index if not exists idx_beta_reviews_project on public.beta_book_reviews(project_id);

alter table public.beta_book_reviews enable row level security;

drop policy if exists "beta_reviews_select" on public.beta_book_reviews;
create policy "beta_reviews_select" on public.beta_book_reviews for select using (
  exists (
    select 1 from public.projects p
    where p.id = project_id
      and (p.user_id = auth.uid() or p.beta_ready = true)
  )
  or reader_user_id = auth.uid()
);

drop policy if exists "beta_reviews_insert" on public.beta_book_reviews;
create policy "beta_reviews_insert" on public.beta_book_reviews for insert with check (
  reader_user_id = auth.uid()
  and exists (
    select 1 from public.beta_invites i
    where i.id = invite_id
      and i.project_id = project_id
      and i.reader_user_id = auth.uid()
      and i.status in ('pending', 'accepted', 'dnf')
  )
);

drop policy if exists "beta_reviews_update_own" on public.beta_book_reviews;
create policy "beta_reviews_update_own" on public.beta_book_reviews for update using (
  reader_user_id = auth.uid()
) with check (
  reader_user_id = auth.uid()
);

-- Catalog browse: authenticated readers can see ready project metadata (not chapter bodies)
drop policy if exists "projects_beta_ready_select" on public.projects;
create policy "projects_beta_ready_select" on public.projects for select using (
  beta_ready = true and auth.uid() is not null
);

create index if not exists idx_projects_beta_ready_genre
  on public.projects(genre)
  where beta_ready = true;
