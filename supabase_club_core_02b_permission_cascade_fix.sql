-- APPCAUDAL · Etapa A.2b
-- Reparacion idempotente para instalaciones que ya ejecutaron 01-03.
-- Corrige el guard durante ON DELETE CASCADE y restablece los privilegios
-- minimos que necesita authenticated para evaluar RLS y operar por la API.

begin;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.club_member_permissions'::regclass
      and constraint_row.confrelid = 'public.club_memberships'::regclass
      and constraint_row.contype = 'f'
      and constraint_row.confdeltype = 'c'
      and constraint_row.conkey = array[(
        select attribute.attnum
        from pg_catalog.pg_attribute attribute
        where attribute.attrelid = 'public.club_member_permissions'::regclass
          and attribute.attname = 'membership_id'
      )]::smallint[]
      and constraint_row.confkey = array[(
        select attribute.attnum
        from pg_catalog.pg_attribute attribute
        where attribute.attrelid = 'public.club_memberships'::regclass
          and attribute.attname = 'id'
      )]::smallint[]
  ) then
    raise exception
      'La FK membership_id -> club_memberships debe conservar ON DELETE CASCADE';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.club_member_permissions'::regclass
      and trigger_row.tgname = 'guard_club_permission_mutation'
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled <> 'D'
  ) then
    raise exception
      'El trigger guard_club_permission_mutation debe existir y estar activo';
  end if;
end;
$$;

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
  if tg_op = 'UPDATE' and new.membership_id <> old.membership_id then
    perform 1
    from public.club_memberships membership
    where membership.id = old.membership_id;
    if not found then
      raise exception 'Membership original inexistente' using errcode = '23503';
    end if;

    perform 1
    from public.club_memberships membership
    where membership.id = new.membership_id;
    if not found then
      raise exception 'Membership nueva inexistente' using errcode = '23503';
    end if;

    raise exception 'No se puede trasladar un permiso entre memberships'
      using errcode = '23514';
  end if;

  select *
    into target_membership
  from public.club_memberships membership
  where membership.id = target_membership_id;

  if not found then
    -- En la cascada FK el trigger hijo se ejecuta anidado y la membership padre
    -- ya no es consultable. Un DELETE directo se ejecuta con profundidad 1.
    if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
      return old;
    end if;

    raise exception 'Membership inexistente' using errcode = '23503';
  end if;

  perform public.lock_club_memberships(target_membership.club_id);

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

alter function public.guard_club_permission_mutation() owner to postgres;
revoke all on function public.guard_club_permission_mutation()
from public, anon, authenticated;

-- Las funciones consultables por las politicas RLS solo son ejecutables por
-- authenticated. Las funciones internas/trigger no se exponen a la API.
revoke all on function public.is_club_member(uuid) from public, anon;
revoke all on function public.has_club_role(uuid, text[]) from public, anon;
revoke all on function public.can_edit_club_data(uuid) from public, anon;
revoke all on function public.can_manage_club(uuid) from public, anon;
revoke all on function public.has_club_permission(uuid, text) from public, anon;
revoke all on function public.lock_club_memberships(uuid)
from public, anon, authenticated;

grant execute on function public.is_club_member(uuid) to authenticated;
grant execute on function public.has_club_role(uuid, text[]) to authenticated;
grant execute on function public.can_edit_club_data(uuid) to authenticated;
grant execute on function public.can_manage_club(uuid) to authenticated;
grant execute on function public.has_club_permission(uuid, text) to authenticated;

-- Los privilegios de tabla habilitan las operaciones; RLS decide las filas.
-- No se concede INSERT ni DELETE de clubs desde la API.
revoke all on table public.clubs from public, anon;
revoke all on table public.club_memberships from public, anon;
revoke all on table public.club_member_permissions from public, anon;

grant select, update on table public.clubs to authenticated;
grant select, insert, update, delete
on table public.club_memberships to authenticated;
grant select, insert, update, delete
on table public.club_member_permissions to authenticated;

commit;
