-- APPCAUDAL · Etapa A.3
-- RLS exclusiva del nuevo nucleo. No modifica politicas deportivas legacy.

begin;

alter table public.clubs enable row level security;
alter table public.club_memberships enable row level security;
alter table public.club_member_permissions enable row level security;

drop policy if exists "Club members can read club" on public.clubs;
create policy "Club members can read club"
on public.clubs
for select
to authenticated
using (public.is_club_member(id));

drop policy if exists "Club managers can update club" on public.clubs;
create policy "Club managers can update club"
on public.clubs
for update
to authenticated
using (public.can_manage_club(id))
with check (public.can_manage_club(id));

-- No se crea politica DELETE ni INSERT para authenticated en Etapa A.
-- El alta/baja fisica de clubs queda reservada a una migracion administrativa.

drop policy if exists "Club members can read memberships" on public.club_memberships;
create policy "Club members can read memberships"
on public.club_memberships
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_club_member(club_id)
);

drop policy if exists "Club managers can insert memberships" on public.club_memberships;
create policy "Club managers can insert memberships"
on public.club_memberships
for insert
to authenticated
with check (public.can_manage_club(club_id));

drop policy if exists "Club managers can update memberships" on public.club_memberships;
create policy "Club managers can update memberships"
on public.club_memberships
for update
to authenticated
using (public.can_manage_club(club_id))
with check (public.can_manage_club(club_id));

drop policy if exists "Club managers can delete memberships" on public.club_memberships;
create policy "Club managers can delete memberships"
on public.club_memberships
for delete
to authenticated
using (public.can_manage_club(club_id));

drop policy if exists "Members can read permitted permission rows" on public.club_member_permissions;
create policy "Members can read permitted permission rows"
on public.club_member_permissions
for select
to authenticated
using (
  exists (
    select 1
    from public.club_memberships target
    where target.id = membership_id
      and (
        target.user_id = auth.uid()
        or public.can_manage_club(target.club_id)
      )
  )
);

drop policy if exists "Club managers can insert permissions" on public.club_member_permissions;
create policy "Club managers can insert permissions"
on public.club_member_permissions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.club_memberships target
    where target.id = membership_id
      and public.can_manage_club(target.club_id)
  )
);

drop policy if exists "Club managers can update permissions" on public.club_member_permissions;
create policy "Club managers can update permissions"
on public.club_member_permissions
for update
to authenticated
using (
  exists (
    select 1
    from public.club_memberships target
    where target.id = membership_id
      and public.can_manage_club(target.club_id)
  )
)
with check (
  exists (
    select 1
    from public.club_memberships target
    where target.id = membership_id
      and public.can_manage_club(target.club_id)
  )
);

drop policy if exists "Club managers can delete permissions" on public.club_member_permissions;
create policy "Club managers can delete permissions"
on public.club_member_permissions
for delete
to authenticated
using (
  exists (
    select 1
    from public.club_memberships target
    where target.id = membership_id
      and public.can_manage_club(target.club_id)
  )
);

revoke all on table public.clubs from public, anon;
revoke all on table public.club_memberships from public, anon;
revoke all on table public.club_member_permissions from public, anon;

grant select, update on table public.clubs to authenticated;
grant select, insert, update, delete on table public.club_memberships to authenticated;
grant select, insert, update, delete on table public.club_member_permissions to authenticated;

commit;
