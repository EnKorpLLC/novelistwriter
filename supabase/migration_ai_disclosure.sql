-- Which AI actions ran on a book, kept even after saved reports are deleted,
-- plus the author's choice to list those action names on the book's public pages.
-- Run after migration_proof_trust.sql.

alter table public.projects
  add column if not exists ai_deleted_job_counts jsonb not null default '{}'::jsonb;

alter table public.projects
  add column if not exists ai_disclosure_public boolean not null default false;
