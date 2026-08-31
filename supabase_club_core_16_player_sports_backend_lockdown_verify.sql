-- BLOQUE 2.6A - Verificacion remota READ ONLY.
-- Ejecutar completa despues de la migracion 16.
-- Devuelve una sola tabla y termina en ROLLBACK.

begin;

create or replace function pg_temp.sports_table_count(
  p_table_name text,
  p_database_role text,
  p_auth_uid uuid
)
returns table (
  access_mode text,
  row_count bigint,
  error_code text,
  error_message text
)
language plpgsql
security invoker
set search_path = pg_catalog, public, auth, pg_temp
as $function$
declare
  relation_oid regclass;
  previous_sub text := pg_catalog.current_setting('request.jwt.claim.sub', true);
  previous_role_claim text := pg_catalog.current_setting('request.jwt.claim.role', true);
  previous_claims text := pg_catalog.current_setting('request.jwt.claims', true);
begin
  relation_oid := pg_catalog.to_regclass(p_table_name);
  if relation_oid is null then
    access_mode := 'MISSING';
    error_code := '42P01';
    error_message := 'relation_not_found';
    return next;
    return;
  end if;

  begin
    execute pg_catalog.format('set local role %I', p_database_role);
    perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(p_auth_uid::text, ''), true);
    perform pg_catalog.set_config(
      'request.jwt.claim.role',
      case when p_database_role = 'anon' then 'anon' else 'authenticated' end,
      true
    );
    perform pg_catalog.set_config(
      'request.jwt.claims',
      pg_catalog.jsonb_build_object(
        'sub', p_auth_uid,
        'role', case when p_database_role = 'anon' then 'anon' else 'authenticated' end
      )::text,
      true
    );

    execute pg_catalog.format('select count(*)::bigint from %s', relation_oid)
      into row_count;
    access_mode := 'SELECT_OK';
  exception
    when insufficient_privilege then
      access_mode := 'DENIED';
      row_count := null;
      error_code := sqlstate;
      error_message := pg_catalog.left(sqlerrm, 240);
    when others then
      access_mode := 'ERROR';
      row_count := null;
      error_code := sqlstate;
      error_message := pg_catalog.left(sqlerrm, 240);
  end;

  begin
    execute 'reset role';
  exception when others then null;
  end;
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(previous_sub, ''), true);
  perform pg_catalog.set_config('request.jwt.claim.role', coalesce(previous_role_claim, ''), true);
  perform pg_catalog.set_config('request.jwt.claims', coalesce(previous_claims, ''), true);
  return next;
end;
$function$;

create or replace function pg_temp.sports_rpc_json(
  p_database_role text,
  p_auth_uid uuid,
  p_sql text
)
returns table (
  access_mode text,
  result jsonb,
  error_code text,
  error_message text
)
language plpgsql
security invoker
set search_path = pg_catalog, public, auth, pg_temp
as $function$
declare
  previous_sub text := pg_catalog.current_setting('request.jwt.claim.sub', true);
  previous_role_claim text := pg_catalog.current_setting('request.jwt.claim.role', true);
  previous_claims text := pg_catalog.current_setting('request.jwt.claims', true);
begin
  begin
    execute pg_catalog.format('set local role %I', p_database_role);
    perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(p_auth_uid::text, ''), true);
    perform pg_catalog.set_config(
      'request.jwt.claim.role',
      case when p_database_role = 'anon' then 'anon' else 'authenticated' end,
      true
    );
    perform pg_catalog.set_config(
      'request.jwt.claims',
      pg_catalog.jsonb_build_object(
        'sub', p_auth_uid,
        'role', case when p_database_role = 'anon' then 'anon' else 'authenticated' end
      )::text,
      true
    );
    execute p_sql into result;
    access_mode := 'EXECUTE_OK';
  exception
    when insufficient_privilege then
      access_mode := 'DENIED';
      result := null;
      error_code := sqlstate;
      error_message := pg_catalog.left(sqlerrm, 240);
    when others then
      access_mode := 'ERROR';
      result := null;
      error_code := sqlstate;
      error_message := pg_catalog.left(sqlerrm, 240);
  end;

  begin
    execute 'reset role';
  exception when others then null;
  end;
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(previous_sub, ''), true);
  perform pg_catalog.set_config('request.jwt.claim.role', coalesce(previous_role_claim, ''), true);
  perform pg_catalog.set_config('request.jwt.claims', coalesce(previous_claims, ''), true);
  return next;
