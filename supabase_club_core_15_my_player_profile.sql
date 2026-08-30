-- BLOQUE 2.2 - Perfil minimo seguro del jugador autenticado.
--
-- Cadena de identidad unica:
-- auth.uid() -> current_membership() -> jugador_id -> public.jugadores.id.
--
-- No abre RLS ni grants de tabla. La funcion SECURITY DEFINER expone solo los
-- seis campos de presentacion necesarios para la primera pantalla PLAYER.

begin;

do $preconditions$
declare
  helper record;
  expected_type text;
  actual_type text;
  staff_policy_count integer;
begin
  if exists (
    select 1
    from pg_catalog.pg_proc function_row
    join pg_catalog.pg_namespace namespace
      on namespace.oid = function_row.pronamespace
    where namespace.nspname = 'public'
      and function_row.proname = 'get_my_player_profile'
  ) then
    raise exception
      'Bloque 2.2: ya existe algun overload public.get_my_player_profile; revisar antes de crear';
  end if;

  if pg_catalog.to_regclass('public.jugadores') is null then
    raise exception 'Bloque 2.2: falta public.jugadores';
  end if;

  if not (
    select relation.relrowsecurity
    from pg_catalog.pg_class relation
    where relation.oid = 'public.jugadores'::regclass
  ) then
    raise exception 'Bloque 2.2: RLS no esta activo en public.jugadores';
  end if;

  for helper in
    select *
    from (values
      ('public.current_membership()', true, 'plpgsql'),
      ('public.current_jugador_id()', false, 'sql'),
      ('public.is_player()', false, 'sql')
    ) helpers(signature, expected_definer, expected_language)
  loop
    if pg_catalog.to_regprocedure(helper.signature) is null then
      raise exception 'Bloque 2.2: falta el helper %', helper.signature;
    end if;

    if not exists (
      select 1
      from pg_catalog.pg_proc function_row
      join pg_catalog.pg_language language
        on language.oid = function_row.prolang
      where function_row.oid = helper.signature::regprocedure
        and pg_catalog.pg_get_userbyid(function_row.proowner) = 'postgres'
        and function_row.pronargs = 0
        and function_row.provolatile = 's'
        and function_row.prosecdef = helper.expected_definer
        and language.lanname = helper.expected_language
        and function_row.proconfig = array['search_path=pg_catalog']::text[]
    ) then
      raise exception 'Bloque 2.2: contrato inesperado del helper %', helper.signature;
    end if;

    if not pg_catalog.has_function_privilege(
      'authenticated', helper.signature::regprocedure, 'EXECUTE'
    ) then
      raise exception 'Bloque 2.2: authenticated no puede ejecutar %', helper.signature;
    end if;
  end loop;

  if pg_catalog.pg_get_function_result(
    'public.current_membership()'::regprocedure
  ) <> 'TABLE(membership_id uuid, club_id uuid, user_id uuid, role text, jugador_id uuid, is_active boolean)' then
    raise exception 'Bloque 2.2: firma de salida inesperada de current_membership()';
  end if;

  if pg_catalog.pg_get_function_result(
    'public.current_jugador_id()'::regprocedure
  ) <> 'uuid' or pg_catalog.pg_get_function_result(
    'public.is_player()'::regprocedure
  ) <> 'boolean' then
    raise exception 'Bloque 2.2: firma de salida inesperada de helpers PLAYER';
  end if;

  for helper in
    select *
    from (values
      ('id', 'uuid'),
      ('name', 'text'),
      ('shirt_name', 'text'),
      ('number', 'integer'),
      ('position', 'text'),
      ('image', 'text')
    ) columns(column_name, data_type)
  loop
    expected_type := helper.data_type;
    select pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
    into actual_type
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.jugadores'::regclass
      and attribute.attname = helper.column_name
      and attribute.attnum > 0
      and not attribute.attisdropped;

    if actual_type is distinct from expected_type then
      raise exception
        'Bloque 2.2: columna public.jugadores.% ausente o con tipo inesperado (esperado %, real %)',
        helper.column_name,
        expected_type,
        coalesce(actual_type, 'NULL');
    end if;
  end loop;

  select pg_catalog.count(*)::integer
  into staff_policy_count
  from pg_catalog.pg_policies policy
  where policy.schemaname = 'public'
    and policy.tablename = 'jugadores'
    and policy.permissive = 'PERMISSIVE'
    and policy.roles = array['authenticated']::name[]
    and policy.policyname in (
      'player_perimeter_staff_select',
      'player_perimeter_staff_insert',
      'player_perimeter_staff_update',
      'player_perimeter_staff_delete'
    )
    and pg_catalog.lower(
      coalesce(policy.qual, '') || ' ' || coalesce(policy.with_check, '')
    ) like '%is_app_staff%';

  if staff_policy_count <> 4 or (
    select pg_catalog.count(*)
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = 'jugadores'
  ) <> 4 then
    raise exception
      'Bloque 2.2: public.jugadores no conserva exactamente las 4 policies STAFF del Bloque 2.1b';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = 'jugadores'
      and (
        policy.roles && array['public', 'anon']::name[]
        or pg_catalog.regexp_replace(
          pg_catalog.lower(coalesce(policy.qual, '')),
          '[[:space:]()]', '', 'g'
        ) = 'true'
        or pg_catalog.regexp_replace(
          pg_catalog.lower(coalesce(policy.with_check, '')),
          '[[:space:]()]', '', 'g'
        ) = 'true'
      )
  ) then
    raise exception 'Bloque 2.2: public.jugadores contiene una policy abierta inesperada';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'authenticated'
  ) or not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'anon'
  ) or not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'service_role'
  ) then
    raise exception 'Bloque 2.2: faltan roles Supabase requeridos';
  end if;
