-- P1: "verified human-written" badge, page, and API for any platform. Safe to run again.

-- A short public code per book (shown as NW-XXXX-XXXX), made the first time the author turns verification on
alter table public.projects add column if not exists verify_code text;
create unique index if not exists projects_verify_code_uidx on public.projects (verify_code) where verify_code is not null;

-- Off by default: the author chooses to make the verification page, badge, and API answer for this book
alter table public.projects add column if not exists verify_public boolean not null default false;
