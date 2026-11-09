-- Author cross-promotion: newsletter swaps (Studio) and group promos (join on Pro, host on Studio). Safe to run again.
-- Run after migration_author_marketing.sql.

-- Open to swaps: which book to feature and what the author writes
create table if not exists public.swap_listings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  genres text not null default '',
  note text not null default '',
  open boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.swap_listings enable row level security;

-- A swap: each author features the other's book in their newsletter on an agreed day
create table if not exists public.promo_swaps (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  from_project uuid references public.projects(id) on delete set null,
  to_project uuid references public.projects(id) on delete set null,
  -- When each side sends: from_send_on is the requester's send day
  from_send_on date not null,
  to_send_on date not null,
  message text not null default '',
  status text not null default 'requested' check (status in ('requested', 'accepted', 'declined', 'cancelled')),
  from_sent_at timestamptz,
  to_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists promo_swaps_from_idx on public.promo_swaps (from_user, created_at);
create index if not exists promo_swaps_to_idx on public.promo_swaps (to_user, created_at);
alter table public.promo_swaps enable row level security;

-- Group promos: a host gathers books around a theme on a public page, and every author shares it
create table if not exists public.group_promos (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique,
  title text not null,
  genre text not null default '',
  description text not null default '',
  starts_on date not null,
  ends_on date not null,
  apply_by date not null,
  max_books int not null default 30 check (max_books between 2 and 100),
  status text not null default 'open' check (status in ('open', 'cancelled', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists group_promos_dates_idx on public.group_promos (ends_on, starts_on);
alter table public.group_promos enable row level security;

create table if not exists public.group_promo_books (
  promo_id uuid not null references public.group_promos(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'applied' check (status in ('applied', 'approved', 'declined', 'withdrawn')),
  -- e.g. "$0.99 this week" or "Free"
  price_note text not null default '',
  created_at timestamptz not null default now(),
  primary key (promo_id, project_id)
);
create index if not exists group_promo_books_user_idx on public.group_promo_books (user_id);
alter table public.group_promo_books enable row level security;

-- Buy clicks from a group promo page are credited to it
alter table public.buy_clicks add column if not exists source text;

-- Swap and promo notifications
alter table public.beta_notifications drop constraint if exists beta_notifications_type_check;
alter table public.beta_notifications add constraint beta_notifications_type_check check (type in (
  'reader_review',
  'message',
  'author_new_book',
  'author_rerelease',
  'application_update',
  'reading_reminder',
  'author_new_arc',
  'arc_invite',
  'arc_deadline',
  'studio_pass',
  'book_released',
  'arc_review_push',
  'launch_team',
  'author_thanks',
  'reader_milestone',
  'marketing_reminder',
  'cross_promo'
));
