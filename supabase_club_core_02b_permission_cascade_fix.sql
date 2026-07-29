-- APPCAUDAL · Etapa A.2b
-- Hotfix idempotente para instalaciones que ya ejecutaron la migracion 02.
-- Corrige exclusivamente el guard de permisos durante ON DELETE CASCADE.

begin;

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

commit;
