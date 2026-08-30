-- BLOQUE 2.2 - Verificacion remota READ ONLY de get_my_player_profile().
--
-- Ejecutar COMPLETO despues de la migracion 15. Devuelve una unica tabla.
-- Las simulaciones solo cambian role/claims dentro de esta transaccion.

begin;
set transaction read only;
set local row_security = on;
set local statement_timeout = '120s';
set local lock_timeout = '5s';

do $verify$
declare
  results jsonb := '[]'::jsonb;
  test_order integer := 0;
  function_oid oid := pg_catalog.to_regprocedure('public.get_my_player_profile()');
  function_owner oid;
  function_source text;
  function_language text;
  function_owner_name text;
  function_result text;
  function_definer boolean;
  function_volatility "char";
  function_config text[];
  function_arg_count smallint;
  function_all_arg_types oid[];
  function_arg_modes "char"[];
  function_arg_names text[];
  named_overload_count integer;
  public_execute boolean := false;
  anon_execute boolean := false;
  authenticated_execute boolean := false;
  service_role_execute boolean := false;
  unexpected_execute_count integer := 0;
  metadata_ok boolean := false;
  definition_ok boolean := false;
  acl_ok boolean := false;
  player_policy_count integer;
  borja_rows integer;
  borja_jugador_id uuid;
  borja_name text;
  borja_shirt_name text;
  borja_number integer;
  borja_position text;
  borja_image text;
  jairo_rows integer;
  direct_jugadores_rows bigint;
  no_membership_baseline integer;
  no_membership_rows integer;
  staff_rows integer;
  anon_denied boolean := false;
  error_state text;
  error_message text;
  borja_user_id constant uuid := '350615a9-b068-450a-b867-da30a59b9082';
  borja_player_id constant uuid := '2e0146e9-e9fc-45ad-b055-edc138a85f7e';
  jairo_player_id constant uuid := 'f7f5aaeb-e82b-4e6b-8920-694bc32cb6c7';
  staff_user_id constant uuid := 'e0933d02-76c7-4e71-9765-896593e1ae80';
  no_membership_user_id constant uuid := '00000000-0000-4000-8000-000000000222';