end;
$preconditions$;

create function public.get_my_player_profile()
returns table (
  jugador_id uuid,
  name text,
  shirt_name text,
  number integer,
  position text,
  image text
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  actor_id uuid := auth.uid();
  active_membership_count integer;
  membership_user_id uuid;
  membership_role text;
  linked_jugador_id uuid;
  membership_is_active boolean;
  linked_player_count integer;
begin
  if actor_id is null then
    return;
  end if;

  select pg_catalog.count(*)::integer
  into active_membership_count
  from public.current_membership();

  if active_membership_count <> 1 then
    return;
  end if;

  select
    membership.user_id,
    membership.role,
    membership.jugador_id,
    membership.is_active
  into
    membership_user_id,
    membership_role,
    linked_jugador_id,
    membership_is_active
  from public.current_membership() membership;

  if membership_user_id is distinct from actor_id
     or membership_is_active is not true
     or membership_role is distinct from 'player'
     or linked_jugador_id is null then
    return;
  end if;

  select pg_catalog.count(*)::integer
  into linked_player_count
  from public.jugadores player
  where player.id = linked_jugador_id;

  if linked_player_count <> 1 then
    return;
  end if;

  return query
  select
    player.id,
    player.name,
    player.shirt_name,
    player.number,
    player.position,
    player.image
  from public.jugadores player
  where player.id = linked_jugador_id;
end;
$function$;

comment on function public.get_my_player_profile() is
'Devuelve solo el perfil minimo del PLAYER activo vinculado a auth.uid(); no acepta identificadores externos ni abre RLS de jugadores.';

alter function public.get_my_player_profile() owner to postgres;

revoke all on function public.get_my_player_profile()
from public, anon, authenticated, service_role;

grant execute on function public.get_my_player_profile()
to authenticated, service_role;

do $postconditions$
declare
  function_oid oid := 'public.get_my_player_profile()'::regprocedure;
  function_owner oid;
  function_source text;
  unexpected_execute_count integer;
begin
  select function_row.proowner, function_row.prosrc
  into function_owner, function_source
  from pg_catalog.pg_proc function_row
  join pg_catalog.pg_language language
    on language.oid = function_row.prolang
  where function_row.oid = function_oid
    and pg_catalog.pg_get_userbyid(function_row.proowner) = 'postgres'
    and language.lanname = 'plpgsql'
    and function_row.pronargs = 0
    and function_row.provolatile = 's'
    and function_row.prosecdef
    and function_row.proconfig = array['search_path=pg_catalog']::text[]
    and function_row.proallargtypes = array[
      'uuid'::regtype,
      'text'::regtype,
      'text'::regtype,
      'integer'::regtype,
      'text'::regtype,
      'text'::regtype
    ]::oid[]
    and function_row.proargmodes = array['t', 't', 't', 't', 't', 't']::"char"[]
    and function_row.proargnames = array[
      'jugador_id', 'name', 'shirt_name', 'number', 'position', 'image'
    ]::text[];

  if function_owner is null then
    raise exception 'Bloque 2.2 postcondicion: contrato de funcion incorrecto';
  end if;

  if pg_catalog.strpos(function_source, 'auth.uid()') = 0
     or pg_catalog.strpos(function_source, 'public.current_membership()') = 0
     or pg_catalog.strpos(function_source, 'public.jugadores') = 0
     or pg_catalog.strpos(function_source, 'player.id = linked_jugador_id') = 0
     or pg_catalog.strpos(function_source, 'membership_role is distinct from ''player''') = 0
     or function_source ~* '(^|[^a-z0-9_])execute([^a-z0-9_]|$)'
     or function_source ~* '(^|[^a-z0-9_])(insert|update|delete|merge|truncate)([^a-z0-9_]|$)'
     or function_source ~* '(global_player_id|google_forms_name|membership_id|legacy_id|dob|foot|availability_status|suspension_)' then
    raise exception 'Bloque 2.2 postcondicion: cuerpo funcional fuera del contrato minimo';
  end if;

  if pg_catalog.has_function_privilege('anon', function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', function_oid, 'EXECUTE')
     or exists (
       select 1
       from pg_catalog.aclexplode(
         coalesce(
           (select function_row.proacl from pg_catalog.pg_proc function_row where function_row.oid = function_oid),
           pg_catalog.acldefault('f', function_owner)
         )
       ) acl
       where acl.grantee = 0
         and acl.privilege_type = 'EXECUTE'
     ) then
    raise exception 'Bloque 2.2 postcondicion: ACL basica incorrecta';
  end if;

  select pg_catalog.count(*)::integer
  into unexpected_execute_count
  from pg_catalog.aclexplode(
    coalesce(
      (select function_row.proacl from pg_catalog.pg_proc function_row where function_row.oid = function_oid),
      pg_catalog.acldefault('f', function_owner)
    )
  ) acl
  where acl.privilege_type = 'EXECUTE'
    and acl.grantee <> 0
    and acl.grantee not in (
      function_owner,
      (select role_row.oid from pg_catalog.pg_roles role_row where role_row.rolname = 'authenticated'),
      (select role_row.oid from pg_catalog.pg_roles role_row where role_row.rolname = 'service_role')
    );

  if unexpected_execute_count <> 0 then
    raise exception 'Bloque 2.2 postcondicion: existe EXECUTE adicional no previsto';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = 'jugadores'
  ) <> 4 or exists (
    select 1
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = 'jugadores'
      and (
        policy.roles && array['public', 'anon']::name[]
        or pg_catalog.lower(
          coalesce(policy.qual, '') || ' ' || coalesce(policy.with_check, '')
        ) like '%is_player%'
        or pg_catalog.lower(
          coalesce(policy.qual, '') || ' ' || coalesce(policy.with_check, '')
        ) like '%current_jugador_id%'
      )
  ) then
    raise exception 'Bloque 2.2 postcondicion: se altero el cierre RLS de public.jugadores';
  end if;
end;
$postconditions$;

commit;
