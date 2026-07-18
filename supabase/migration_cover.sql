-- Run in Supabase SQL editor (additive / safe to re-run)
alter table public.projects
  add column if not exists cover_path text;

-- Public = anyone with the URL can *download*. Uploads still need RLS below.
insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do update set public = true;

-- Owners manage files under their own user-id folder (path: {userId}/{projectId}.ext)
drop policy if exists "covers_select_own" on storage.objects;
drop policy if exists "covers_insert_own" on storage.objects;
drop policy if exists "covers_update_own" on storage.objects;
drop policy if exists "covers_delete_own" on storage.objects;

create policy "covers_select_own"
on storage.objects for select to authenticated
using (
  bucket_id = 'covers'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "covers_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'covers'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "covers_update_own"
on storage.objects for update to authenticated
using (
  bucket_id = 'covers'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'covers'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "covers_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'covers'
  and (storage.foldername(name))[1] = auth.uid()::text
);
