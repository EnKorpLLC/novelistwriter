-- Backup / waitlist status for beta applicants (no manuscript access until approved).
-- Run in the Supabase SQL editor after prior beta migrations.

alter table public.beta_invites drop constraint if exists beta_invites_status_check;
alter table public.beta_invites
  add constraint beta_invites_status_check
  check (status in ('pending', 'requested', 'accepted', 'denied', 'revoked', 'dnf', 'backup'));
