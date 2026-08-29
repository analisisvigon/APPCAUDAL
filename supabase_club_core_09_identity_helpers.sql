-- APPCAUDAL - Fase 1 - Bloque 1.2
-- Helpers de identidad y autorizacion derivados exclusivamente de auth.uid().
--
-- Requiere que supabase_club_core_08_player_identity.sql (Bloque 1.1) se haya
-- aplicado previamente. No modifica tablas, RLS, grants de tablas ni datos
-- persistentes. No ha sido ejecutada remotamente.

begin;

-- Auditoria previa: valida el contrato heredado y evita aplicar 1.2 sobre un
-- esquema distinto al aprobado al cerrar 1.1.
do $$
declare
  existing_helper_oid oid;
  existing_helper pg_catalog.pg_proc%rowtype;
begin
  if auth.uid() is not null then
    raise exception
      'Bloque 1.2 debe ejecutarse sin una identidad JWT de aplicacion activa';
  end if;

  if to_regclass('public.club_memberships') is null then
    raise exception 'No existe public.club_memberships';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class table_row
    where table_row.oid = 'public.club_memberships'::regclass
      and table_row.relforcerowsecurity
  ) then
    raise exception
      'club_memberships usa FORCE ROW LEVEL SECURITY; revise el bypass antes de crear helpers';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.club_memberships'::regclass
      and attribute.attname = 'jugador_id'
      and attribute.atttypid = 'uuid'::regtype
      and not attribute.attisdropped
      and not attribute.attnotnull
  ) then
    raise exception
      'Bloque 1.1 no esta aplicado: falta club_memberships.jugador_id uuid nullable';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.club_memberships'::regclass
      and constraint_row.conname = 'club_memberships_role_jugador_check'
      and constraint_row.contype = 'c'
      and constraint_row.convalidated
  ) then
    raise exception
      'Bloque 1.1 no esta aplicado: falta club_memberships_role_jugador_check';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.club_memberships'::regclass
      and constraint_row.conname = 'club_memberships_jugador_id_fkey'
      and constraint_row.contype = 'f'
      and constraint_row.condeferrable
      and not constraint_row.condeferred
      and constraint_row.convalidated
  ) then
    raise exception
      'La FK de Bloque 1.1 debe ser valida, diferible e inicialmente inmediata';
  end if;

  if (select count(*) from public.club_memberships) <> 5
     or (select count(*) from public.club_memberships where is_active) <> 5
     or (select count(*) from public.club_memberships where role = 'owner') <> 1
     or (select count(*) from public.club_memberships where role = 'staff') <> 4
     or (select count(*) from public.club_memberships where role = 'player') <> 0
     or exists (
       select 1
       from public.club_memberships
       where jugador_id is not null
     ) then
    raise exception
      'El inventario previo debe ser 5 activas, 1 owner + 4 staff, sin PLAYER ni jugador_id';
  end if;

  if to_regprocedure('public.current_membership()') is not null
     or to_regprocedure('public.current_jugador_id()') is not null
     or to_regprocedure('public.is_app_staff()') is not null
     or to_regprocedure('public.is_player()') is not null then
    raise exception
      'Ya existe algun helper de Bloque 1.2; revise antes de reemplazar contratos';
  end if;

  -- Los helpers existentes siguen siendo STABLE SECURITY DEFINER con un
  -- search_path fijo, sin EXECUTE para anon/PUBLIC y con EXECUTE autenticado.
  foreach existing_helper_oid in array array[
    'public.is_club_member(uuid)'::regprocedure::oid,
    'public.has_club_role(uuid,text[])'::regprocedure::oid,
    'public.has_club_permission(uuid,text)'::regprocedure::oid,
    'public.can_edit_club_data(uuid)'::regprocedure::oid,
    'public.can_manage_club(uuid)'::regprocedure::oid
  ]
  loop
    select *
      into existing_helper
    from pg_catalog.pg_proc procedure_row
    where procedure_row.oid = existing_helper_oid;

    if not existing_helper.prosecdef
       or existing_helper.provolatile <> 's'
       or not (
         coalesce(existing_helper.proconfig, array[]::text[])
         @> array['search_path=pg_catalog']::text[]
       ) then
      raise exception
        'Helper existente % no conserva STABLE SECURITY DEFINER y search_path seguro',
        existing_helper_oid::regprocedure;
    end if;

    if not pg_catalog.has_function_privilege(
      'authenticated', existing_helper_oid, 'EXECUTE'
    ) or pg_catalog.has_function_privilege(
      'anon', existing_helper_oid, 'EXECUTE'
    ) or exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(
          existing_helper.proacl,
          pg_catalog.acldefault('f', existing_helper.proowner)
        )
      ) acl
      where acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ) then
      raise exception
        'Helper existente % no conserva sus grants minimos',
        existing_helper_oid::regprocedure;
    end if;
  end loop;
end
$$;

