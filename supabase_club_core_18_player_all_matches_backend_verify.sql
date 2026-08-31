-- BLOQUE 2.7D PLAYER - Verificacion remota sin persistencia.
-- Ejecutar completa despues de supabase_club_core_18_player_all_matches_backend.sql.
-- Devuelve UNA sola tabla final y termina en ROLLBACK.

begin;

create or replace function pg_temp.player18_table_count(
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

create or replace function pg_temp.player18_rpc_json(
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

with
constants as (
  select
    '350615a9-b068-450a-b867-da30a59b9082'::uuid as borja_auth_uid,
    '4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3'::uuid as staff_auth_uid,
    '00000000-0000-4000-8000-00000000027d'::uuid as no_membership_uid
),
table_specifications as (
  select *
  from (values
    (1, 'public.partidos'),
    (2, 'public.partido_estadisticas_jugador'),
    (3, 'public.partido_eventos_gol'),
    (4, 'public.match_quick_events'),
    (5, 'public.partido_alineacion_slots'),
    (6, 'public.partido_eventos_sistema'),
    (7, 'public.partido_snapshots_tacticos'),
    (8, 'public.partido_snapshot_tactico_slots')
  ) specifications(table_order, table_name)
),
scenario_specifications as (
  select scenario_order, scenario, database_role, auth_uid
  from constants
  cross join lateral (values
    (1, 'BORJA_PLAYER', 'authenticated', constants.borja_auth_uid),
    (2, 'UID_WITHOUT_MEMBERSHIP', 'authenticated', constants.no_membership_uid),
    (3, 'ANON', 'anon', null::uuid),
    (4, 'STAFF', 'authenticated', constants.staff_auth_uid)
  ) scenarios(scenario_order, scenario, database_role, auth_uid)
),
direct_results as materialized (
  select
    table_specifications.table_order,
    table_specifications.table_name,
    scenario_specifications.scenario_order,
    scenario_specifications.scenario,
    result.access_mode,
    result.row_count,
    result.error_code,
    result.error_message
  from table_specifications
  cross join scenario_specifications
  cross join lateral pg_temp.player18_table_count(
    table_specifications.table_name,
    scenario_specifications.database_role,
    scenario_specifications.auth_uid
  ) result
),
staff_baselines as materialized (
  select
    table_specifications.table_order,
    table_specifications.table_name,
    result.access_mode,
    result.row_count,
    result.error_code
  from table_specifications
  cross join lateral pg_temp.player18_table_count(
    table_specifications.table_name,
    'postgres',
    null::uuid
  ) result
),
rpc_specifications as (
  select *
  from (values
    (
      1,
      'public.get_my_player_matches()',
      0,
      0,
      '',
      'TABLE(partido_id uuid, match_date text, opponent text, opponent_crest text, is_home boolean, home_team text, away_team text, home_score text, away_score text, stadium text, competition_key text, competition_name text, competition_logo_url text, match_round text, timeline jsonb)',
      'select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r)), ''[]''::jsonb) from public.get_my_player_matches() r',
      false
    ),
    (
      2,
      'public.get_my_player_analysis_overview(text,text)',
      2,
      2,
      'p_competition_scope text, p_venue text',
      'TABLE(competition_scope text, venue text, match_records integer, matches_played integer, minutes integer, possible_minutes integer, minutes_per_match numeric, starts integer, bench_entries integer, participation_percentage numeric, goals integer, goals_coverage text, assists integer, assists_coverage text, goal_contributions integer, goal_contributions_coverage text, goals_per_90 numeric, assists_per_90 numeric, goal_contributions_per_90 numeric, yellow_cards integer, red_cards integer)',
      'select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r)), ''[]''::jsonb) from public.get_my_player_analysis_overview(''all'', ''all'') r',
      true
    ),
    (
      3,
      'public.get_my_player_analysis_live_stats(text,text,text)',
      3,
      3,
      'p_competition_scope text, p_venue text, p_window text',
      'TABLE(competition_scope text, venue text, window text, matches_with_events integer, event_count integer, goals integer, goals_per_match numeric, shots integer, shots_per_match numeric, shots_on_target integer, shots_on_target_per_match numeric, shot_accuracy_percentage numeric, crosses integer, crosses_per_match numeric, turnovers integer, turnovers_per_match numeric, steals integer, steals_per_match numeric, fouls_committed integer, fouls_committed_per_match numeric, fouls_received integer, fouls_received_per_match numeric)',
      'select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r)), ''[]''::jsonb) from public.get_my_player_analysis_live_stats(''all'', ''all'', ''full_scope'') r',
      true
    ),
    (
      4,
      'public.get_my_player_production_actions(text,text)',
      2,
      2,
      'p_competition_scope text, p_venue text',
      'TABLE(action_type text, minute integer, match_date date, opponent text, opponent_crest text, result text, competition_key text, competition_name text, venue text, phase text, subphase text, contact text, shot_zone_key text, shot_zone_name text, assist_zone_key text, assist_zone_name text, goal_zone_key text, goal_zone_name text, counterpart_role text, counterpart_name text, video_url text, video_available boolean)',
      'select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r)), ''[]''::jsonb) from public.get_my_player_production_actions(''all'', ''all'') r',
      true
    ),
    (
      5,
      'public.get_my_player_match_history(text,text,integer,integer)',
      4,
      4,
      'p_competition_scope text, p_venue text, p_limit integer, p_offset integer',
      'TABLE(match_date date, opponent text, opponent_crest text, result text, outcome text, competition_key text, competition_name text, competition_logo_url text, venue text, role text, minutes integer, goals integer, goals_coverage text, assists integer, assists_coverage text, yellow_cards integer, red_cards integer, has_allowed_video boolean)',
      'select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) - ''page_offset'' - ''row_order'' order by r.page_offset, r.row_order), ''[]''::jsonb) from (select page.page_offset, row_number() over () as row_order, history.* from pg_catalog.generate_series(0, 4950, 50) page(page_offset) cross join lateral public.get_my_player_match_history(''all'', ''all'', 50, page.page_offset) history) r',
      true
    )
  ) specifications(
    rpc_order,
    signature,
    expected_input_count,
    expected_default_count,
    expected_arguments,
    expected_result,
    call_sql,
    requires_current_jugador
  )
),
rpc_catalog as (
  select
    specification.*,
    procedure.oid,
    procedure.proowner,
    procedure.prolang,
    procedure.prosecdef,
    procedure.provolatile,
    procedure.prokind,
    procedure.pronargs,
    procedure.pronargdefaults,
    procedure.proconfig,
    procedure.prosrc,
    procedure.proacl,
    pg_catalog.pg_get_function_identity_arguments(procedure.oid) as actual_arguments,
    pg_catalog.replace(pg_catalog.pg_get_function_result(procedure.oid), '"', '') as actual_result,
    pg_catalog.pg_get_userbyid(procedure.proowner) as owner_name,
    language.lanname as language_name
  from rpc_specifications specification
  left join pg_catalog.pg_proc procedure
    on procedure.oid = pg_catalog.to_regprocedure(specification.signature)
  left join pg_catalog.pg_language language on language.oid = procedure.prolang
),
rpc_results as materialized (
  select
    catalog.rpc_order,
    catalog.signature,
    scenario_specifications.scenario_order,
    scenario_specifications.scenario,
    result.access_mode,
    result.result,
    result.error_code,
    result.error_message
  from rpc_catalog catalog
  cross join scenario_specifications
  cross join lateral pg_temp.player18_rpc_json(
    scenario_specifications.database_role,
    scenario_specifications.auth_uid,
    catalog.call_sql
  ) result
),
borja_rpc as (
  select * from rpc_results where scenario = 'BORJA_PLAYER'
),
matches_result as (
  select result
  from borja_rpc
  where signature = 'public.get_my_player_matches()'
),
overview_result as (
  select result -> 0 as payload
  from borja_rpc
  where signature = 'public.get_my_player_analysis_overview(text,text)'
),
live_result as (
  select result -> 0 as payload
  from borja_rpc
  where signature = 'public.get_my_player_analysis_live_stats(text,text,text)'
),
production_result as (
  select result
  from borja_rpc
  where signature = 'public.get_my_player_production_actions(text,text)'
),
history_result as (
  select result
  from borja_rpc
  where signature = 'public.get_my_player_match_history(text,text,integer,integer)'
),
match_baseline as (
  select
    pg_catalog.count(*)::integer as total_rows,
    pg_catalog.count(*) filter (where not match_row.player_visible)::integer as player_visible_false_rows
  from public.partidos match_row
),
timeline_audit as (
  select
    pg_catalog.count(*) filter (
      where event.payload is null
         or pg_catalog.jsonb_typeof(event.payload) <> 'object'
         or event.payload ?| array[
           'system_change', 'tactic', 'quick_event', 'notes', 'post', 'snapshot',
           'injured', 'substitution', 'post_video_link', 'description'
         ]
         or exists (
           select 1
           from pg_catalog.jsonb_object_keys(event.payload) key_row(key_name)
           where key_row.key_name not in (
             'event_type', 'minute', 'player_name', 'assistant_name',
             'card_count', 'video_url'
           )
         )
         or event.payload ->> 'event_type' not in (
           'Gol a favor', 'Gol en contra', 'Amarilla', 'Roja'
         )
         or (
           nullif(event.payload ->> 'video_url', '') is not null
           and event.payload ->> 'video_url'
             !~* '^https://(youtu[.]be|youtube[.]com|www[.]youtube[.]com|m[.]youtube[.]com)(/|$)'
         )
    )::integer as invalid_events
  from matches_result
  cross join lateral pg_catalog.jsonb_array_elements(matches_result.result) match_row(payload)
  cross join lateral pg_catalog.jsonb_array_elements(
    coalesce(match_row.payload -> 'timeline', '[]'::jsonb)
  ) event(payload)
),
match_output_audit as (
  select
    pg_catalog.count(*) filter (
      where pg_catalog.jsonb_typeof(match_row.payload) <> 'object'
         or exists (
           select 1
           from pg_catalog.jsonb_object_keys(match_row.payload) key_row(key_name)
           where key_row.key_name not in (
             'partido_id', 'match_date', 'opponent', 'opponent_crest', 'is_home',
             'home_team', 'away_team', 'home_score', 'away_score', 'stadium',
             'competition_key', 'competition_name', 'competition_logo_url',
             'match_round', 'timeline'
           )
         )
         or match_row.payload ?| array[
           'pre', 'post', 'stats', 'tactics', 'scouting', 'lineup', 'squad',
           'snapshots', 'quick_events', 'notes', 'print', 'post_video_link',
           'rating', 'injured', 'player_id', 'jugador_id', 'description'
         ]
    )::integer as invalid_rows
  from matches_result
  cross join lateral pg_catalog.jsonb_array_elements(matches_result.result) match_row(payload)
),
production_audit as (
  select
    pg_catalog.count(*) filter (
      where action.payload ->> 'action_type' not in ('goal', 'assist')
         or (
           nullif(action.payload ->> 'video_url', '') is not null
           and action.payload ->> 'video_url'
             !~* '^https://(youtu[.]be|youtube[.]com|www[.]youtube[.]com|m[.]youtube[.]com)(/|$)'
         )
         or action.payload ?| array[
           'partido_id', 'event_id', 'scorer_id', 'assistant_id', 'jugador_id',
           'user_id', 'membership_id', 'notes', 'description', 'post_video_link'
         ]
    )::integer as invalid_rows
  from production_result
  cross join lateral pg_catalog.jsonb_array_elements(production_result.result) action(payload)
),
history_totals as (
  select
    pg_catalog.count(*)::integer as match_records,
    pg_catalog.count(*) filter (
      where coalesce((history.payload ->> 'minutes')::integer, 0) > 0
         or pg_catalog.lower(coalesce(history.payload ->> 'role', '')) = 'titular'
    )::integer as matches_played,
    coalesce(pg_catalog.sum((history.payload ->> 'minutes')::integer), 0)::integer as minutes,
    pg_catalog.count(*) filter (
      where pg_catalog.lower(coalesce(history.payload ->> 'role', '')) = 'titular'
    )::integer as starts,
    pg_catalog.count(*) filter (
      where coalesce((history.payload ->> 'minutes')::integer, 0) > 0
        and pg_catalog.lower(coalesce(history.payload ->> 'role', '')) <> 'titular'
    )::integer as bench_entries,
    coalesce(pg_catalog.sum((history.payload ->> 'goals')::integer), 0)::integer as goals,
    coalesce(pg_catalog.sum((history.payload ->> 'assists')::integer), 0)::integer as assists,
    coalesce(pg_catalog.sum((history.payload ->> 'yellow_cards')::integer), 0)::integer as yellow_cards,
    coalesce(pg_catalog.sum((history.payload ->> 'red_cards')::integer), 0)::integer as red_cards
  from history_result
  cross join lateral pg_catalog.jsonb_array_elements(history_result.result) history(payload)
),
contract_checks as (
  select
    catalog.rpc_order,
    catalog.signature,
    (
      catalog.oid is not null
      and catalog.owner_name = 'postgres'
      and catalog.language_name = 'plpgsql'
      and catalog.prosecdef
      and catalog.provolatile = 's'
      and catalog.prokind = 'f'
      and catalog.pronargs = catalog.expected_input_count
      and catalog.pronargdefaults = catalog.expected_default_count
      and catalog.actual_arguments = catalog.expected_arguments
      and catalog.actual_result = catalog.expected_result
      and catalog.proconfig is not distinct from array['search_path=pg_catalog']::text[]
      and pg_catalog.strpos(catalog.prosrc, 'player_visible') = 0
      and (
        pg_catalog.length(catalog.prosrc)
        - pg_catalog.length(pg_catalog.replace(catalog.prosrc, 'where true', ''))
      ) / pg_catalog.length('where true') = 1
      and pg_catalog.strpos(catalog.prosrc, 'public.current_membership()') > 0
      and pg_catalog.strpos(catalog.prosrc, 'public.is_player()') > 0
      and pg_catalog.strpos(catalog.prosrc, 'supported_club_id') > 0
      and (
        not catalog.requires_current_jugador
        or (
          pg_catalog.strpos(catalog.prosrc, 'auth.uid()') > 0
          and pg_catalog.strpos(catalog.prosrc, 'public.current_jugador_id()') > 0
        )
      )
      and catalog.prosrc !~* 'select[[:space:]]+[*][[:space:]]+from[[:space:]]+public[.]partidos'
      and catalog.prosrc !~* '(^|[^a-z0-9_])execute([^a-z0-9_]|$)'
      and catalog.prosrc !~* '(^|[^a-z0-9_])(insert|update|delete|merge|truncate)([^a-z0-9_]|$)'
      and not pg_catalog.has_function_privilege('anon', catalog.oid, 'EXECUTE')
      and pg_catalog.has_function_privilege('authenticated', catalog.oid, 'EXECUTE')
      and pg_catalog.has_function_privilege('service_role', catalog.oid, 'EXECUTE')
      and not exists (
        select 1
        from pg_catalog.aclexplode(coalesce(
          catalog.proacl,
          pg_catalog.acldefault('f', catalog.proowner)
        )) acl
        where acl.privilege_type = 'EXECUTE'
          and (
            acl.grantee = 0
            or acl.grantee not in (
              catalog.proowner,
              'authenticated'::regrole::oid,
              'service_role'::regrole::oid
            )
          )
      )
    ) as test_ok
  from rpc_catalog catalog
),
rls_checks as (
  select
    table_specifications.table_order,
    table_specifications.table_name,
    relation.relrowsecurity
      and pg_catalog.count(policy.oid) = 4
      and pg_catalog.bool_and(
        policy.polpermissive
        and policy.polname in (
          'player_sports_staff_select', 'player_sports_staff_insert',
          'player_sports_staff_update', 'player_sports_staff_delete'
        )
        and policy.polroles = array['authenticated'::regrole::oid]::oid[]
        and (
          policy.polcmd = 'a'
          or coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')
             like '%is_app_staff()%'
        )
        and (
          policy.polcmd in ('r', 'd')
          or coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), '')
             like '%is_app_staff()%'
        )
      ) as test_ok
  from table_specifications
  join pg_catalog.pg_class relation
    on relation.oid = pg_catalog.to_regclass(table_specifications.table_name)
  left join pg_catalog.pg_policy policy on policy.polrelid = relation.oid
  group by table_specifications.table_order, table_specifications.table_name,
           relation.relrowsecurity
),
checks as (
  select
    10 as sort_group,
    direct_results.table_order * 10 + direct_results.scenario_order as sort_key,
    'DIRECT_TABLES'::text as category,
    direct_results.scenario,
    direct_results.table_name as object_name,
    'RLS_DIRECT_ACCESS'::text as check_name,
    case
      when direct_results.scenario = 'STAFF' then 'SELECT_OK = postgres baseline'
      when direct_results.scenario = 'ANON' then 'DENIED 42501'
      else 'SELECT_OK, 0 rows'
    end::text as expected,
    pg_catalog.format(
      '%s; rows=%s; sqlstate=%s',
      direct_results.access_mode,
      coalesce(direct_results.row_count::text, 'NULL'),
      coalesce(direct_results.error_code, 'NULL')
    )::text as observed,
    case
      when direct_results.scenario = 'STAFF' then
        direct_results.access_mode = 'SELECT_OK'
        and direct_results.row_count is not distinct from staff_baselines.row_count
      when direct_results.scenario = 'ANON' then
        direct_results.access_mode = 'DENIED'
        and direct_results.error_code = '42501'
      else
        direct_results.access_mode = 'SELECT_OK'
        and direct_results.row_count = 0
    end as test_ok,
    coalesce(direct_results.error_message, '')::text as details
  from direct_results
  join staff_baselines using (table_order, table_name)

  union all

  select
    20,
    rls_checks.table_order,
    'RLS_CATALOG',
    'CATALOG',
    rls_checks.table_name,
    'STAFF_ONLY_POLICIES_INTACT',
    'RLS ON; exactly 4 STAFF policies',
    case when rls_checks.test_ok then 'MATCH' else 'MISMATCH' end,
    rls_checks.test_ok,
    ''
  from rls_checks

  union all

  select
    30,
    contract_checks.rpc_order,
    'RPC_CONTRACT',
    'CATALOG',
    contract_checks.signature,
    'EXACT_CONTRACT_WITHOUT_PLAYER_VISIBLE',
    'owner/definer/stable/search_path/ACL/output/identity exact',
    case when contract_checks.test_ok then 'MATCH' else 'MISMATCH' end,
    contract_checks.test_ok,
    ''
  from contract_checks

  union all

  select
    40,
    rpc_results.rpc_order * 10 + rpc_results.scenario_order,
    'RPC_IDENTITY',
    rpc_results.scenario,
    rpc_results.signature,
    'PLAYER_ONLY_EXECUTION',
    case
      when rpc_results.scenario = 'BORJA_PLAYER' then 'EXECUTE_OK'
      when rpc_results.scenario = 'ANON' then 'DENIED 42501'
      else 'EXECUTE_OK, 0 rows'
    end,
    pg_catalog.format(
      '%s; rows=%s; sqlstate=%s',
      rpc_results.access_mode,
      case when rpc_results.result is null then 'NULL'
           else pg_catalog.jsonb_array_length(rpc_results.result)::text end,
      coalesce(rpc_results.error_code, 'NULL')
    ),
    case
      when rpc_results.scenario = 'BORJA_PLAYER' then
        rpc_results.access_mode = 'EXECUTE_OK'
      when rpc_results.scenario = 'ANON' then
        rpc_results.access_mode = 'DENIED' and rpc_results.error_code = '42501'
      else
        rpc_results.access_mode = 'EXECUTE_OK'
        and rpc_results.result = '[]'::jsonb
    end,
    coalesce(rpc_results.error_message, '')
  from rpc_results

  union all

  select
    50,
    1,
    'PLAYER_MATCHES',
    'BORJA_PLAYER',
    'public.get_my_player_matches()',
    'ALL_STAFF_MATCHES',
    match_baseline.total_rows::text,
    pg_catalog.jsonb_array_length(matches_result.result)::text,
    pg_catalog.jsonb_array_length(matches_result.result) = match_baseline.total_rows,
    'La base STAFF auditada es la coleccion completa public.partidos.'
  from matches_result cross join match_baseline

  union all

  select
    50,
    2,
    'PLAYER_MATCHES',
    'BORJA_PLAYER',
    'public.get_my_player_matches()',
    'PLAYER_VISIBLE_INDEPENDENCE',
    'player_visible_false_rows > 0 AND rpc_rows > 0',
    pg_catalog.format(
      'player_visible_false_rows=%s; rpc_rows=%s',
      match_baseline.player_visible_false_rows,
      pg_catalog.jsonb_array_length(matches_result.result)
    ),
    match_baseline.player_visible_false_rows > 0
      and pg_catalog.jsonb_array_length(matches_result.result) > 0,
    'No se modifica ningun dato para esta prueba.'
  from matches_result cross join match_baseline

  union all

  select
    50, 3, 'PLAYER_MATCHES', 'BORJA_PLAYER',
    'public.get_my_player_matches()', 'SANITIZED_OUTPUT',
    '0 invalid rows', match_output_audit.invalid_rows::text,
    match_output_audit.invalid_rows = 0,
    'Contrato exacto; sin PRE/POST/tactica/stats internas/notes.'
  from match_output_audit

  union all

  select
    50, 4, 'PLAYER_MATCHES', 'BORJA_PLAYER',
    'public.get_my_player_matches()', 'TIMELINE_AND_VIDEO_ALLOWLIST',
    '0 invalid events', timeline_audit.invalid_events::text,
    timeline_audit.invalid_events = 0,
    'Solo goles/asistencia asociada/amarilla/roja; video HTTPS YouTube.'
  from timeline_audit

  union all

  select
    60, 1, 'PLAYER_ANALYSIS', 'BORJA_PLAYER',
    'public.get_my_player_analysis_overview(text,text)', 'REAL_OWN_DATA',
    '1 row; match_records > 0',
    pg_catalog.format(
      'rows=%s; match_records=%s',
      pg_catalog.jsonb_array_length(borja_rpc.result),
      coalesce(overview_result.payload ->> 'match_records', 'NULL')
    ),
    pg_catalog.jsonb_array_length(borja_rpc.result) = 1
      and coalesce((overview_result.payload ->> 'match_records')::integer, 0) > 0,
    'Ambito all/all sin player_visible.'
  from borja_rpc cross join overview_result
  where borja_rpc.signature = 'public.get_my_player_analysis_overview(text,text)'

  union all

  select
    60, 2, 'PLAYER_ANALYSIS', 'BORJA_PLAYER',
    'public.get_my_player_analysis_live_stats(text,text,text)', 'REAL_VALIDATED_AGGREGATES',
    '1 row; event_count > 0',
    pg_catalog.format(
      'rows=%s; matches_with_events=%s; event_count=%s',
      pg_catalog.jsonb_array_length(borja_rpc.result),
      coalesce(live_result.payload ->> 'matches_with_events', 'NULL'),
      coalesce(live_result.payload ->> 'event_count', 'NULL')
    ),
    pg_catalog.jsonb_array_length(borja_rpc.result) = 1
      and coalesce((live_result.payload ->> 'event_count')::integer, 0) > 0,
    'El cuerpo conserva reviewed=true y delegated_data_status=Validado.'
  from borja_rpc cross join live_result
  where borja_rpc.signature = 'public.get_my_player_analysis_live_stats(text,text,text)'

  union all

  select
    60, 3, 'PLAYER_ANALYSIS', 'BORJA_PLAYER',
    'public.get_my_player_production_actions(text,text)', 'UUID_ONLY_REAL_ACTIONS',
    'rows > 0; 0 invalid rows',
    pg_catalog.format(
      'rows=%s; invalid=%s',
      pg_catalog.jsonb_array_length(production_result.result),
      production_audit.invalid_rows
    ),
    pg_catalog.jsonb_array_length(production_result.result) > 0
      and production_audit.invalid_rows = 0,
    'Atribucion propia por scorer_id/assistant_id; legacy no suma.'
  from production_result cross join production_audit

  union all

  select
    60, 4, 'PLAYER_ANALYSIS', 'BORJA_PLAYER',
    'public.get_my_player_match_history(text,text,integer,integer)', 'REAL_OWN_HISTORY',
    'rows > 0',
    pg_catalog.jsonb_array_length(history_result.result)::text,
    pg_catalog.jsonb_array_length(history_result.result) > 0,
    'Paginacion completa all/all sin player_visible.'
  from history_result

  union all

  select
    70, 1, 'RECONCILIATION', 'BORJA_PLAYER',
    'Overview <-> History', 'ALL_CORE_TOTALS_MATCH',
    'match_records/matches/minutes/starts/bench/goals/assists/cards equal',
    pg_catalog.format(
      'overview_records=%s; history_records=%s',
      overview_result.payload ->> 'match_records',
      history_totals.match_records
    ),
    (overview_result.payload ->> 'match_records')::integer = history_totals.match_records
      and (overview_result.payload ->> 'matches_played')::integer = history_totals.matches_played
      and (overview_result.payload ->> 'minutes')::integer = history_totals.minutes
      and (overview_result.payload ->> 'possible_minutes')::integer = history_totals.match_records * 90
      and (overview_result.payload ->> 'starts')::integer = history_totals.starts
      and (overview_result.payload ->> 'bench_entries')::integer = history_totals.bench_entries
      and (overview_result.payload ->> 'goals')::integer = history_totals.goals
      and (overview_result.payload ->> 'assists')::integer = history_totals.assists
      and (overview_result.payload ->> 'yellow_cards')::integer = history_totals.yellow_cards
      and (overview_result.payload ->> 'red_cards')::integer = history_totals.red_cards,
    'Mismo ambito deportivo all/all y atribucion propia.'
  from overview_result cross join history_totals

  union all

  select
    80, 1, 'FAIL_CLOSED', 'CATALOG',
    'public.get_my_player_position_distribution(text,text)', 'POSITIONS_ABSENT',
    'MISSING',
    case when pg_catalog.to_regprocedure(
      'public.get_my_player_position_distribution(text,text)'
    ) is null then 'MISSING' else 'EXISTS' end,
    pg_catalog.to_regprocedure(
      'public.get_my_player_position_distribution(text,text)'
    ) is null,
    'Bloque 2.7D no implementa posiciones.'
),
numbered as (
  select
    pg_catalog.row_number() over (order by sort_group, sort_key, category, scenario, object_name) as test_number,
    category,
    scenario,
    object_name,
    check_name,
    expected,
    observed,
    coalesce(test_ok, false) as test_ok,
    details
  from checks
)
select
  test_number,
  category,
  scenario,
  object_name,
  check_name,
  expected,
  observed,
  test_ok,
  details
from numbered
order by test_number;

rollback;
