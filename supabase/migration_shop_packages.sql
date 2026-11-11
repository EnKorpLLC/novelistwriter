-- Physical sales PH4: packages (a physical item with digital copies included), numbered limited editions, and
-- physical pre-orders. Run after migration_shop.sql. Safe to run again.

alter table public.shop_items drop constraint if exists shop_items_kind_check;
alter table public.shop_items add constraint shop_items_kind_check check (kind in ('signed_book', 'bookmark', 'print', 'sticker', 'other', 'package'));
-- Digital copies delivered with it: { ebook: projectId, audiobook: projectId, extraIds: [...] }
alter table public.shop_items add column if not exists includes jsonb not null default '{}'::jsonb;
-- A numbered edition: how many will ever be made (each order gets the next numbers)
alter table public.shop_items add column if not exists limited_total int check (limited_total is null or limited_total between 1 and 100000);
-- A pre-order: the date it's ready to ship (orders are due a few business days after)
alter table public.shop_items add column if not exists ships_on date;

alter table public.book_purchases add column if not exists edition_number int;
