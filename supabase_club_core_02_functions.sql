-- APPCAUDAL · Etapa A.2
-- Funciones RLS sin recursion y guards de integridad.
-- Debe ejecutarse despues de supabase_club_core_01_tables.sql.

begin;

create or replace function public.is_club_member(target_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    auth.uid() is not null
    and target_club_id is not null
    and exists (
      select 1
      from public.club_memberships membership
      where membership.club_id = target_club_id
        and membership.user_id = auth.uid()
        and membership.is_active
    );
$$;

create or replace function public.has_club_role(
  target_club_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    auth.uid() is not null
    and target_club_id is not null
    and coalesce(array_length(allowed_roles, 1), 0) > 0
    and exists (
      select 1
      from public.club_memberships membership
      where membership.club_id = target_club_id
        and membership.user_id = auth.uid()
        and membership.is_active
        and membership.role = any(allowed_roles)
    );
$$;

create or replace function public.can_edit_club_data(target_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select public.has_club_role(
    target_club_id,
    array['owner', 'admin', 'staff']::text[]
  );
$$;

create or replace function public.can_manage_club(target_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select public.has_club_role(
    target_club_id,
    array['owner', 'admin']::text[]
  );
$$;

create or replace function public.has_club_permission(
  target_club_id uuid,
  target_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    auth.uid() is not null
    and target_club_id is not null
    and target_permission_key is not null
    and exists (
      select 1
      from public.club_memberships membership
      join public.club_member_permissions permission
        on permission.membership_id = membership.id
      where membership.club_id = target_club_id
        and membership.user_id = auth.uid()
        and membership.is_active
        and permission.permission_key = target_permission_key
    );
$$;

-- Serializa todas las mutaciones de memberships de un mismo club. De este modo
-- dos transacciones concurrentes no pueden eliminar/degradar owners a la vez.
create or replace function public.lock_club_memberships(target_club_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if target_club_id is null then
    raise exception 'club_id es obligatorio';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(target_club_id::text, 20260725)
  );
end;
$$;

create or replace function public.guard_club_membership_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  actor_id uuid := auth.uid();
  target_club_id uuid := coalesce(new.club_id, old.club_id);
  actor_role text;
  other_active_owners integer;
  removes_active_owner boolean := false;
begin
  perform public.lock_club_memberships(target_club_id);

  -- Operaciones administrativas ejecutadas sin JWT (migraciones/SQL Editor)
  -- siguen protegidas por CHECK, FK y la regla transaccional del ultimo owner.
  if actor_id is not null then
    select membership.role
      into actor_role
    from public.club_memberships membership
    where membership.club_id = target_club_id
      and membership.user_id = actor_id
      and membership.is_active;

    if actor_role not in ('owner', 'admin') then
      raise exception 'No puede gestionar miembros de este club'
        using errcode = '42501';
    end if;

    if tg_op = 'INSERT' then
      if new.user_id = actor_id then
        raise exception 'Un usuario no puede incorporarse por si mismo'
          using errcode = '42501';
      end if;
      if actor_role = 'admin' and new.role not in ('staff', 'viewer') then
        raise exception 'Un admin solo puede incorporar staff o viewer'
          using errcode = '42501';
      end if;
    else
      if old.club_id <> new.club_id and tg_op = 'UPDATE' then
        raise exception 'No se puede trasladar una membership entre clubs'
          using errcode = '23514';
      end if;
      if old.user_id <> new.user_id and tg_op = 'UPDATE' then
        raise exception 'No se puede cambiar el usuario de una membership'
          using errcode = '23514';
      end if;

      if actor_role = 'admin' then
        if old.role = 'owner' or (tg_op = 'UPDATE' and new.role = 'owner') then
          raise exception 'Un admin no puede gestionar owners'
            using errcode = '42501';
        end if;
        if tg_op = 'UPDATE' and new.role not in ('staff', 'viewer') then
          raise exception 'Un admin no puede crear ni modificar admins u owners'
            using errcode = '42501';
        end if;
      end if;

      if old.user_id = actor_id then
        if actor_role <> 'owner' then
          raise exception 'Un usuario no puede modificar su propia membership'
            using errcode = '42501';
        end if;
        if tg_op = 'UPDATE' and (
          (not old.is_active and new.is_active)
          or (
            case new.role
              when 'owner' then 4 when 'admin' then 3
              when 'staff' then 2 when 'viewer' then 1 else 0
            end
            >
            case old.role
              when 'owner' then 4 when 'admin' then 3
              when 'staff' then 2 when 'viewer' then 1 else 0
            end
          )
        ) then
          raise exception 'Un usuario no puede elevarse ni reactivarse'
            using errcode = '42501';
        end if;
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    removes_active_owner := old.role = 'owner' and old.is_active;
  elsif tg_op = 'UPDATE' then
    removes_active_owner :=
      old.role = 'owner'
      and old.is_active
      and (new.role <> 'owner' or not new.is_active);
  end if;

  if removes_active_owner then
    select count(*)
      into other_active_owners
    from public.club_memberships membership
    where membership.club_id = old.club_id
      and membership.role = 'owner'
      and membership.is_active
      and membership.id <> old.id;

    if other_active_owners = 0 then
      raise exception 'El club debe conservar al menos un owner activo'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_club_membership_mutation
on public.club_memberships;
create trigger guard_club_membership_mutation
before insert or update or delete on public.club_memberships
for each row execute function public.guard_club_membership_mutation();

create or replace function public.guard_club_permission_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  actor_id uuid := auth.uid();
  target_membership_id uuid := coalesce(new.membership_id, old.membership_id);
  target_membership public.club_memberships%rowtype;
  actor_role text;
begin
  select *
    into target_membership
  from public.club_memberships membership
  where membership.id = target_membership_id;

  if not found then
    raise exception 'Membership inexistente' using errcode = '23503';
  end if;

  perform public.lock_club_memberships(target_membership.club_id);

  if tg_op = 'UPDATE' and new.membership_id <> old.membership_id then
    raise exception 'No se puede trasladar un permiso entre memberships'
      using errcode = '23514';
  end if;

  if actor_id is not null then
    select membership.role
      into actor_role
    from public.club_memberships membership
    where membership.club_id = target_membership.club_id
      and membership.user_id = actor_id
      and membership.is_active;

    if actor_role not in ('owner', 'admin') then
      raise exception 'No puede gestionar permisos de este club'
        using errcode = '42501';
    end if;
    if target_membership.user_id = actor_id then
      raise exception 'Un usuario no puede gestionar sus propios permisos'
        using errcode = '42501';
    end if;
    if actor_role = 'admin' and target_membership.role = 'owner' then
      raise exception 'Un admin no puede gestionar permisos de un owner'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_club_permission_mutation
on public.club_member_permissions;
create trigger guard_club_permission_mutation
before insert or update or delete on public.club_member_permissions
for each row execute function public.guard_club_permission_mutation();

revoke all on function public.is_club_member(uuid) from public, anon;
revoke all on function public.has_club_role(uuid, text[]) from public, anon;
revoke all on function public.can_edit_club_data(uuid) from public, anon;
revoke all on function public.can_manage_club(uuid) from public, anon;
revoke all on function public.has_club_permission(uuid, text) from public, anon;
revoke all on function public.lock_club_memberships(uuid) from public, anon, authenticated;

grant execute on function public.is_club_member(uuid) to authenticated;
grant execute on function public.has_club_role(uuid, text[]) to authenticated;
grant execute on function public.can_edit_club_data(uuid) to authenticated;
grant execute on function public.can_manage_club(uuid) to authenticated;
grant execute on function public.has_club_permission(uuid, text) to authenticated;

-- Las funciones trigger no son API publicas.
revoke all on function public.guard_club_membership_mutation() from public, anon, authenticated;
revoke all on function public.guard_club_permission_mutation() from public, anon, authenticated;

-- En Supabase estas funciones deben pertenecer al rol administrativo postgres,
-- nunca a un rol de aplicacion controlable por usuarios.
alter function public.is_club_member(uuid) owner to postgres;
alter function public.has_club_role(uuid, text[]) owner to postgres;
alter function public.can_edit_club_data(uuid) owner to postgres;
alter function public.can_manage_club(uuid) owner to postgres;
alter function public.has_club_permission(uuid, text) owner to postgres;
alter function public.lock_club_memberships(uuid) owner to postgres;
alter function public.guard_club_membership_mutation() owner to postgres;
alter function public.guard_club_permission_mutation() owner to postgres;

commit;