-- Unica funcion que lee club_memberships directamente. SECURITY DEFINER evita
-- recursion con las RLS actuales/futuras. No usa parametros controlables por el
-- cliente y no elige silenciosamente entre memberships activas ambiguas.
create function public.current_membership()
returns table (
  membership_id uuid,
  club_id uuid,
  user_id uuid,
  role text,
  jugador_id uuid,
  is_active boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  actor_id uuid := auth.uid();
  active_membership_count integer;
begin
  if actor_id is null then
    return;
  end if;

  select count(*)
    into active_membership_count
  from public.club_memberships membership
  where membership.user_id = actor_id
    and membership.is_active;

  if active_membership_count > 1 then
    raise exception
      'Identidad ambigua: auth.uid() tiene % memberships activas',
      active_membership_count
      using errcode = '21000';
  end if;

  return query
  select
    membership.id,
    membership.club_id,
    membership.user_id,
    membership.role,
    membership.jugador_id,
    membership.is_active
  from public.club_memberships membership
  where membership.user_id = actor_id
    and membership.is_active;
end;
$$;

comment on function public.current_membership() is
'Resuelve la unica membership activa de auth.uid(); devuelve 0 filas sin identidad y lanza 21000 si existe ambiguedad.';

-- Los helpers derivados no necesitan privilegios del definidor: solo consumen
-- el resultado ya acotado de current_membership(). Una ausencia produce NULL.
create function public.current_jugador_id()
returns uuid
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select case
    when membership.role = 'player' then membership.jugador_id
    else null::uuid
  end
  from public.current_membership() membership;
$$;

comment on function public.current_jugador_id() is
'Devuelve jugador_id solo para la identidad PLAYER activa derivada de auth.uid(); NULL en cualquier otro caso.';

create function public.is_app_staff()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select coalesce(
    (
      select membership.role in ('owner', 'admin', 'staff')
      from public.current_membership() membership
    ),
    false
  );
$$;

comment on function public.is_app_staff() is
'True solo para owner, admin o staff con membership activa resuelta desde auth.uid(); no consulta permisos individuales.';

create function public.is_player()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select coalesce(
    (
      select
        membership.role = 'player'
        and membership.jugador_id is not null
      from public.current_membership() membership
    ),
    false
  );
$$;

comment on function public.is_player() is
'True solo para una membership PLAYER activa y coherente, derivada exclusivamente de auth.uid().';

alter function public.current_membership() owner to postgres;
alter function public.current_jugador_id() owner to postgres;
alter function public.is_app_staff() owner to postgres;
alter function public.is_player() owner to postgres;

-- CREATE FUNCTION concede EXECUTE a PUBLIC por defecto. Se elimina ese acceso,
-- se deniega anon explicitamente y se concede a authenticated. Si los default
-- privileges de Supabase conceden EXECUTE a service_role, se conserva: es un
-- rol backend privilegiado permitido, no una identidad cliente PLAYER.
revoke all on function public.current_membership()
from public, anon, authenticated;
revoke all on function public.current_jugador_id()
from public, anon, authenticated;
revoke all on function public.is_app_staff()
from public, anon, authenticated;
revoke all on function public.is_player()
from public, anon, authenticated;

grant execute on function public.current_membership() to authenticated;
grant execute on function public.current_jugador_id() to authenticated;
grant execute on function public.is_app_staff() to authenticated;
grant execute on function public.is_player() to authenticated;

-- Verificacion de firmas, modos de seguridad, volatilidad, search_path y ACL.
do $$
declare
  helper_oid oid;
  helper_name text;
  helper pg_catalog.pg_proc%rowtype;
  expected_definer boolean;
begin
  foreach helper_name in array array[
    'public.current_membership()',
    'public.current_jugador_id()',
    'public.is_app_staff()',
    'public.is_player()'
  ]
  loop
    helper_oid := to_regprocedure(helper_name)::oid;

    if helper_oid is null then
      raise exception 'No se creo el helper %', helper_name;
    end if;

    select *
      into helper
    from pg_catalog.pg_proc procedure_row
    where procedure_row.oid = helper_oid;

    expected_definer := helper_name = 'public.current_membership()';

    if helper.prosecdef is distinct from expected_definer
       or helper.provolatile <> 's'
       or not (
         coalesce(helper.proconfig, array[]::text[])
         @> array['search_path=pg_catalog']::text[]
       ) then
      raise exception
        'Modo de seguridad, volatilidad o search_path incorrecto en %', helper_name;
    end if;

    if helper.proowner <> 'postgres'::regrole then
      raise exception '% no pertenece a postgres', helper_name;
    end if;

    if not pg_catalog.has_function_privilege(
      'authenticated', helper_oid, 'EXECUTE'
    ) or pg_catalog.has_function_privilege(
      'anon', helper_oid, 'EXECUTE'
    ) or exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(helper.proacl, pg_catalog.acldefault('f', helper.proowner))
      ) acl
      where acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ) or exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(helper.proacl, pg_catalog.acldefault('f', helper.proowner))
      ) acl
      where acl.privilege_type = 'EXECUTE'
        and acl.grantee not in (
          helper.proowner,
          'authenticated'::regrole::oid,
          'service_role'::regrole::oid
        )
    ) then
      raise exception 'ACL incorrecta en %', helper_name;
    end if;
  end loop;

  if pg_catalog.pg_get_function_result(
    'public.current_membership()'::regprocedure
  ) <> 'TABLE(membership_id uuid, club_id uuid, user_id uuid, role text, jugador_id uuid, is_active boolean)' then
    raise exception 'La firma de salida de current_membership() no es la esperada';
  end if;
end
$$;

commit;