begin
  select pg_catalog.count(*)::integer
  into named_overload_count
  from pg_catalog.pg_proc function_row
  join pg_catalog.pg_namespace namespace
    on namespace.oid = function_row.pronamespace
  where namespace.nspname = 'public'
    and function_row.proname = 'get_my_player_profile';

  if function_oid is not null then
    select
      function_row.proowner,
      function_row.prosrc,
      language.lanname,
      pg_catalog.pg_get_userbyid(function_row.proowner),
      pg_catalog.pg_get_function_result(function_row.oid),
      function_row.prosecdef,
      function_row.provolatile,
      function_row.proconfig,
      function_row.pronargs,
      function_row.proallargtypes,
      function_row.proargmodes,
      function_row.proargnames
    into
      function_owner,
      function_source,
      function_language,
      function_owner_name,
      function_result,
      function_definer,
      function_volatility,
      function_config,
      function_arg_count,
      function_all_arg_types,
      function_arg_modes,
      function_arg_names
    from pg_catalog.pg_proc function_row
    join pg_catalog.pg_language language
      on language.oid = function_row.prolang
    where function_row.oid = function_oid;

    metadata_ok := named_overload_count = 1
      and function_owner_name = 'postgres'
      and function_language = 'plpgsql'
      and function_definer
      and function_volatility = 's'
      and function_config = array['search_path=pg_catalog']::text[]
      and function_arg_count = 0
      and function_all_arg_types = array[
        'uuid'::regtype,
        'text'::regtype,
        'text'::regtype,
        'integer'::regtype,
        'text'::regtype,
        'text'::regtype
      ]::oid[]
      and function_arg_modes = array['t', 't', 't', 't', 't', 't']::"char"[]
      and function_arg_names = array[
        'jugador_id', 'name', 'shirt_name', 'number', 'position', 'image'
      ]::text[];

    definition_ok := pg_catalog.strpos(function_source, 'auth.uid()') > 0
      and pg_catalog.strpos(function_source, 'public.current_membership()') > 0
      and pg_catalog.strpos(function_source, 'public.jugadores') > 0
      and pg_catalog.strpos(function_source, 'player.id = linked_jugador_id') > 0
      and pg_catalog.strpos(function_source, 'membership_role is distinct from ''player''') > 0
      and function_source !~* '(^|[^a-z0-9_])execute([^a-z0-9_]|$)'
      and function_source !~* '(^|[^a-z0-9_])(insert|update|delete|merge|truncate)([^a-z0-9_]|$)'
      and function_source !~* '(global_player_id|google_forms_name|membership_id|legacy_id|dob|foot|availability_status|suspension_)';

    select coalesce(pg_catalog.bool_or(
      acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
    ), false)
    into public_execute
    from pg_catalog.aclexplode(
      coalesce(
        (select function_row.proacl from pg_catalog.pg_proc function_row where function_row.oid = function_oid),
        pg_catalog.acldefault('f', function_owner)
      )
    ) acl;

    anon_execute := pg_catalog.has_function_privilege('anon', function_oid, 'EXECUTE');
    authenticated_execute := pg_catalog.has_function_privilege(
      'authenticated', function_oid, 'EXECUTE'
    );
    service_role_execute := pg_catalog.has_function_privilege(
      'service_role', function_oid, 'EXECUTE'
    );

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

    acl_ok := not public_execute
      and not anon_execute
      and authenticated_execute
      and service_role_execute
      and unexpected_execute_count = 0;
  end if;

  test_order := test_order + 1;
  results := results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'test_order', test_order,
    'scenario', 'CATALOG',
    'check_name', 'Firma y metadatos exactos',
    'expected', '1 overload; 0 parametros; postgres; plpgsql; SECURITY DEFINER; STABLE; search_path=pg_catalog; 6 columnas minimas',
    'observed', pg_catalog.jsonb_build_object(
      'exists', function_oid is not null,
      'named_overloads', named_overload_count,
      'owner', function_owner_name,
      'language', function_language,
      'security_definer', function_definer,
      'volatility', function_volatility,
      'proconfig', function_config,
      'input_arguments', function_arg_count,
      'result', function_result
    ),
    'test_ok', coalesce(metadata_ok, false)
  ));

  test_order := test_order + 1;
  results := results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'test_order', test_order,
    'scenario', 'CATALOG',
    'check_name', 'Cadena de identidad y cuerpo minimo',
    'expected', 'auth.uid -> current_membership -> jugador_id -> jugadores.id; sin IDs externos ni SQL dinamico',
    'observed', case when definition_ok then 'EXACT_SAFE_BODY' else 'BODY_MISMATCH' end,
    'test_ok', coalesce(definition_ok, false)
  ));

  test_order := test_order + 1;
  results := results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'test_order', test_order,
    'scenario', 'ACL',
    'check_name', 'EXECUTE exacto',
    'expected', 'PUBLIC=false; anon=false; authenticated=true; service_role=true; sin otros grantees',
    'observed', pg_catalog.jsonb_build_object(
      'public', public_execute,
      'anon', anon_execute,
      'authenticated', authenticated_execute,
      'service_role', service_role_execute,
      'unexpected_grantees', unexpected_execute_count
    ),
    'test_ok', coalesce(acl_ok, false)
  ));

  select pg_catalog.count(*)::integer
  into player_policy_count
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
    );

  test_order := test_order + 1;
  results := results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'test_order', test_order,
    'scenario', 'RLS',
    'check_name', 'public.jugadores sigue cerrado directamente',
    'expected', '0 policies PLAYER/PUBLIC/anon',
    'observed', player_policy_count,
    'test_ok', player_policy_count = 0
  ));

  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', borja_user_id, 'role', 'authenticated')::text,
    true
  );
  perform pg_catalog.set_config('request.jwt.claim.sub', borja_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  error_state := null;
  error_message := null;
  begin
    execute 'set local role authenticated';
    select pg_catalog.count(*)::integer
    into borja_rows
    from public.get_my_player_profile();

    select
      profile.jugador_id,
      profile.name,
      profile.shirt_name,
      profile.number,
      profile.position,
      profile.image
    into
      borja_jugador_id,
      borja_name,
      borja_shirt_name,
      borja_number,
      borja_position,
      borja_image
    from public.get_my_player_profile() profile;

    select pg_catalog.count(*)::integer
    into jairo_rows
    from public.get_my_player_profile() profile
    where profile.jugador_id = jairo_player_id;

    select pg_catalog.count(*)::bigint
    into direct_jugadores_rows
    from public.jugadores;
    execute 'reset role';
  exception when others then
    get stacked diagnostics
      error_state = returned_sqlstate,
      error_message = message_text;
    begin execute 'reset role'; exception when others then null; end;
  end;

  test_order := test_order + 1;
  results := results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'test_order', test_order,
    'scenario', 'BORJA_PLAYER',
    'check_name', 'RPC devuelve exclusivamente el perfil propio',
    'expected', '1 fila; Borja; jugador_id exacto; 0 filas de Jairo',
    'observed', case when error_state is not null
      then pg_catalog.jsonb_build_object('sqlstate', error_state, 'error', error_message)
      else pg_catalog.jsonb_build_object(
        'rows', borja_rows,
        'jugador_id', borja_jugador_id,
        'name', borja_name,
        'shirt_name', borja_shirt_name,
        'number', borja_number,
        'position', borja_position,
        'image_present', nullif(pg_catalog.btrim(coalesce(borja_image, '')), '') is not null,
        'jairo_rows', jairo_rows
      )
    end,
    'test_ok', error_state is null
      and borja_rows = 1
      and borja_jugador_id = borja_player_id
      and borja_name = 'Borja Rodríguez'
      and jairo_rows = 0
  ));

  test_order := test_order + 1;
  results := results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'test_order', test_order,
    'scenario', 'BORJA_PLAYER',
    'check_name', 'SELECT directo de public.jugadores',
    'expected', '0 filas por RLS',
    'observed', case when error_state is not null
      then pg_catalog.jsonb_build_object('sqlstate', error_state, 'error', error_message)
      else pg_catalog.to_jsonb(direct_jugadores_rows)
    end,
    'test_ok', error_state is null and direct_jugadores_rows = 0
  ));

  execute 'reset role';
  select pg_catalog.count(*)::integer
  into no_membership_baseline
  from public.club_memberships membership
  where membership.user_id = no_membership_user_id
    and membership.is_active;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', no_membership_user_id, 'role', 'authenticated')::text,
    true
  );
  perform pg_catalog.set_config('request.jwt.claim.sub', no_membership_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  error_state := null;
  error_message := null;
  begin
    execute 'set local role authenticated';
    select pg_catalog.count(*)::integer
    into no_membership_rows
    from public.get_my_player_profile();
    execute 'reset role';
  exception when others then
    get stacked diagnostics
      error_state = returned_sqlstate,
      error_message = message_text;
    begin execute 'reset role'; exception when others then null; end;
  end;

  test_order := test_order + 1;
  results := results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'test_order', test_order,
    'scenario', 'UID_WITHOUT_MEMBERSHIP',
    'check_name', 'RPC falla cerrada sin identidad',
    'expected', 'baseline=0 memberships activas; RPC=0 filas',
    'observed', case when error_state is not null
      then pg_catalog.jsonb_build_object('sqlstate', error_state, 'error', error_message)
      else pg_catalog.jsonb_build_object(
        'active_membership_baseline', no_membership_baseline,
        'profile_rows', no_membership_rows
      )
    end,
    'test_ok', error_state is null
      and no_membership_baseline = 0
      and no_membership_rows = 0
  ));

  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', staff_user_id, 'role', 'authenticated')::text,
    true
  );
  perform pg_catalog.set_config('request.jwt.claim.sub', staff_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  error_state := null;
  error_message := null;
  begin
    execute 'set local role authenticated';
    select pg_catalog.count(*)::integer
    into staff_rows
    from public.get_my_player_profile();
    execute 'reset role';
  exception when others then
    get stacked diagnostics
      error_state = returned_sqlstate,
      error_message = message_text;
    begin execute 'reset role'; exception when others then null; end;
  end;

  test_order := test_order + 1;
  results := results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'test_order', test_order,
    'scenario', 'STAFF',
    'check_name', 'RPC no devuelve un PLAYER arbitrario',
    'expected', '0 filas',
    'observed', case when error_state is not null
      then pg_catalog.jsonb_build_object('sqlstate', error_state, 'error', error_message)
      else pg_catalog.to_jsonb(staff_rows)
    end,
    'test_ok', error_state is null and staff_rows = 0
  ));

  perform pg_catalog.set_config(
    'request.jwt.claims', pg_catalog.jsonb_build_object('role', 'anon')::text, true
  );
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'anon', true);
  error_state := null;
  error_message := null;
  begin
    execute 'set local role anon';
    perform * from public.get_my_player_profile();
    execute 'reset role';
  exception when others then
    anon_denied := true;
    get stacked diagnostics
      error_state = returned_sqlstate,
      error_message = message_text;
    begin execute 'reset role'; exception when others then null; end;
  end;

  test_order := test_order + 1;
  results := results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'test_order', test_order,
    'scenario', 'ANON',
    'check_name', 'Sin EXECUTE',
    'expected', 'permission denied y ACL anon=false',
    'observed', pg_catalog.jsonb_build_object(
      'call_denied', anon_denied,
      'acl_execute', anon_execute,
      'sqlstate', error_state,
      'error', error_message
    ),
    'test_ok', anon_denied and not anon_execute
  ));

  begin execute 'reset role'; exception when others then null; end;
  perform pg_catalog.set_config('request.jwt.claims', '{}'::jsonb::text, true);
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', '', true);
  perform pg_catalog.set_config('appcaudal.block_2_2_verify_results', results::text, true);
end;
$verify$;

with result_rows as (
  select value as row_data
  from pg_catalog.jsonb_array_elements(
    pg_catalog.current_setting('appcaudal.block_2_2_verify_results', false)::jsonb
  ) result(value)
)
select
  (row_data ->> 'test_order')::integer as test_order,
  row_data ->> 'scenario' as scenario,
  row_data ->> 'check_name' as check_name,
  row_data ->> 'expected' as expected,
  case
    when pg_catalog.jsonb_typeof(row_data -> 'observed') = 'string'
      then row_data ->> 'observed'
    else (row_data -> 'observed')::text
  end as observed,
  (row_data ->> 'test_ok')::boolean as test_ok
from result_rows
order by (row_data ->> 'test_order')::integer;

rollback;
