-- Referral program: unique share codes + attribution
-- Run in Supabase SQL editor

alter table public.profiles
  add column if not exists referral_code text,
  add column if not exists referred_by uuid references public.profiles(id) on delete set null;

create unique index if not exists profiles_referral_code_uidx
  on public.profiles (referral_code)
  where referral_code is not null;

create index if not exists profiles_referred_by_idx
  on public.profiles (referred_by)
  where referred_by is not null;

-- Backfill codes for existing users
update public.profiles
set referral_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
where referral_code is null;

-- New users get a referral code at signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, referral_code)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
  );
  insert into public.credit_balances (user_id, balance, free_ai_taste_remaining)
  values (new.id, 0, 3);
  return new;
end;
$$;
