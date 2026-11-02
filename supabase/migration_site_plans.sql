-- Author sites and book launch pages move to Pro and up. When a paid plan ends they stay public
-- for 7 more days (site_grace_until). Run after migration_reader_profile.sql.

alter table public.credit_balances add column if not exists site_grace_until timestamptz;

-- One-time: free authors who already have public pages keep them for 7 days after this runs,
-- so links they've shared don't go dark without warning.
update public.credit_balances cb
set site_grace_until = now() + interval '7 days'
where coalesce(cb.subscription_tier, 'free') not in ('pro', 'studio')
  and (cb.pass_active_until is null or cb.pass_active_until < now())
  and exists (
    select 1 from public.projects p
    where p.user_id = cb.user_id and (p.launch_public or p.published)
  );