end;
$function$;

create or replace function pg_temp.sports_mutator_probe(
  p_function_oid oid,
  p_database_role text,
  p_auth_uid uuid
)
returns table (
  access_mode text,
  error_code text,
  error_message text
)
language plpgsql
security invoker
set search_path = pg_catalog, public, auth, pg_temp
as $function$
declare
  namespace_name text;
  function_name text;
  null_arguments text;
  previous_sub text := pg_catalog.current_setting('request.jwt.claim.sub', true);
  previous_role_claim text := pg_catalog.current_setting('request.jwt.claim.role', true);
  previous_claims text := pg_catalog.current_setting('request.jwt.claims', true);
begin
  select
    namespace.nspname,
    procedure.proname,
    coalesce(
      pg_catalog.string_agg(
        'null::' || pg_catalog.format_type(argument.argument_type, null),
        ',' order by argument.ordinality
      ),
      ''
    )
  into namespace_name, function_name, null_arguments
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
  left join lateral pg_catalog.unnest(procedure.proargtypes::oid[])
    with ordinality argument(argument_type, ordinality) on true
  where procedure.oid = p_function_oid
  group by namespace.nspname, procedure.proname;

  if function_name is null then
    access_mode := 'MISSING';
    error_code := '42883';
    error_message := 'function_not_found';
    return next;
    return;
  end if;

  begin
    execute pg_catalog.format('set local role %I', p_database_role);
    perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(p_auth_uid::text, ''), true);
    perform pg_catalog.set_config(
      'request.jwt.claim.role',
      case when p_database_role = 'anon' then 'anon' else 'authenticated' end,
      true
    );
    perform pg_catalog.set_config(
      'request.jwt.claims',
      pg_catalog.jsonb_build_object(
        'sub', p_auth_uid,
        'role', case when p_database_role = 'anon' then 'anon' else 'authenticated' end
      )::text,
      true
    );
    execute pg_catalog.format(
      'select * from %I.%I(%s)',
      namespace_name,
      function_name,
      null_arguments
    );
    access_mode := 'UNEXPECTED_EXECUTE';
  exception
    when others then
      error_code := sqlstate;
      error_message := pg_catalog.left(sqlerrm, 240);
      access_mode := case
        when sqlstate = '42501' then 'DENIED'
        else 'ERROR'
      end;
  end;

  begin
    execute 'reset role';
  exception when others then null;
  end;
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(previous_sub, ''), true);
  perform pg_catalog.set_config('request.jwt.claim.role', coalesce(previous_role_claim, ''), true);
  perform pg_catalog.set_config('request.jwt.claims', coalesce(previous_claims, ''), true);
  return next;
end;
$function$;

commit;

begin;
set transaction read only;

