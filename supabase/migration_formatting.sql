-- Formatting and covers: book styles, book details, cover designs, more front and back matter, box sets.
-- Run after migration_money.sql.

-- Style, trim, headings, chapter kinds, and the last print page count
alter table public.projects add column if not exists format_settings jsonb not null default '{}'::jsonb;
-- Pen name, series name and number, ISBNs, imprint, edition, copyright
alter table public.projects add column if not exists book_details jsonb not null default '{}'::jsonb;
-- Cover builder layers (Release 4)
alter table public.projects add column if not exists cover_design jsonb;

-- Carry the old print settings' trim size into the new settings
update public.projects
set format_settings = jsonb_build_object('trim', kdp_settings->>'trim')
where format_settings = '{}'::jsonb and kdp_settings ? 'trim';

-- More front and back matter
alter table public.matter_blocks drop constraint if exists matter_blocks_matter_type_check;
alter table public.matter_blocks add constraint matter_blocks_matter_type_check check (matter_type in (
  'front_copyright', 'front_dedication', 'front_toc', 'front_epigraph',
  'front_foreword', 'front_authors_note', 'front_custom',
  'back_also_by', 'back_about_author', 'back_sample', 'back_newsletter',
  'back_acknowledgments', 'back_authors_note', 'back_review_request', 'back_custom'
));

-- Box sets (Studio, Release 5)
create table if not exists public.box_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  subtitle text not null default '',
  project_ids uuid[] not null default '{}',
  style text not null default 'classic',
  cover_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.box_sets enable row level security;
drop policy if exists box_sets_own on public.box_sets;
create policy box_sets_own on public.box_sets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
