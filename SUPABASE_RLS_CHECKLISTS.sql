alter table public.checklists enable row level security;

alter table public.checklists force row level security;

drop policy if exists "checklists_select_own" on public.checklists;
create policy "checklists_select_own"
on public.checklists
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "checklists_insert_own" on public.checklists;
create policy "checklists_insert_own"
on public.checklists
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "checklists_update_own" on public.checklists;
create policy "checklists_update_own"
on public.checklists
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "checklists_delete_own" on public.checklists;
create policy "checklists_delete_own"
on public.checklists
for delete
to authenticated
using (auth.uid() = user_id);

revoke all on table public.checklists from anon;
revoke all on table public.checklists from authenticated;

grant select, insert, update, delete on table public.checklists to authenticated;