-- FINAL_RESULT_BEGIN
with recursive
constants as (
  select
    '350615a9-b068-450a-b867-da30a59b9082'::uuid as borja_auth_uid,
    '2e0146e9-e9fc-45ad-b055-edc138a85f7e'::uuid as borja_jugador_id,
    'f7f5aaeb-e82b-4e6b-8920-694bc32cb6c7'::uuid as jairo_jugador_id,
    '4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3'::uuid as staff_owner_auth_uid,
    '00000000-0000-4000-8000-000000000260'::uuid as no_membership_auth_uid
),
target_tables(table_order, table_name) as (
  values
    (1, 'public.partido_estadisticas_jugador'),
    (2, 'public.partido_eventos_gol'),
    (3, 'public.match_quick_events'),
    (4, 'public.partidos'),
    (5, 'public.partido_alineacion_slots'),
    (6, 'public.partido_eventos_sistema'),
    (7, 'public.partido_snapshots_tacticos'),
    (8, 'public.partido_snapshot_tactico_slots'),
    (9, 'public.partido_eventos_post'),
    (10, 'public.competitions'),
    (11, 'public.partido_convocados'),
    (12, 'public.partido_notas_individuales_pre')
),
scenarios(scenario_order, scenario, database_role, auth_uid) as (
  select 1, 'BORJA_PLAYER', 'authenticated', constants.borja_auth_uid from constants
  union all
  select 2, 'UID_WITHOUT_MEMBERSHIP', 'authenticated', constants.no_membership_auth_uid from constants
  union all
  select 3, 'ANON', 'anon', null::uuid from constants
  union all
  select 4, 'STAFF_OWNER', 'authenticated', constants.staff_owner_auth_uid from constants
),
table_visibility as (
  select
    target.table_order,
    target.table_name,
    scenario.scenario_order,
    scenario.scenario,
    baseline.access_mode as baseline_access,
    baseline.row_count as baseline_rows,
    observed.access_mode,
    observed.row_count,
    observed.error_code,
    observed.error_message
  from target_tables target
  cross join scenarios scenario
  left join lateral pg_temp.sports_table_count(
    target.table_name, 'postgres', null
  ) baseline on true
  left join lateral pg_temp.sports_table_count(
    target.table_name, scenario.database_role, scenario.auth_uid
  ) observed on true
),
direct_access_checks as (
  select
    1000 + visibility.scenario_order * 100 + visibility.table_order as sort_order,
    'DIRECT_TABLE_ACCESS'::text as category,
    visibility.scenario::text as scenario,
    visibility.table_name::text as object_name,
    'row_visibility'::text as check_name,
    case
      when visibility.scenario = 'STAFF_OWNER' then 'SELECT_OK and baseline completo'
      when visibility.scenario = 'ANON' then 'DENIED or 0 rows'
      else 'SELECT_OK with 0 rows'
    end::text as expected,
    pg_catalog.jsonb_build_object(
      'baseline_access', visibility.baseline_access,
      'baseline_rows', visibility.baseline_rows,
      'access', visibility.access_mode,
      'rows', visibility.row_count,
      'error_code', visibility.error_code
    )::text as observed,
    case
      when visibility.scenario = 'STAFF_OWNER' then
        visibility.access_mode = 'SELECT_OK'
        and visibility.row_count is not distinct from visibility.baseline_rows
      when visibility.scenario = 'ANON' then
        visibility.access_mode = 'DENIED'
        or coalesce(visibility.row_count, 0::bigint) = 0::bigint
      else
        visibility.access_mode = 'SELECT_OK'
        and coalesce(visibility.row_count, 0::bigint) = 0::bigint
    end::boolean as test_ok,
    coalesce(visibility.error_message, 'Solo contadores; no se devuelven filas.')::text as details
  from table_visibility visibility
),
policy_checks as (
  select
    3000 + target.table_order as sort_order,
    'RLS_POLICY'::text as category,
    'REMOTE'::text as scenario,
    target.table_name::text as object_name,
    'exact_staff_only_policies'::text as check_name,
    'RLS ON; exactly 4 authenticated policies using is_app_staff(); no true/anon'::text as expected,
    pg_catalog.jsonb_build_object(
      'rls_enabled', relation.relrowsecurity,
      'policy_count', pg_catalog.count(policy.policyname),
      'policy_names', pg_catalog.array_agg(policy.policyname order by policy.policyname),
      'commands', pg_catalog.array_agg(policy.cmd order by policy.cmd),
      'unsafe_count', pg_catalog.count(*) filter (
        where policy.roles && array['anon']::name[]
          or pg_catalog.regexp_replace(
            pg_catalog.lower(coalesce(policy.qual, '')), '[[:space:]():]', '', 'g'
          ) in ('true', 'trueboolean')
          or pg_catalog.regexp_replace(
            pg_catalog.lower(coalesce(policy.with_check, '')), '[[:space:]():]', '', 'g'
          ) in ('true', 'trueboolean')
      )
    )::text as observed,
    (
      relation.relrowsecurity
      and pg_catalog.count(policy.policyname) = 4
      and pg_catalog.count(*) filter (
        where policy.roles = array['authenticated']::name[]
          and (
            (
              policy.policyname = 'player_sports_staff_select'
              and policy.cmd = 'SELECT'
              and pg_catalog.strpos(pg_catalog.lower(coalesce(policy.qual, '')), 'is_app_staff()') > 0
              and policy.with_check is null
            )
            or (
              policy.policyname = 'player_sports_staff_insert'
              and policy.cmd = 'INSERT'
              and policy.qual is null
              and pg_catalog.strpos(pg_catalog.lower(coalesce(policy.with_check, '')), 'is_app_staff()') > 0
            )
            or (
              policy.policyname = 'player_sports_staff_update'
              and policy.cmd = 'UPDATE'
              and pg_catalog.strpos(pg_catalog.lower(coalesce(policy.qual, '')), 'is_app_staff()') > 0
              and pg_catalog.strpos(pg_catalog.lower(coalesce(policy.with_check, '')), 'is_app_staff()') > 0
            )
            or (
              policy.policyname = 'player_sports_staff_delete'
              and policy.cmd = 'DELETE'
              and pg_catalog.strpos(pg_catalog.lower(coalesce(policy.qual, '')), 'is_app_staff()') > 0
              and policy.with_check is null
            )
          )
      ) = 4
      and pg_catalog.count(*) filter (
        where policy.roles && array['anon']::name[]
          or pg_catalog.regexp_replace(
            pg_catalog.lower(coalesce(policy.qual, '')), '[[:space:]():]', '', 'g'
          ) in ('true', 'trueboolean')
          or pg_catalog.regexp_replace(
            pg_catalog.lower(coalesce(policy.with_check, '')), '[[:space:]():]', '', 'g'
          ) in ('true', 'trueboolean')
      ) = 0
    )::boolean as test_ok,
    'Las policies STAFF se combinan por OR, pero todas dependen del mismo helper cerrado.'::text as details
  from target_tables target
  join pg_catalog.pg_class relation
    on relation.oid = pg_catalog.to_regclass(target.table_name)
  left join pg_catalog.pg_policies policy
    on policy.schemaname = 'public'
   and policy.tablename = pg_catalog.split_part(target.table_name, '.', 2)
  group by target.table_order, target.table_name, relation.relrowsecurity
),
grant_checks as (
  select
    3100 + target.table_order as sort_order,
    'TABLE_GRANT'::text as category,
    'REMOTE'::text as scenario,
    target.table_name::text as object_name,
    'minimum_table_acl'::text as check_name,
    'anon none; authenticated/service_role SELECT INSERT UPDATE DELETE'::text as expected,
    pg_catalog.jsonb_build_object(
      'anon_select', pg_catalog.has_table_privilege('anon', target.table_name, 'SELECT'),
      'anon_insert', pg_catalog.has_table_privilege('anon', target.table_name, 'INSERT'),
      'anon_update', pg_catalog.has_table_privilege('anon', target.table_name, 'UPDATE'),
      'anon_delete', pg_catalog.has_table_privilege('anon', target.table_name, 'DELETE'),
      'authenticated_crud',
        pg_catalog.has_table_privilege('authenticated', target.table_name, 'SELECT')
        and pg_catalog.has_table_privilege('authenticated', target.table_name, 'INSERT')
        and pg_catalog.has_table_privilege('authenticated', target.table_name, 'UPDATE')
        and pg_catalog.has_table_privilege('authenticated', target.table_name, 'DELETE'),
      'service_role_crud',
        pg_catalog.has_table_privilege('service_role', target.table_name, 'SELECT')
        and pg_catalog.has_table_privilege('service_role', target.table_name, 'INSERT')
        and pg_catalog.has_table_privilege('service_role', target.table_name, 'UPDATE')
        and pg_catalog.has_table_privilege('service_role', target.table_name, 'DELETE')
    )::text as observed,
    (
      not pg_catalog.has_table_privilege('anon', target.table_name, 'SELECT')
      and not pg_catalog.has_table_privilege('anon', target.table_name, 'INSERT')
      and not pg_catalog.has_table_privilege('anon', target.table_name, 'UPDATE')
      and not pg_catalog.has_table_privilege('anon', target.table_name, 'DELETE')
      and pg_catalog.has_table_privilege('authenticated', target.table_name, 'SELECT')
      and pg_catalog.has_table_privilege('authenticated', target.table_name, 'INSERT')
      and pg_catalog.has_table_privilege('authenticated', target.table_name, 'UPDATE')
      and pg_catalog.has_table_privilege('authenticated', target.table_name, 'DELETE')
      and pg_catalog.has_table_privilege('service_role', target.table_name, 'SELECT')
      and pg_catalog.has_table_privilege('service_role', target.table_name, 'INSERT')
      and pg_catalog.has_table_privilege('service_role', target.table_name, 'UPDATE')
      and pg_catalog.has_table_privilege('service_role', target.table_name, 'DELETE')
    )::boolean as test_ok,
    'authenticated conserva grants tecnicos; RLS diferencia STAFF de PLAYER.'::text as details
  from target_tables target
),
publication_check as (
  select
    3200 as sort_order,
    'MATCH_PUBLICATION'::text as category,
    'REMOTE'::text as scenario,
    'public.partidos.player_visible'::text as object_name,
    'explicit_opt_in'::text as check_name,
    'boolean NOT NULL DEFAULT false; existing visible rows=0 at rollout'::text as expected,
    pg_catalog.jsonb_build_object(
      'data_type', pg_catalog.format_type(attribute.atttypid, attribute.atttypmod),
      'not_null', attribute.attnotnull,
      'default', pg_catalog.pg_get_expr(default_row.adbin, default_row.adrelid),
      'visible_rows', (select pg_catalog.count(*) from public.partidos where player_visible)
    )::text as observed,
    (
      attribute.atttypid = 'pg_catalog.bool'::regtype
      and attribute.attnotnull
      and pg_catalog.regexp_replace(
        pg_catalog.lower(pg_catalog.pg_get_expr(default_row.adbin, default_row.adrelid)),
        '[[:space:]():]', '', 'g'
      ) in ('false', 'falseboolean')
      and (select pg_catalog.count(*) from public.partidos where player_visible) = 0::bigint
    )::boolean as test_ok,
    'status, marcador y delegated_data_status no publican automaticamente.'::text as details
  from pg_catalog.pg_attribute attribute
  join pg_catalog.pg_attrdef default_row
    on default_row.adrelid = attribute.attrelid
   and default_row.adnum = attribute.attnum
  where attribute.attrelid = 'public.partidos'::regclass
    and attribute.attname = 'player_visible'
    and not attribute.attisdropped
),
rpc_specs(function_order, signature, expected_fields) as (
  values
    (1, 'public.get_my_player_matches()', array[
      'partido_id','match_date','opponent','opponent_crest','is_home','home_team',
      'away_team','home_score','away_score','stadium','competition_key',
      'competition_name','competition_logo_url','match_round','timeline'
    ]::text[]),
    (2, 'public.get_my_player_analysis_summary()', array[
      'jugador_id','matches','minutes','starts','bench_entries','goals',
      'goals_coverage','assists','assists_coverage','yellow_cards','red_cards'
    ]::text[])
),
rpc_catalog as (
  select
    spec.*,
    procedure.oid,
    pg_catalog.pg_get_userbyid(procedure.proowner) as owner_name,
    procedure.prosecdef,
    procedure.provolatile,
    procedure.proconfig,
    procedure.pronargs,
    procedure.prosrc,
    output_fields.output_names,
    public_acl.public_execute,
    pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE') as anon_execute,
    pg_catalog.has_function_privilege('authenticated', procedure.oid, 'EXECUTE') as authenticated_execute,
    pg_catalog.has_function_privilege('service_role', procedure.oid, 'EXECUTE') as service_role_execute,
    extra_acl.extra_execute_roles
  from rpc_specs spec
  left join pg_catalog.pg_proc procedure
    on procedure.oid = pg_catalog.to_regprocedure(spec.signature)
  left join lateral (
    select pg_catalog.array_agg(
      procedure.proargnames[argument.argument_index]
      order by argument.argument_index
    )::text[] as output_names
    from pg_catalog.generate_subscripts(
      procedure.proallargtypes,
      1
    ) argument(argument_index)
    where procedure.proargmodes[argument.argument_index] in ('o', 't')
  ) output_fields on true
  left join lateral (
    select pg_catalog.bool_or(acl.privilege_type = 'EXECUTE') as public_execute
    from pg_catalog.aclexplode(
      coalesce(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
    ) acl
    where acl.grantee = 0
  ) public_acl on true
  left join lateral (
    select pg_catalog.array_agg(role.rolname order by role.rolname)::text[] as extra_execute_roles
    from pg_catalog.aclexplode(
      coalesce(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
    ) acl
    join pg_catalog.pg_roles role on role.oid = acl.grantee
    where acl.privilege_type = 'EXECUTE'
      and role.rolname not in (
        pg_catalog.pg_get_userbyid(procedure.proowner),
        'authenticated',
        'service_role'
      )
  ) extra_acl on true
),
rpc_contract_checks as (
  select
    3300 + rpc.function_order as sort_order,
    'PLAYER_RPC_CONTRACT'::text as category,
    'REMOTE'::text as scenario,
    rpc.signature::text as object_name,
    'signature_owner_security_acl_allowlist'::text as check_name,
    '0 inputs; postgres; DEFINER; STABLE; pg_catalog; exact outputs; PUBLIC/anon false; auth/service true'::text as expected,
    pg_catalog.jsonb_build_object(
      'exists', rpc.oid is not null,
      'input_count', rpc.pronargs,
      'owner', rpc.owner_name,
      'security_definer', rpc.prosecdef,
      'volatility', rpc.provolatile,
      'proconfig', rpc.proconfig,
      'output_fields', rpc.output_names,
      'public_execute', coalesce(rpc.public_execute, false),
      'anon_execute', rpc.anon_execute,
      'authenticated_execute', rpc.authenticated_execute,
      'service_role_execute', rpc.service_role_execute,
      'extra_execute_roles', coalesce(rpc.extra_execute_roles, array[]::text[])
    )::text as observed,
    (
      rpc.oid is not null
      and rpc.pronargs = 0
      and rpc.owner_name = 'postgres'
      and rpc.prosecdef
      and rpc.provolatile = 's'
      and rpc.proconfig = array['search_path=pg_catalog']::text[]
      and rpc.output_names = rpc.expected_fields
      and not coalesce(rpc.public_execute, false)
      and not rpc.anon_execute
      and rpc.authenticated_execute
      and rpc.service_role_execute
      and coalesce(pg_catalog.array_length(rpc.extra_execute_roles, 1), 0) = 0
    )::boolean as test_ok,
    'Ninguna RPC acepta jugador_id, user_id, membership_id ni partido_id.'::text as details
  from rpc_catalog rpc
),
rpc_scenarios(scenario_order, scenario, database_role, auth_uid) as (
  select * from scenarios
),
matches_rpc_results as (
  select
    scenario.*,
    result.*
  from rpc_scenarios scenario
  left join lateral pg_temp.sports_rpc_json(
    scenario.database_role,
    scenario.auth_uid,
    'select coalesce(jsonb_agg(to_jsonb(match_row)), ''[]''::jsonb) from public.get_my_player_matches() match_row'
  ) result on true
),
matches_rpc_checks as (
  select
    3400 + result.scenario_order as sort_order,
    'PLAYER_MATCHES_RPC'::text as category,
    result.scenario::text as scenario,
    'public.get_my_player_matches()'::text as object_name,
    'functional_projection'::text as check_name,
    case
      when result.scenario = 'BORJA_PLAYER' then 'EXECUTE_OK; only player_visible; safe keys/timeline/video'
      when result.scenario = 'ANON' then 'DENIED'
      else 'EXECUTE_OK with 0 rows'
    end::text as expected,
    pg_catalog.jsonb_build_object(
      'access', result.access_mode,
      'row_count', case when pg_catalog.jsonb_typeof(result.result) = 'array' then pg_catalog.jsonb_array_length(result.result) else null end,
      'error_code', result.error_code,
      'payload', result.result
    )::text as observed,
    case
      when result.scenario = 'BORJA_PLAYER' then
        result.access_mode = 'EXECUTE_OK'
        and pg_catalog.jsonb_typeof(result.result) = 'array'
        and pg_catalog.jsonb_array_length(result.result) = (
          select pg_catalog.count(*)::integer from public.partidos where player_visible
        )
        and not exists (
          select 1
          from pg_catalog.jsonb_array_elements(result.result) match_row
          cross join lateral pg_catalog.jsonb_object_keys(match_row) output_key
          where output_key <> all(array[
            'partido_id','match_date','opponent','opponent_crest','is_home','home_team',
            'away_team','home_score','away_score','stadium','competition_key',
            'competition_name','competition_logo_url','match_round','timeline'
          ]::text[])
        )
        and not exists (
          select 1
          from pg_catalog.jsonb_array_elements(result.result) match_row
          cross join lateral pg_catalog.jsonb_array_elements(
            coalesce(match_row -> 'timeline', '[]'::jsonb)
          ) event_row
          where event_row ->> 'event_type' not in (
              'Gol a favor', 'Gol en contra', 'Amarilla', 'Roja'
            )
             or (
               event_row ->> 'video_url' is not null
               and event_row ->> 'video_url'
                 !~* '^https://(youtu[.]be|youtube[.]com|www[.]youtube[.]com|m[.]youtube[.]com)(/|$)'
             )
             or exists (
               select 1
               from pg_catalog.jsonb_object_keys(event_row) event_key
               where event_key <> all(array[
                 'event_type','minute','player_name','assistant_name','card_count','video_url'
               ]::text[])
             )
        )
      when result.scenario = 'ANON' then result.access_mode = 'DENIED'
      else result.access_mode = 'EXECUTE_OK'
        and pg_catalog.jsonb_typeof(result.result) = 'array'
        and pg_catalog.jsonb_array_length(result.result) = 0
    end::boolean as test_ok,
    coalesce(result.error_message, 'La salida no contiene PRE, POST, tactica, quick events ni IDs de companeros.')::text as details
  from matches_rpc_results result
),
analysis_rpc_results as (
  select
    scenario.*,
    result.*
  from rpc_scenarios scenario
  left join lateral pg_temp.sports_rpc_json(
    scenario.database_role,
    scenario.auth_uid,
    'select coalesce(jsonb_agg(to_jsonb(summary_row)), ''[]''::jsonb) from public.get_my_player_analysis_summary() summary_row'
  ) result on true
),
analysis_rpc_checks as (
  select
    3500 + result.scenario_order as sort_order,
    'PLAYER_ANALYSIS_RPC'::text as category,
    result.scenario::text as scenario,
    'public.get_my_player_analysis_summary()'::text as object_name,
    'own_uuid_aggregates_only'::text as check_name,
    case
      when result.scenario = 'BORJA_PLAYER' then 'exactly one Borja aggregate row'
      when result.scenario = 'ANON' then 'DENIED'
      else 'EXECUTE_OK with 0 rows'
    end::text as expected,
    pg_catalog.jsonb_build_object(
      'access', result.access_mode,
      'result', result.result,
      'error_code', result.error_code
    )::text as observed,
    case
      when result.scenario = 'BORJA_PLAYER' then
        result.access_mode = 'EXECUTE_OK'
        and pg_catalog.jsonb_typeof(result.result) = 'array'
        and pg_catalog.jsonb_array_length(result.result) = 1
        and result.result -> 0 ->> 'jugador_id' = constants.borja_jugador_id::text
        and pg_catalog.strpos(result.result::text, constants.jairo_jugador_id::text) = 0
      when result.scenario = 'ANON' then result.access_mode = 'DENIED'
      else result.access_mode = 'EXECUTE_OK'
        and pg_catalog.jsonb_typeof(result.result) = 'array'
        and pg_catalog.jsonb_array_length(result.result) = 0
    end::boolean as test_ok,
    coalesce(result.error_message, 'Goles/asistencias usan UUID; legacy solo modifica la etiqueta de cobertura.')::text as details
  from analysis_rpc_results result
  cross join constants
),
mutating_rpcs as (
  select
    procedure.oid,
    pg_catalog.format(
      '%I.%I(%s)', namespace.nspname, procedure.proname,
      pg_catalog.pg_get_function_identity_arguments(procedure.oid)
    ) as signature,
    procedure.prosrc,
    procedure.proowner,
    pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE') as anon_execute,
    pg_catalog.has_function_privilege('authenticated', procedure.oid, 'EXECUTE') as authenticated_execute,
    pg_catalog.has_function_privilege('service_role', procedure.oid, 'EXECUTE') as service_role_execute
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
  join pg_catalog.pg_language language on language.oid = procedure.prolang
  where namespace.nspname = 'public'
    and procedure.prokind = 'f'
    and language.lanname = 'plpgsql'
    and procedure.prorettype <> 'pg_catalog.trigger'::regtype
    and pg_catalog.has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
    and pg_catalog.lower(procedure.prosrc) ~ (
      '(^|[^a-z_])(insert[[:space:]]+into|update|delete[[:space:]]+from)'
      || '[[:space:]]+(public[.])?'
      || '(partido_estadisticas_jugador|partido_eventos_gol|match_quick_events|partidos|'
      || 'partido_alineacion_slots|partido_eventos_sistema|partido_snapshots_tacticos|'
      || 'partido_snapshot_tactico_slots|partido_eventos_post|competitions|'
      || 'partido_convocados|partido_notas_individuales_pre)'
      || '([^a-z0-9_]|$)'
    )
),
mutator_contract_checks as (
  select
    3600 + pg_catalog.row_number() over (order by mutator.signature)::integer as sort_order,
    'MUTATING_RPC_GUARD'::text as category,
    'REMOTE'::text as scenario,
    mutator.signature::text as object_name,
    'staff_guard_acl'::text as check_name,
    'STAFF_ONLY guard; anon false; authenticated/service_role true'::text as expected,
    pg_catalog.jsonb_build_object(
      'staff_guard', pg_catalog.strpos(mutator.prosrc, 'STAFF_ONLY') > 0
        and pg_catalog.strpos(pg_catalog.lower(mutator.prosrc), 'public.is_app_staff()') > 0,
      'anon_execute', mutator.anon_execute,
      'authenticated_execute', mutator.authenticated_execute,
      'service_role_execute', mutator.service_role_execute
    )::text as observed,
    (
      pg_catalog.strpos(mutator.prosrc, 'STAFF_ONLY') > 0
      and pg_catalog.strpos(pg_catalog.lower(mutator.prosrc), 'public.is_app_staff()') > 0
      and not mutator.anon_execute
      and mutator.authenticated_execute
      and mutator.service_role_execute
    )::boolean as test_ok,
    'Funciones trigger quedan fuera del inventario por prorettype=trigger.'::text as details
  from mutating_rpcs mutator
),
mutator_player_checks as (
  select
    3800 + pg_catalog.row_number() over (order by mutator.signature)::integer as sort_order,
    'MUTATING_RPC_FUNCTIONAL'::text as category,
    'BORJA_PLAYER'::text as scenario,
    mutator.signature::text as object_name,
    'guard_before_business_logic'::text as check_name,
    '42501 STAFF_ONLY'::text as expected,
    pg_catalog.jsonb_build_object(
      'access', probe.access_mode,
      'error_code', probe.error_code,
      'error_message', probe.error_message
    )::text as observed,
    (
      probe.access_mode = 'DENIED'
      and probe.error_code = '42501'
      and probe.error_message = 'STAFF_ONLY'
    )::boolean as test_ok,
    'Se invoca con NULL dentro de transaccion READ ONLY; el guard debe ejecutarse primero.'::text as details
  from mutating_rpcs mutator
  cross join constants
  left join lateral pg_temp.sports_mutator_probe(
    mutator.oid, 'authenticated', constants.borja_auth_uid
  ) probe on true
),
mutator_anon_checks as (
  select
    4000 + pg_catalog.row_number() over (order by mutator.signature)::integer as sort_order,
    'MUTATING_RPC_FUNCTIONAL'::text as category,
    'ANON'::text as scenario,
    mutator.signature::text as object_name,
    'execute_acl_denied'::text as check_name,
    '42501 permission denied'::text as expected,
    pg_catalog.jsonb_build_object(
      'access', probe.access_mode,
      'error_code', probe.error_code,
      'error_message', probe.error_message
    )::text as observed,
    (probe.access_mode = 'DENIED' and probe.error_code = '42501')::boolean as test_ok,
    'anon no conserva EXECUTE sobre RPC mutadoras.'::text as details
  from mutating_rpcs mutator
  left join lateral pg_temp.sports_mutator_probe(
    mutator.oid, 'anon', null
  ) probe on true
),
all_checks as (
  select * from direct_access_checks
  union all select * from policy_checks
  union all select * from grant_checks
  union all select * from publication_check
  union all select * from rpc_contract_checks
  union all select * from matches_rpc_checks
  union all select * from analysis_rpc_checks
  union all select * from mutator_contract_checks
  union all select * from mutator_player_checks
  union all select * from mutator_anon_checks
)
select
  pg_catalog.row_number() over (order by check_row.sort_order, check_row.category, check_row.object_name)::integer as test_order,
  check_row.category,
  check_row.scenario,
  check_row.object_name,
  check_row.check_name,
  check_row.expected,
  check_row.observed,
  check_row.test_ok,
  check_row.details
from all_checks check_row
order by test_order;
-- FINAL_RESULT_END

rollback;
