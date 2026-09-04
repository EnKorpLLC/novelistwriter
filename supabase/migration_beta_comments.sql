-- Author can mark beta comments complete or delete them.
alter table public.beta_comments
  add column if not exists completed boolean not null default false;

drop policy if exists "beta_comments_update" on public.beta_comments;
create policy "beta_comments_update" on public.beta_comments for update using (
  exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
);

drop policy if exists "beta_comments_delete" on public.beta_comments;
create policy "beta_comments_delete" on public.beta_comments for delete using (
  exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
);
