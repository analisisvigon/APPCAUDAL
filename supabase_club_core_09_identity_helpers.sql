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
-- se deniega anon explicitamente y se concede solo a authenticated.
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

-- Pruebas A-C. Se simula auth.uid() mediante claims locales de transaccion; no
-- se crea ni modifica ninguna fila de auth.users.
do $$
declare
  owner_id constant uuid := '4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3';
  staff_id constant uuid := 'e0933d02-76c7-4e71-9765-896593e1ae80';
  outsider_id uuid := gen_random_uuid();
  expected_membership_id uuid;
  resolved record;
begin
  -- A) Owner actual.
  perform set_config('request.jwt.claim.sub', owner_id::text, true);

  select membership.id
    into expected_membership_id
  from public.club_memberships membership
  where membership.user_id = owner_id
    and membership.role = 'owner'
    and membership.is_active;

  select * into resolved from public.current_membership();
  if not found then
    raise exception 'TEST A: current_membership() no devolvio el owner';
  end if;
  if resolved.membership_id is distinct from expected_membership_id
     or resolved.user_id is distinct from owner_id
     or resolved.role is distinct from 'owner'
     or resolved.jugador_id is not null
     or not resolved.is_active
     or public.current_jugador_id() is not null
     or not public.is_app_staff()
     or public.is_player() then
    raise exception 'TEST A: identidad o autorizacion incorrecta para owner';
  end if;

  -- B) Staff actual.
  perform set_config('request.jwt.claim.sub', staff_id::text, true);

  select membership.id
    into expected_membership_id
  from public.club_memberships membership
  where membership.user_id = staff_id
    and membership.role = 'staff'
    and membership.is_active;

  select * into resolved from public.current_membership();
  if not found then
    raise exception 'TEST B: current_membership() no devolvio el staff';
  end if;
  if resolved.membership_id is distinct from expected_membership_id
     or resolved.user_id is distinct from staff_id
     or resolved.role is distinct from 'staff'
     or resolved.jugador_id is not null
     or not resolved.is_active
     or public.current_jugador_id() is not null
     or not public.is_app_staff()
     or public.is_player() then
    raise exception 'TEST B: identidad o autorizacion incorrecta para staff';
  end if;

  -- C) UID autenticado simulado sin membership. Los helpers no necesitan ni
  -- consultan una fila auth.users: solo deben comprobar club_memberships.
  if exists (
    select 1 from public.club_memberships where user_id = outsider_id
  ) then
    raise exception 'TEST C: el UUID aleatorio colisiono con una membership';
  end if;

  perform set_config('request.jwt.claim.sub', outsider_id::text, true);

  if exists (select 1 from public.current_membership())
     or public.current_jugador_id() is not null
     or public.is_app_staff()
     or public.is_player() then
    raise exception 'TEST C: un UID sin membership obtuvo identidad o permisos';
  end if;

  perform set_config('request.jwt.claim.sub', '', true);

  if exists (select 1 from public.current_membership())
     or public.current_jugador_id() is not null
     or public.is_app_staff()
     or public.is_player() then
    raise exception 'TEST C: un usuario no autenticado obtuvo identidad o permisos';
  end if;
end
$$;

-- La ambiguedad multiclub se prueba con una segunda membership transaccional.
-- El bloque con EXCEPTION actua como subtransaccion y revierte sus propias filas.
do $$
declare
  owner_id constant uuid := '4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3';
  test_club_id uuid := gen_random_uuid();
  ambiguity_rejected boolean := false;
begin
  begin
    insert into public.clubs (id, name)
    values (test_club_id, 'Bloque 1.2 - prueba ambiguedad');

    insert into public.club_memberships (club_id, user_id, role, is_active, jugador_id)
    values (test_club_id, owner_id, 'viewer', true, null);

    perform set_config('request.jwt.claim.sub', owner_id::text, true);
    perform * from public.current_membership();

    raise exception 'TEST AMBIGUEDAD: se eligio silenciosamente una membership';
  exception
    when cardinality_violation then
      ambiguity_rejected := true;
  end;

  if not ambiguity_rejected then
    raise exception 'TEST AMBIGUEDAD: no se obtuvo SQLSTATE 21000';
  end if;
end
$$;

