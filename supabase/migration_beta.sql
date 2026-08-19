-- Expand beta invite statuses: applications (requested/denied) plus remove (revoked).
alter table public.beta_invites drop constraint if exists beta_invites_status_check;
alter table public.beta_invites
  add constraint beta_invites_status_check
  check (status in ('pending', 'requested', 'accepted', 'denied', 'revoked'));
