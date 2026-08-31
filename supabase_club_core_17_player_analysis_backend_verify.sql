-- BLOQUE 2.7C PLAYER - Verificacion remota READ ONLY.
-- Ejecutar completa despues de la migracion 17. Una sola tabla final; ROLLBACK.

begin;

create or replace function pg_temp.player17_rpc_json(
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
      case when p_database_role in ('anon', 'service_role')
        then p_database_role else 'authenticated' end,
      true
    );
    perform pg_catalog.set_config(
      'request.jwt.claims',
      pg_catalog.jsonb_build_object(
        'sub', p_auth_uid,
        'role', case when p_database_role in ('anon', 'service_role')
          then p_database_role else 'authenticated' end
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

  begin execute 'reset role'; exception when others then null; end;
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(previous_sub, ''), true);
  perform pg_catalog.set_config('request.jwt.claim.role', coalesce(previous_role_claim, ''), true);
  perform pg_catalog.set_config('request.jwt.claims', coalesce(previous_claims, ''), true);
  return next;
end;
$function$;

create or replace function pg_temp.player17_table_count(
  p_database_role text,
  p_auth_uid uuid,
  p_table regclass
)
returns table (
  access_mode text,
  row_count bigint,
  error_code text
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
    perform pg_catalog.set_config('request.jwt.claim.role',
      case when p_database_role = 'anon' then 'anon' else 'authenticated' end, true);
    perform pg_catalog.set_config('request.jwt.claims',
      pg_catalog.jsonb_build_object('sub', p_auth_uid,
        'role', case when p_database_role = 'anon' then 'anon' else 'authenticated' end)::text, true);
    execute pg_catalog.format('select count(*)::bigint from %s', p_table) into row_count;
    access_mode := 'SELECT_OK';
  exception
    when insufficient_privilege then access_mode := 'DENIED'; error_code := sqlstate;
    when others then access_mode := 'ERROR'; error_code := sqlstate;
  end;
  begin execute 'reset role'; exception when others then null; end;
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
    '4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3'::uuid as staff_auth_uid,
    '00000000-0000-4000-8000-00000000027c'::uuid as no_membership_uid
),
rpc_specs(rpc_order, signature, expected_input_count, expected_arguments, expected_result) as (
  values
    (1, 'public.get_my_player_analysis_overview(text,text)', 2,
      'p_competition_scope text, p_venue text',
      'TABLE(competition_scope text, venue text, match_records integer, matches_played integer, minutes integer, possible_minutes integer, minutes_per_match numeric, starts integer, bench_entries integer, participation_percentage numeric, goals integer, goals_coverage text, assists integer, assists_coverage text, goal_contributions integer, goal_contributions_coverage text, goals_per_90 numeric, assists_per_90 numeric, goal_contributions_per_90 numeric, yellow_cards integer, red_cards integer)'),
    (2, 'public.get_my_player_analysis_live_stats(text,text,text)', 3,
      'p_competition_scope text, p_venue text, p_window text',
      'TABLE(competition_scope text, venue text, "window" text, matches_with_events integer, event_count integer, goals integer, goals_per_match numeric, shots integer, shots_per_match numeric, shots_on_target integer, shots_on_target_per_match numeric, shot_accuracy_percentage numeric, crosses integer, crosses_per_match numeric, turnovers integer, turnovers_per_match numeric, steals integer, steals_per_match numeric, fouls_committed integer, fouls_committed_per_match numeric, fouls_received integer, fouls_received_per_match numeric)'),
    (3, 'public.get_my_player_production_actions(text,text)', 2,
      'p_competition_scope text, p_venue text',
      'TABLE(action_type text, minute integer, match_date date, opponent text, opponent_crest text, result text, competition_key text, competition_name text, venue text, phase text, subphase text, contact text, shot_zone_key text, shot_zone_name text, assist_zone_key text, assist_zone_name text, goal_zone_key text, goal_zone_name text, counterpart_role text, counterpart_name text, video_url text, video_available boolean)'),
    (4, 'public.get_my_player_match_history(text,text,integer,integer)', 4,
      'p_competition_scope text, p_venue text, p_limit integer, p_offset integer',
      'TABLE(match_date date, opponent text, opponent_crest text, result text, outcome text, competition_key text, competition_name text, competition_logo_url text, venue text, role text, minutes integer, goals integer, goals_coverage text, assists integer, assists_coverage text, yellow_cards integer, red_cards integer, has_allowed_video boolean)')
),
rpc_catalog as (
  select specification.*,
    procedure.oid, procedure.proowner, procedure.prolang, procedure.prosecdef,
    procedure.provolatile, procedure.proconfig, procedure.prosrc, procedure.proacl,
    pg_catalog.pg_get_function_identity_arguments(procedure.oid) as actual_arguments,
    pg_catalog.pg_get_function_result(procedure.oid) as actual_result,
    pg_catalog.pg_get_userbyid(procedure.proowner) as owner_name,
    language.lanname as language_name
  from rpc_specs specification
  left join pg_catalog.pg_proc procedure
    on procedure.oid = pg_catalog.to_regprocedure(specification.signature)
  left join pg_catalog.pg_language language on language.oid = procedure.prolang
),
contract_checks as (
  select
    100 + catalog.rpc_order as sort_group,
    catalog.signature as sort_key,
    'RPC_CONTRACT'::text as category,
    'CATALOG'::text as scenario,
    catalog.signature::text as object_name,
    'exact_signature_security_acl'::text as check_name,
    'exact args/output; postgres; plpgsql; STABLE; SECURITY DEFINER; search_path=pg_catalog; only owner/authenticated/service_role EXECUTE'::text as expected,
    pg_catalog.jsonb_build_object(
      'exists', catalog.oid is not null,
      'arguments', catalog.actual_arguments,
      'result', catalog.actual_result,
      'owner', catalog.owner_name,
      'language', catalog.language_name,
      'default_count', catalog.pronargdefaults,
      'security_definer', catalog.prosecdef,
      'volatility', catalog.provolatile,
      'config', catalog.proconfig,
      'public_execute', case when catalog.oid is null then null else exists (
        select 1 from pg_catalog.aclexplode(coalesce(catalog.proacl,
          pg_catalog.acldefault('f', catalog.proowner))) acl
        where acl.grantee = 0 and acl.privilege_type = 'EXECUTE') end,
      'anon_execute', case when catalog.oid is null then null else pg_catalog.has_function_privilege('anon', catalog.oid, 'EXECUTE') end,
      'authenticated_execute', case when catalog.oid is null then null else pg_catalog.has_function_privilege('authenticated', catalog.oid, 'EXECUTE') end,
      'service_role_execute', case when catalog.oid is null then null else pg_catalog.has_function_privilege('service_role', catalog.oid, 'EXECUTE') end
    )::text as observed,
    (
      catalog.oid is not null
      and catalog.actual_arguments = catalog.expected_arguments
      and catalog.pronargdefaults = catalog.expected_input_count
      and pg_catalog.replace(catalog.actual_result, '"', '')
          = pg_catalog.replace(catalog.expected_result, '"', '')
      and catalog.owner_name = 'postgres'
      and catalog.language_name = 'plpgsql'
      and catalog.prosecdef
      and catalog.provolatile = 's'
      and catalog.proconfig = array['search_path=pg_catalog']::text[]
      and not pg_catalog.has_function_privilege('anon', catalog.oid, 'EXECUTE')
      and pg_catalog.has_function_privilege('authenticated', catalog.oid, 'EXECUTE')
      and pg_catalog.has_function_privilege('service_role', catalog.oid, 'EXECUTE')
      and not exists (select 1 from pg_catalog.aclexplode(coalesce(catalog.proacl,
        pg_catalog.acldefault('f', catalog.proowner))) acl
        where acl.grantee = 0 and acl.privilege_type = 'EXECUTE')
      and not exists (select 1 from pg_catalog.aclexplode(coalesce(catalog.proacl,
        pg_catalog.acldefault('f', catalog.proowner))) acl
        where acl.privilege_type = 'EXECUTE' and acl.grantee <> 0
          and acl.grantee not in (catalog.proowner, 'authenticated'::regrole::oid, 'service_role'::regrole::oid))
    )::boolean as test_ok,
    'El propietario conserva privilegio implicito; no hay grantees adicionales.'::text as details
  from rpc_catalog catalog
),
body_checks as (
  select
    200 + catalog.rpc_order as sort_group,
    catalog.signature as sort_key,
    'RPC_BODY_SECURITY'::text as category,
    'CATALOG'::text as scenario,
    catalog.signature::text as object_name,
    'identity_scope_and_no_dynamic_sql'::text as check_name,
    'auth.uid + current_membership/current_jugador_id/is_player + player_visible; no identity input; no dynamic SQL/DML'::text as expected,
    pg_catalog.jsonb_build_object(
      'auth_uid', pg_catalog.strpos(coalesce(catalog.prosrc, ''), 'auth.uid()') > 0,
      'current_membership', pg_catalog.strpos(coalesce(catalog.prosrc, ''), 'public.current_membership()') > 0,
      'current_jugador_id', pg_catalog.strpos(coalesce(catalog.prosrc, ''), 'public.current_jugador_id()') > 0,
      'is_player', pg_catalog.strpos(coalesce(catalog.prosrc, ''), 'public.is_player()') > 0,
      'player_visible', pg_catalog.strpos(coalesce(catalog.prosrc, ''), 'player_visible') > 0,
      'dynamic_sql', coalesce(catalog.prosrc, '') ~* '(^|[^a-z0-9_])execute([^a-z0-9_]|$)'
    )::text as observed,
    (catalog.oid is not null
      and pg_catalog.strpos(catalog.prosrc, 'auth.uid()') > 0
      and pg_catalog.strpos(catalog.prosrc, 'public.current_membership()') > 0
      and pg_catalog.strpos(catalog.prosrc, 'public.current_jugador_id()') > 0
      and pg_catalog.strpos(catalog.prosrc, 'public.is_player()') > 0
      and pg_catalog.strpos(catalog.prosrc, 'player_visible') > 0
      and catalog.actual_arguments !~* '(jugador_id|user_id|membership_id|partido_id)'
      and catalog.prosrc !~* '(^|[^a-z0-9_])execute([^a-z0-9_]|$)'
      and catalog.prosrc !~* '(^|[^a-z0-9_])(insert|update|delete|merge|truncate)([^a-z0-9_]|$)')::boolean as test_ok,
    'La identidad solo aparece en variables internas y nunca en el contrato de entrada.'::text as details
  from rpc_catalog catalog
),
privacy_checks as (
  select
    300 + catalog.rpc_order as sort_group,
    catalog.signature as sort_key,
    'OUTPUT_PRIVACY'::text as category,
    'CATALOG'::text as scenario,
    catalog.signature::text as object_name,
    'forbidden_output_absent'::text as check_name,
    'no IDs, rating, injury, notes, descriptions, PRE/POST or tactics in RETURNS'::text as expected,
    catalog.actual_result::text as observed,
    (catalog.oid is not null and catalog.actual_result !~* '(jugador_id|user_id|membership_id|partido_id|event_id|scorer_id|assistant_id|snapshot_id|slot_id|rating|injured|notes|description|post_video_link|tactic|system)')::boolean as test_ok,
    'Se audita el contrato de salida, no solo el cuerpo.'::text as details
  from rpc_catalog catalog
),
semantic_specs(rpc_order, signature, required_patterns, forbidden_patterns) as (
  values
    (1, 'public.get_my_player_analysis_overview(text,text)',
      array['goal.type = ''Gol a favor''','goal.scorer_id = own_jugador_id','goal.assistant_id = own_jugador_id','pg_catalog.count(*) * 90']::text[],
      array['goal.scorer = own_player_name','goal.assistant = own_player_name']::text[]),
    (2, 'public.get_my_player_analysis_live_stats(text,text,text)',
      array['event.jugador_id = own_jugador_id','event.equipo = ''caudal''','event.reviewed is true','match_row.delegated_data_status = ''Validado''','ranked.recency <= 3','ranked.recency <= 5']::text[],
      array['Todos los registros']::text[]),
    (3, 'public.get_my_player_production_actions(text,text)',
      array['goal.type = ''Gol a favor''','goal.scorer_id = own_jugador_id or goal.assistant_id = own_jugador_id','^https://(youtu[.]be|youtube[.]com|www[.]youtube[.]com|m[.]youtube[.]com)(/|$)']::text[],
      array['post_video_link']::text[]),
    (4, 'public.get_my_player_match_history(text,text,integer,integer)',
      array['stats.jugador_id = own_jugador_id','goal.type = ''Gol a favor''','goal.scorer_id = own_jugador_id','goal.assistant_id = own_jugador_id','p_limit > 50']::text[],
      array['stats.player_name = own_player_name']::text[])
),
semantic_checks as (
  select
    400 + specification.rpc_order as sort_group,
    specification.signature as sort_key,
    'SEMANTIC_GUARD'::text as category,
    'CATALOG'::text as scenario,
    specification.signature::text as object_name,
    'required_semantics_present'::text as check_name,
    pg_catalog.array_to_string(specification.required_patterns, ' | ')::text as expected,
    pg_catalog.jsonb_build_object(
      'missing', (select coalesce(pg_catalog.jsonb_agg(pattern.value), '[]'::jsonb)
                  from pg_catalog.unnest(specification.required_patterns) pattern(value)
                  where pg_catalog.strpos(coalesce(catalog.prosrc, ''), pattern.value) = 0),
      'forbidden_present', (select coalesce(pg_catalog.jsonb_agg(pattern.value), '[]'::jsonb)
                  from pg_catalog.unnest(specification.forbidden_patterns) pattern(value)
                  where pg_catalog.strpos(coalesce(catalog.prosrc, ''), pattern.value) > 0)
    )::text as observed,
    (catalog.oid is not null
      and not exists (select 1 from pg_catalog.unnest(specification.required_patterns) pattern(value)
                      where pg_catalog.strpos(catalog.prosrc, pattern.value) = 0)
      and not exists (select 1 from pg_catalog.unnest(specification.forbidden_patterns) pattern(value)
                      where pg_catalog.strpos(catalog.prosrc, pattern.value) > 0))::boolean as test_ok,
    'Los nombres legacy solo pueden degradar coverage; nunca aparecen como predicado de conteo.'::text as details
  from semantic_specs specification
  join rpc_catalog catalog on catalog.signature = specification.signature
),
scenario_specs(scenario_order, scenario, database_role, auth_uid) as (
  select 1, 'BORJA_PLAYER', 'authenticated', constants.borja_auth_uid from constants
  union all select 2, 'UID_WITHOUT_MEMBERSHIP', 'authenticated', constants.no_membership_uid from constants
  union all select 3, 'STAFF', 'authenticated', constants.staff_auth_uid from constants
  union all select 4, 'ANON', 'anon', null::uuid from constants
),
rpc_calls(rpc_order, signature, call_sql) as (
  values
    (1, 'public.get_my_player_analysis_overview(text,text)',
      'select coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) from public.get_my_player_analysis_overview(''all'',''all'') r'),
    (2, 'public.get_my_player_analysis_live_stats(text,text,text)',
      'select coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) from public.get_my_player_analysis_live_stats(''all'',''all'',''full_scope'') r'),
    (3, 'public.get_my_player_production_actions(text,text)',
      'select coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) from public.get_my_player_production_actions(''all'',''all'') r'),
    (4, 'public.get_my_player_match_history(text,text,integer,integer)',
      'select coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) from public.get_my_player_match_history(''all'',''all'',50,0) r')
),
scenario_results as (
  select scenario.*, call.rpc_order, call.signature,
         result.access_mode, result.result, result.error_code, result.error_message
  from scenario_specs scenario cross join rpc_calls call
  left join lateral pg_temp.player17_rpc_json(
    scenario.database_role, scenario.auth_uid, call.call_sql
  ) result on true
),
scenario_checks as (
  select
    500 + result.rpc_order as sort_group,
    pg_catalog.lpad(result.scenario_order::text, 2, '0') || ':' || result.signature as sort_key,
    'FUNCTIONAL_IDENTITY'::text as category,
    result.scenario::text as scenario,
    result.signature::text as object_name,
    'player_only_execution'::text as check_name,
    case when result.scenario = 'BORJA_PLAYER' then 'EXECUTE_OK and one aggregate row (actions/history may be empty arrays)'
         when result.scenario = 'ANON' then 'DENIED 42501'
         else 'EXECUTE_OK and []' end::text as expected,
    pg_catalog.jsonb_build_object('access', result.access_mode,
      'rows', case when pg_catalog.jsonb_typeof(result.result) = 'array' then pg_catalog.jsonb_array_length(result.result) end,
      'error_code', result.error_code)::text as observed,
    (case
      when result.scenario = 'ANON' then result.access_mode = 'DENIED' and result.error_code = '42501'
      when result.scenario in ('UID_WITHOUT_MEMBERSHIP', 'STAFF')
        then result.access_mode = 'EXECUTE_OK' and result.result = '[]'::jsonb
      when result.rpc_order in (1, 2)
        then result.access_mode = 'EXECUTE_OK' and pg_catalog.jsonb_array_length(result.result) = 1
      else result.access_mode = 'EXECUTE_OK' and pg_catalog.jsonb_typeof(result.result) = 'array'
    end)::boolean as test_ok,
    coalesce(result.error_message, 'La funcion no acepta una identidad alternativa.')::text as details
  from scenario_results result
),
valid_scopes(scope_order, scope_value) as (
  values (1, 'season'), (2, 'all'), (3, 'league'), (4, 'copa_rfef'), (5, 'playoff'), (6, 'friendly')
),
valid_venues(venue_order, venue_value) as (
  values (1, 'all'), (2, 'home'), (3, 'away')
),
valid_filter_specs(filter_order, signature, call_sql) as (
  select 1000 + scope.scope_order * 10 + venue.venue_order,
    'overview:' || scope.scope_value || ':' || venue.venue_value,
    pg_catalog.format('select coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) from public.get_my_player_analysis_overview(%L,%L) r', scope.scope_value, venue.venue_value)
  from valid_scopes scope cross join valid_venues venue
  union all
  select 2000 + scope.scope_order * 10 + venue.venue_order,
    'live:' || scope.scope_value || ':' || venue.venue_value,
    pg_catalog.format('select coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) from public.get_my_player_analysis_live_stats(%L,%L,''full_scope'') r', scope.scope_value, venue.venue_value)
  from valid_scopes scope cross join valid_venues venue
  union all
  select 3000 + scope.scope_order * 10 + venue.venue_order,
    'production:' || scope.scope_value || ':' || venue.venue_value,
    pg_catalog.format('select coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) from public.get_my_player_production_actions(%L,%L) r', scope.scope_value, venue.venue_value)
  from valid_scopes scope cross join valid_venues venue
  union all
  select 4000 + scope.scope_order * 10 + venue.venue_order,
    'history:' || scope.scope_value || ':' || venue.venue_value,
    pg_catalog.format('select coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) from public.get_my_player_match_history(%L,%L,50,0) r', scope.scope_value, venue.venue_value)
  from valid_scopes scope cross join valid_venues venue
  union all
  select 5000 + event_window.window_order, 'live-window:' || event_window.window_value, pg_catalog.format(
    'select coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) from public.get_my_player_analysis_live_stats(''all'',''all'',%L) r', event_window.window_value)
  from (values
    (1, 'last_3_event_matches'), (2, 'last_5_event_matches'), (3, 'full_scope')
  ) event_window(window_order, window_value)
),
valid_filter_checks as (
  select
    600 as sort_group,
    pg_catalog.lpad(filter.filter_order::text, 4, '0') as sort_key,
    'VALID_FILTERS'::text as category,
    'BORJA_PLAYER'::text as scenario,
    filter.signature::text as object_name,
    'allowlisted_filter_executes'::text as check_name,
    'EXECUTE_OK'::text as expected,
    pg_catalog.jsonb_build_object('access', result.access_mode, 'error_code', result.error_code)::text as observed,
    (result.access_mode = 'EXECUTE_OK')::boolean as test_ok,
    coalesce(result.error_message, 'Filtro allowlisted aceptado.')::text as details
  from valid_filter_specs filter cross join constants
  left join lateral pg_temp.player17_rpc_json('authenticated', constants.borja_auth_uid, filter.call_sql) result on true
),
invalid_filter_specs(filter_order, label, call_sql) as (
  values
    (1, 'invalid_scope', 'select to_jsonb(r) from public.get_my_player_analysis_overview(''other'',''all'') r'),
    (2, 'invalid_venue', 'select to_jsonb(r) from public.get_my_player_analysis_overview(''all'',''neutral'') r'),
    (3, 'invalid_window', 'select to_jsonb(r) from public.get_my_player_analysis_live_stats(''all'',''all'',''last_10'') r'),
    (4, 'invalid_limit_zero', 'select to_jsonb(r) from public.get_my_player_match_history(''all'',''all'',0,0) r'),
    (5, 'invalid_limit_51', 'select to_jsonb(r) from public.get_my_player_match_history(''all'',''all'',51,0) r'),
    (6, 'invalid_offset', 'select to_jsonb(r) from public.get_my_player_match_history(''all'',''all'',25,-1) r')
),
invalid_filter_checks as (
  select
    700 as sort_group,
    pg_catalog.lpad(filter.filter_order::text, 2, '0') as sort_key,
    'INVALID_FILTERS'::text as category,
    'BORJA_PLAYER'::text as scenario,
    filter.label::text as object_name,
    'controlled_22023'::text as check_name,
    'ERROR 22023'::text as expected,
    pg_catalog.jsonb_build_object('access', result.access_mode, 'error_code', result.error_code,
      'message', result.error_message)::text as observed,
    (result.access_mode = 'ERROR' and result.error_code = '22023')::boolean as test_ok,
    'La excepcion controlada se captura sin abortar el verificador.'::text as details
  from invalid_filter_specs filter cross join constants
  left join lateral pg_temp.player17_rpc_json('authenticated', constants.borja_auth_uid, filter.call_sql) result on true
),
reconciliation_result as (
  select result.* from constants
  cross join lateral pg_temp.player17_rpc_json(
    'authenticated', constants.borja_auth_uid,
    $sql$select pg_catalog.jsonb_build_object(
      'overview', (select pg_catalog.to_jsonb(o) from public.get_my_player_analysis_overview('all','all') o),
      'history', (select pg_catalog.jsonb_build_object(
        'rows', count(*)::integer,
        'minutes', coalesce(sum(h.minutes),0)::integer,
        'starts', count(*) filter (where lower(coalesce(h.role,'')) = 'titular')::integer,
        'goals', coalesce(sum(h.goals),0)::integer,
        'assists', coalesce(sum(h.assists),0)::integer,
        'yellow_cards', coalesce(sum(h.yellow_cards),0)::integer,
        'red_cards', coalesce(sum(h.red_cards),0)::integer
      ) from pg_catalog.generate_series(0, 4950, 50) page_offset
        cross join lateral public.get_my_player_match_history('all','all',50,page_offset) h)
    )$sql$
  ) result
),
reconciliation_check as (
  select
    800 as sort_group, 'overview-history'::text as sort_key,
    'RECONCILIATION'::text as category, 'BORJA_PLAYER'::text as scenario,
    'Overview <-> full paged History'::text as object_name,
    'match_records/minutes/starts/goals/assists/yellow/red equal'::text as check_name,
    'all seven aggregates reconcile for scope=all venue=all'::text as expected,
    result.result::text as observed,
    (result.access_mode = 'EXECUTE_OK'
      and result.result -> 'overview' ->> 'match_records' = result.result -> 'history' ->> 'rows'
      and result.result -> 'overview' ->> 'minutes' = result.result -> 'history' ->> 'minutes'
      and result.result -> 'overview' ->> 'starts' = result.result -> 'history' ->> 'starts'
      and result.result -> 'overview' ->> 'goals' = result.result -> 'history' ->> 'goals'
      and result.result -> 'overview' ->> 'assists' = result.result -> 'history' ->> 'assists'
      and result.result -> 'overview' ->> 'yellow_cards' = result.result -> 'history' ->> 'yellow_cards'
      and result.result -> 'overview' ->> 'red_cards' = result.result -> 'history' ->> 'red_cards')::boolean as test_ok,
    coalesce(result.error_message, 'History se pagina en bloques de 50 hasta 5000 filas.')::text as details
  from reconciliation_result result
),
production_safety_result as (
  select result.* from constants
  cross join lateral pg_temp.player17_rpc_json(
    'authenticated', constants.borja_auth_uid,
    $sql$select pg_catalog.jsonb_build_object(
      'rows', count(*),
      'invalid_action_types', count(*) filter (where action_type not in ('goal','assist')),
      'invalid_phase', count(*) filter (where phase is not null and phase not in ('Juego combinativo','Juego directo','Transición','ABP')),
      'invalid_contact', count(*) filter (where contact is not null and contact not in ('Pie derecho','Pie izquierdo','Cabeza','Rechace','Desvío','Otro')),
      'invalid_video', count(*) filter (where video_available is distinct from (video_url is not null)
        or (video_url is not null and video_url !~* '^https://(youtu[.]be|youtube[.]com|www[.]youtube[.]com|m[.]youtube[.]com)(/|$)')),
      'uuid_counterpart', count(*) filter (where counterpart_name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
    ) from public.get_my_player_production_actions('all','all')$sql$
  ) result
),
production_safety_check as (
  select 810 as sort_group, 'production-sanitization'::text as sort_key,
    'RUNTIME_PRIVACY'::text as category, 'BORJA_PLAYER'::text as scenario,
    'get_my_player_production_actions'::text as object_name,
    'categories_counterpart_video'::text as check_name,
    'all invalid counters = 0'::text as expected,
    result.result::text as observed,
    (result.access_mode = 'EXECUTE_OK'
      and (result.result ->> 'invalid_action_types')::bigint = 0
      and (result.result ->> 'invalid_phase')::bigint = 0
      and (result.result ->> 'invalid_contact')::bigint = 0
      and (result.result ->> 'invalid_video')::bigint = 0
      and (result.result ->> 'uuid_counterpart')::bigint = 0)::boolean as test_ok,
    coalesce(result.error_message, 'No se devuelven IDs de contraparte.')::text as details
  from production_safety_result result
),
direct_table_check as (
  select 820 as sort_group, 'jugadores-direct'::text as sort_key,
    'DIRECT_TABLE_ACCESS'::text as category, 'BORJA_PLAYER'::text as scenario,
    'public.jugadores'::text as object_name, 'still_closed'::text as check_name,
    'DENIED or 0 rows'::text as expected,
    pg_catalog.jsonb_build_object('access', direct.access_mode, 'rows', direct.row_count,
      'error_code', direct.error_code)::text as observed,
    (direct.access_mode = 'DENIED' or coalesce(direct.row_count, 0) = 0)::boolean as test_ok,
    'La migracion no abre RLS ni grants directos.'::text as details
  from constants cross join lateral pg_temp.player17_table_count(
    'authenticated', constants.borja_auth_uid, 'public.jugadores'::regclass
  ) direct
),
cross_player_check as (
  select 830 as sort_group, 'no-jairo-input'::text as sort_key,
    'CROSS_PLAYER'::text as category, 'CATALOG'::text as scenario,
    'all Block 2.7C RPCs'::text as object_name, 'no_identity_or_match_selector'::text as check_name,
    'no jugador_id/user_id/membership_id/partido_id input; Jairo UUID absent from bodies'::text as expected,
    pg_catalog.jsonb_build_object(
      'bad_argument_contracts', pg_catalog.count(*) filter (where catalog.actual_arguments ~* '(jugador_id|user_id|membership_id|partido_id)'),
      'bodies_with_jairo_uuid', pg_catalog.count(*) filter (where pg_catalog.strpos(coalesce(catalog.prosrc, ''), constants.jairo_jugador_id::text) > 0)
    )::text as observed,
    (pg_catalog.count(*) filter (where catalog.actual_arguments ~* '(jugador_id|user_id|membership_id|partido_id)') = 0
      and pg_catalog.count(*) filter (where pg_catalog.strpos(coalesce(catalog.prosrc, ''), constants.jairo_jugador_id::text) > 0) = 0)::boolean as test_ok,
    'No existe parametro con el que solicitar a Jairo ni a ningun tercero.'::text as details
  from rpc_catalog catalog cross join constants
),
position_fail_closed_check as (
  select 840 as sort_group, 'positions'::text as sort_key,
    'POSITION_FAIL_CLOSED'::text as category, 'CATALOG'::text as scenario,
    'public.get_my_player_position_distribution(text,text)'::text as object_name,
    'absent_until_canonical_SQL_slot_catalog_exists'::text as check_name,
    'function absent'::text as expected,
    pg_catalog.jsonb_build_object('exists', pg_catalog.to_regprocedure(
      'public.get_my_player_position_distribution(text,text)') is not null)::text as observed,
    (pg_catalog.to_regprocedure('public.get_my_player_position_distribution(text,text)') is null)::boolean as test_ok,
    'El mapa system+slot y parte de la identidad de sustituciones siguen siendo JS/name-based.'::text as details
),
all_checks as (
  select * from contract_checks union all
  select * from body_checks union all
  select * from privacy_checks union all
  select * from semantic_checks union all
  select * from scenario_checks union all
  select * from valid_filter_checks union all
  select * from invalid_filter_checks union all
  select * from reconciliation_check union all
  select * from production_safety_check union all
  select * from direct_table_check union all
  select * from cross_player_check union all
  select * from position_fail_closed_check
),
numbered_checks as (
  select (pg_catalog.row_number() over (order by check_row.sort_group, check_row.sort_key))::integer as test_order,
    check_row.category, check_row.scenario, check_row.object_name, check_row.check_name,
    check_row.expected, check_row.observed, check_row.test_ok, check_row.details
  from all_checks check_row
)
select test_order, category, scenario, object_name, check_name,
       expected, observed, test_ok, details
from numbered_checks
order by test_order;
-- FINAL_RESULT_END

rollback;
