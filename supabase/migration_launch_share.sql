-- Release 2 (Sharing): author handles and book slugs, launch pages, author mini-sites,
-- share visit tracking, and confirmed guest signups to author lists.
-- Run after migration_ai_disclosure.sql.

create or replace function public.nw_slugify(input text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g'))
$$;

-- Author mini-site
alter table public.profiles add column if not exists handle text;
alter table public.profiles add column if not exists bio text not null default '';
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists banner_path text;
alter table public.profiles add column if not exists site_theme text not null default 'paper';
alter table public.profiles
  add column if not exists featured_project_id uuid references public.projects(id) on delete set null;

create unique index if not exists profiles_handle_uidx
  on public.profiles (lower(handle))
  where handle is not null;

-- Launch page
alter table public.projects add column if not exists slug text;
alter table public.projects add column if not exists tagline text not null default '';
alter table public.projects add column if not exists release_date date;
alter table public.projects add column if not exists launch_public boolean not null default false;

create unique index if not exists projects_user_slug_uidx
  on public.projects (user_id, lower(slug))
  where slug is not null;

-- Give every existing author a handle and every existing book a slug
do $$
declare
  r record;
  base text;
  candidate text;
  n int;
begin
  for r in select id, display_name, email from public.profiles where handle is null loop
    base := left(public.nw_slugify(coalesce(nullif(r.display_name, ''), split_part(coalesce(r.email, ''), '@', 1))), 30);
    if base is null or length(base) < 3 then base := 'author'; end if;
    candidate := base;
    n := 1;
    while exists (select 1 from public.profiles where lower(handle) = candidate) loop
      n := n + 1;
      candidate := base || '-' || n;
    end loop;
    update public.profiles set handle = candidate where id = r.id;
  end loop;

  for r in select id, user_id, title from public.projects where slug is null loop
    base := left(public.nw_slugify(r.title), 60);
    if base is null or base = '' then base := 'book'; end if;
    candidate := base;
    n := 1;
    while exists (
      select 1 from public.projects where user_id = r.user_id and lower(slug) = candidate
    ) loop
      n := n + 1;
      candidate := base || '-' || n;
    end loop;
    update public.projects set slug = candidate where id = r.id;
  end loop;
end $$;

-- Arrivals through an author's share link (one row per visitor per author per day)
create table if not exists public.share_visits (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  visitor_hash text not null,
  day date not null,
  path text not null default '',
  created_at timestamptz not null default now(),
  unique (referrer_user_id, visitor_hash, day)
);

create index if not exists idx_share_visits_referrer on public.share_visits(referrer_user_id, day);

alter table public.share_visits enable row level security;

drop policy if exists "share_visits_own" on public.share_visits;
create policy "share_visits_own" on public.share_visits for select using (
  referrer_user_id = auth.uid()
);

-- Guests who join an author's list must confirm by email before they count
alter table public.author_subscribers add column if not exists confirmed_at timestamptz;
alter table public.author_subscribers add column if not exists confirm_token text;
alter table public.author_subscribers add column if not exists confirm_sent_at timestamptz;

create unique index if not exists author_subscribers_confirm_token_uidx
  on public.author_subscribers (confirm_token)
  where confirm_token is not null;

do $$
begin
  if not exists (select 1 from public.app_migrations where name = 'subscribers_confirmed_backfill') then
    -- Everyone already on a list got there by joining a book or opting in while signed in
    update public.author_subscribers set confirmed_at = subscribed_at where confirmed_at is null;
    insert into public.app_migrations (name) values ('subscribers_confirmed_backfill');
  end if;
end $$;
