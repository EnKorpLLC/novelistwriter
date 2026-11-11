-- The platform admin account is on Studio (no Stripe subscription, so status 'admin').
-- Safe to run again.
insert into public.credit_balances (user_id, subscription_tier, subscription_status, monthly_allowance_remaining, updated_at)
select p.id, 'studio', 'admin', 1200, now()
from public.profiles p
where p.is_platform_admin or lower(p.email) = 'ryan.jamison87@gmail.com'
on conflict (user_id) do update
set subscription_tier = 'studio',
    subscription_status = 'admin',
    monthly_allowance_remaining = greatest(public.credit_balances.monthly_allowance_remaining, 1200),
    updated_at = now();
