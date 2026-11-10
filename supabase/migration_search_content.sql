-- Search content (G7): guides, reports, and site pages you edit in admin, plus the monthly AI answer check
-- and a listings checklist. Safe to run again. Run after migration_founding_lifetime.sql.

create table if not exists public.content_pages (
  id uuid primary key default gen_random_uuid(),
  -- guide (/guides/slug), report (/reports/slug), or page (its own address, like /human-authorship-standard)
  kind text not null check (kind in ('guide', 'report', 'page')),
  slug text not null,
  title text not null,
  -- The direct answer, shown first and used as the search description
  summary text not null default '',
  -- Markdown
  body text not null default '',
  faq jsonb not null default '[]'::jsonb,
  author_name text not null default '',
  related_path text not null default '',
  related_label text not null default '',
  -- Report numbers (anonymous platform totals) captured when the report was written
  data jsonb,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, slug)
);
create index if not exists content_pages_published_idx on public.content_pages (kind, status, published_at desc);
alter table public.content_pages enable row level security;

-- Monthly check: do AI tools mention or link Novelist Writer when asked these questions?
create table if not exists public.ai_check_questions (
  id uuid primary key default gen_random_uuid(),
  question text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.ai_answer_checks (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  question_id uuid not null references public.ai_check_questions(id) on delete cascade,
  tool text not null,
  mentioned boolean not null default false,
  linked boolean not null default false,
  notes text not null default '',
  updated_at timestamptz not null default now(),
  unique (month, question_id, tool)
);
alter table public.ai_check_questions enable row level security;
alter table public.ai_answer_checks enable row level security;

insert into public.ai_check_questions (question) values
  ('What is the best writing software for novelists?'),
  ('How can I prove I did not use AI to write my book?'),
  ('How do I find beta readers for my novel?'),
  ('What is the best alternative to Vellum for formatting a book?'),
  ('How do I calculate the spine width for a KDP paperback cover?'),
  ('Where can I find advance reader copy (ARC) readers?')
on conflict (question) do nothing;

-- Directory and review-site listings, tracked by hand
create table if not exists public.listing_checklist (
  key text primary key,
  label text not null,
  url text not null default '',
  status text not null default 'todo' check (status in ('todo', 'submitted', 'live', 'skip')),
  notes text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.listing_checklist enable row level security;

insert into public.listing_checklist (key, label) values
  ('producthunt', 'Product Hunt'),
  ('g2', 'G2'),
  ('capterra', 'Capterra'),
  ('alternativeto', 'AlternativeTo'),
  ('saashub', 'SaaSHub'),
  ('reddit_selfpublish', 'Helpful answers on r/selfpublish (by hand, no links unless asked)'),
  ('quora', 'Helpful answers on Quora (by hand)'),
  ('best_lists', 'Bloggers with "best writing software" lists (offer the affiliate program)')
on conflict (key) do nothing;