-- D) PLAYER ficticio totalmente transaccional. Se desactiva un staff solo
-- dentro de una subtransaccion, se usa un jugador UUID ficticio con la FK
-- diferida y se fuerza una excepcion controlada para revertir todo el montaje.
-- No se deshabilita ninguna constraint ni trigger y no se toca auth.users.
set constraints club_memberships_jugador_id_fkey deferred;

do $$
declare
  staff_id constant uuid := 'e0933d02-76c7-4e71-9765-896593e1ae80';
  current_club_id constant uuid := 'ca0da100-0000-4000-8000-000000000001';
  test_club_id uuid := gen_random_uuid();
  fake_jugador_id uuid := gen_random_uuid();
  player_test_completed boolean := false;
  resolved record;
begin
  begin
    perform set_config('request.jwt.claim.sub', '', true);

    update public.club_memberships
    set is_active = false
    where club_id = current_club_id
      and user_id = staff_id
      and role = 'staff'
      and is_active;

    if not found then
      raise exception 'TEST D: no se pudo aislar la membership staff';
    end if;

    insert into public.clubs (id, name)
    values (test_club_id, 'Bloque 1.2 - prueba PLAYER');

    insert into public.club_memberships (
      club_id, user_id, role, is_active, jugador_id
    ) values (
      test_club_id, staff_id, 'player', true, fake_jugador_id
    );

    perform set_config('request.jwt.claim.sub', staff_id::text, true);

    select * into resolved from public.current_membership();
    if not found then
      raise exception 'TEST D: current_membership() no devolvio el PLAYER';
    end if;
    if resolved.club_id is distinct from test_club_id
       or resolved.user_id is distinct from staff_id
       or resolved.role is distinct from 'player'
       or resolved.jugador_id is distinct from fake_jugador_id
       or not resolved.is_active
       or public.current_jugador_id() is distinct from fake_jugador_id
       or public.is_app_staff()
       or not public.is_player() then
      raise exception 'TEST D: identidad o autorizacion incorrecta para PLAYER';
    end if;

    -- SQLSTATE privado usado solo para que el subbloque revierta tanto el
    -- PLAYER como la desactivacion temporal del staff.
    raise exception using
      errcode = 'P1201',
      message = 'ROLLBACK CONTROLADO TEST PLAYER';
  exception
    when sqlstate 'P1201' then
      player_test_completed := true;
  end;

  if not player_test_completed then
    raise exception 'TEST D: la prueba PLAYER no finalizo correctamente';
  end if;
end
$$;

set constraints club_memberships_jugador_id_fkey immediate;

-- Defensa final: los tests no han alterado ninguna membership ni dejado PLAYER.
do $$
begin
  perform set_config('request.jwt.claim.sub', '', true);

  if (select count(*) from public.club_memberships) <> 5
     or (select count(*) from public.club_memberships where is_active) <> 5
     or (select count(*) from public.club_memberships where role = 'owner') <> 1
     or (select count(*) from public.club_memberships where role = 'staff') <> 4
     or (select count(*) from public.club_memberships where role = 'player') <> 0
     or exists (
       select 1 from public.club_memberships where jugador_id is not null
     ) then
    raise exception 'Las pruebas de Bloque 1.2 alteraron el inventario';
  end if;
end
$$;

commit;

-- Consultas informativas posteriores (solo lectura).
select
  procedure_row.oid::regprocedure as helper,
  case when procedure_row.prosecdef then 'DEFINER' else 'INVOKER' end as security_mode,
  procedure_row.provolatile = 's' as is_stable,
  procedure_row.proconfig as configuration,
  pg_catalog.pg_get_function_result(procedure_row.oid) as result_type,
  pg_catalog.has_function_privilege(
    'authenticated', procedure_row.oid, 'EXECUTE'
  ) as authenticated_execute,
  pg_catalog.has_function_privilege(
    'anon', procedure_row.oid, 'EXECUTE'
  ) as anon_execute
from pg_catalog.pg_proc procedure_row
where procedure_row.oid in (
  'public.current_membership()'::regprocedure,
  'public.current_jugador_id()'::regprocedure,
  'public.is_app_staff()'::regprocedure,
  'public.is_player()'::regprocedure
)
order by procedure_row.proname;

select
  count(*) as memberships_total,
  count(*) filter (where is_active) as memberships_activas,
  count(*) filter (where role = 'owner') as owners,
  count(*) filter (where role = 'staff') as staff,
  count(*) filter (where role = 'player') as players,
  count(*) filter (where jugador_id is not null) as vinculadas_a_jugador
from public.club_memberships;
