-- BLOQUE 2.1b - Verificacion funcional READ ONLY del cierre PLAYER.
--
-- Ejecutar el archivo COMPLETO despues de la migracion 14.
-- Devuelve UN UNICO result set y termina en ROLLBACK.
-- No llama a ninguna RPC mutadora y no realiza escrituras persistentes.

begin;
set transaction read only;
set local statement_timeout = '120s';
set local lock_timeout = '5s';
set local row_security = on;

do $verify$
declare
  results jsonb := '[]'::jsonb;
  result_order integer := 0;
  target_table text;
  scenario record;
  function_target record;
  relation_oid oid;
  function_oid oid;
  function_source text;
  normalized_function_source text;
  unguarded_function_source text;
  expected_guarded_function_source text;
  function_owner oid;
  function_definition text;
  visible_count bigint;
  policy_count integer;
  open_policy_count integer;
  error_state text;
  error_message text;
  public_execute boolean;
  anon_execute boolean;
  authenticated_execute boolean;
  service_role_execute boolean;
  guard_present boolean;
  guard_is_early boolean;
  guard_occurrence_count integer;
  main_begin_count integer;
  main_begin_match text[];
  normalized_source_md5 text;
  actual_security_definer boolean;
  service_role_ok boolean;
  bucket_public boolean;
  staff_guard constant text := E'  if coalesce(auth.role(), '''') <> ''service_role''\n'
    || E'     and session_user <> ''service_role''\n'
    || E'     and not public.is_app_staff() then\n'
    || E'    raise exception using\n'
    || E'      errcode = ''42501'',\n'
    || E'      message = ''STAFF_ONLY'';\n'
    || E'  end if;\n\n';
begin
  ---------------------------------------------------------------------------
  -- Catalogo RLS/policies/grants de las siete tablas cerradas.
  ---------------------------------------------------------------------------
  foreach target_table in array array[
    'jugadores',
    'players_database',
    'player_team_memberships',
    'player_positions',
    'player_sources',
    'player_scouting_traits',
    'legacy_own_player_migration'
  ]
  loop
    relation_oid := pg_catalog.to_regclass(
      pg_catalog.format('public.%I', target_table)
    );

    select pg_catalog.count(*)::integer
    into policy_count
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = target_table
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

    select pg_catalog.count(*)::integer
    into open_policy_count
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = target_table
      and (
        pg_catalog.regexp_replace(
          pg_catalog.lower(coalesce(policy.qual, '')),
          '[[:space:]()]', '', 'g'
        ) = 'true'
        or pg_catalog.regexp_replace(
          pg_catalog.lower(coalesce(policy.with_check, '')),
          '[[:space:]()]', '', 'g'
        ) = 'true'
      );

    service_role_ok := relation_oid is not null
      and pg_catalog.has_table_privilege('service_role', relation_oid, 'SELECT')
      and pg_catalog.has_table_privilege('service_role', relation_oid, 'INSERT')
      and pg_catalog.has_table_privilege('service_role', relation_oid, 'UPDATE')
      and pg_catalog.has_table_privilege('service_role', relation_oid, 'DELETE');

    result_order := result_order + 1;
    results := results || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'test_order', result_order,
        'category', 'TABLE_CONTRACT',
        'scenario', 'CATALOG',
        'object_name', 'public.' || target_table,
        'expected', 'RLS ON; exactamente 4 policies STAFF; 0 USING(true)/WITH CHECK(true); service_role operativo',
        'observed', pg_catalog.jsonb_build_object(
          'exists', relation_oid is not null,
          'rls_enabled', case when relation_oid is null then null else (
            select relation.relrowsecurity
            from pg_catalog.pg_class relation
            where relation.oid = relation_oid
          ) end,
          'force_rls', case when relation_oid is null then null else (
            select relation.relforcerowsecurity
            from pg_catalog.pg_class relation
            where relation.oid = relation_oid
          ) end,
          'staff_policy_count', policy_count,
          'all_policy_count', (
            select pg_catalog.count(*)
            from pg_catalog.pg_policies policy
            where policy.schemaname = 'public'
              and policy.tablename = target_table
          ),
          'open_true_policy_count', open_policy_count,
          'service_role_crud', service_role_ok
        ),
        'risk_level', case
          when relation_oid is null or policy_count <> 4 or open_policy_count <> 0
            or not service_role_ok then 'CRITICAL'
          when not (
            select relation.relrowsecurity
            from pg_catalog.pg_class relation
            where relation.oid = relation_oid
          ) then 'CRITICAL'
          else 'INFO'
        end,
        'test_ok', relation_oid is not null
          and (
            select relation.relrowsecurity
            from pg_catalog.pg_class relation
            where relation.oid = relation_oid
          )
          and policy_count = 4
          and (
            select pg_catalog.count(*)
            from pg_catalog.pg_policies policy
            where policy.schemaname = 'public'
              and policy.tablename = target_table
          ) = 4
          and open_policy_count = 0
          and service_role_ok,
        'details', null
      )
    );
  end loop;

  ---------------------------------------------------------------------------
  -- Pruebas funcionales SELECT bajo JWT simulado.
  ---------------------------------------------------------------------------
  for scenario in
    select *
    from (values
      ('BORJA_PLAYER', 'authenticated', '350615a9-b068-450a-b867-da30a59b9082', false),
      ('UID_WITHOUT_MEMBERSHIP', 'authenticated', '00000000-0000-4000-8000-000000000099', false),
      ('ANON', 'anon', null, false),
      ('STAFF', 'authenticated', 'e0933d02-76c7-4e71-9765-896593e1ae80', true),
      ('OWNER', 'authenticated', '4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3', true)
    ) scenarios(scenario_name, database_role, user_id, should_read)
  loop
    perform pg_catalog.set_config(
      'request.jwt.claims',
      case
        when scenario.user_id is null
          then pg_catalog.jsonb_build_object('role', scenario.database_role)::text
        else pg_catalog.jsonb_build_object(
          'sub', scenario.user_id,
          'role', scenario.database_role
        )::text
      end,
      true
    );
    perform pg_catalog.set_config(
      'request.jwt.claim.sub', coalesce(scenario.user_id, ''), true
    );
    perform pg_catalog.set_config(
      'request.jwt.claim.role', scenario.database_role, true
    );

    foreach target_table in array array[
      'jugadores',
      'players_database',
      'player_team_memberships',
      'player_positions',
      'player_sources',
      'player_scouting_traits',
      'legacy_own_player_migration'
    ]
    loop
      visible_count := null;
      error_state := null;
      error_message := null;
      begin
        execute pg_catalog.format('set local role %I', scenario.database_role);
        execute pg_catalog.format(
          'select pg_catalog.count(*)::bigint from public.%I',
          target_table
        ) into visible_count;
        execute 'reset role';
      exception when others then
        get stacked diagnostics
          error_state = returned_sqlstate,
          error_message = message_text;
        begin execute 'reset role'; exception when others then null; end;
      end;

      result_order := result_order + 1;
      results := results || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'test_order', result_order,
          'category', 'TABLE_SELECT_SIMULATION',
          'scenario', scenario.scenario_name,
          'object_name', 'public.' || target_table,
          'expected', case
            when scenario.should_read then '>0 filas para STAFF/OWNER'
            else '0 filas o permiso denegado'
          end,
          'observed', case
            when error_state is not null then pg_catalog.jsonb_build_object(
              'status', 'DENIED_OR_ERROR',
              'sqlstate', error_state,
              'message', error_message
            )
            else pg_catalog.jsonb_build_object(
              'status', 'QUERY_SUCCEEDED',
              'visible_rows', visible_count
            )
          end,
          'risk_level', case
            when scenario.should_read
             and (error_state is not null or coalesce(visible_count, 0) = 0) then 'HIGH'
            when not scenario.should_read
             and error_state is null and visible_count > 0 then 'CRITICAL'
            else 'INFO'
          end,
          'test_ok', case
            when scenario.should_read
              then error_state is null and coalesce(visible_count, 0) > 0
            else error_state is not null or coalesce(visible_count, 0) = 0
          end,
          'details', 'SELECT/COUNT real bajo SET LOCAL ROLE; no se muestran datos.'
        )
      );
    end loop;

    -- Listado de metadatos del bucket jugadores.
    visible_count := null;
    error_state := null;
    error_message := null;
    begin
      execute pg_catalog.format('set local role %I', scenario.database_role);
      execute $sql$
        select pg_catalog.count(*)::bigint
        from storage.objects object_row
        where object_row.bucket_id = 'jugadores'
      $sql$ into visible_count;
      execute 'reset role';
    exception when others then
      get stacked diagnostics
        error_state = returned_sqlstate,
        error_message = message_text;
      begin execute 'reset role'; exception when others then null; end;
    end;

    result_order := result_order + 1;
    results := results || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'test_order', result_order,
        'category', 'STORAGE_SELECT_SIMULATION',
        'scenario', scenario.scenario_name,
        'object_name', 'storage.objects / jugadores',
        'expected', case
          when scenario.should_read then '>0 objetos para STAFF/OWNER'
          else '0 objetos o permiso denegado'
        end,
        'observed', case
          when error_state is not null then pg_catalog.jsonb_build_object(
            'status', 'DENIED_OR_ERROR',
            'sqlstate', error_state,
            'message', error_message
          )
          else pg_catalog.jsonb_build_object(
            'status', 'QUERY_SUCCEEDED',
            'visible_objects', visible_count
          )
        end,
        'risk_level', case
          when scenario.should_read
           and (error_state is not null or coalesce(visible_count, 0) = 0) then 'HIGH'
          when not scenario.should_read
           and error_state is null and visible_count > 0 then 'CRITICAL'
          else 'INFO'
        end,
        'test_ok', case
          when scenario.should_read
            then error_state is null and coalesce(visible_count, 0) > 0
          else error_state is not null or coalesce(visible_count, 0) = 0
        end,
        'details', 'Cuenta metadatos visibles; no descarga ni muestra nombres/rutas.'
      )
    );
  end loop;

  ---------------------------------------------------------------------------
  -- Storage: contrato estatico y preservacion public=true/service_role.
  ---------------------------------------------------------------------------
  select bucket.public
  into bucket_public
  from storage.buckets bucket
  where bucket.id = 'jugadores';

  select pg_catalog.count(*)::integer
  into policy_count
  from pg_catalog.pg_policies policy
  where policy.schemaname = 'storage'
    and policy.tablename = 'objects'
    and policy.policyname in (
      'player_assets_staff_select',
      'player_assets_staff_insert',
      'player_assets_staff_update',
      'player_assets_staff_delete'
    )
    and policy.roles = array['authenticated']::name[]
    and pg_catalog.lower(
      coalesce(policy.qual, '') || ' ' || coalesce(policy.with_check, '')
    ) like '%jugadores%'
    and pg_catalog.lower(
      coalesce(policy.qual, '') || ' ' || coalesce(policy.with_check, '')
    ) like '%is_app_staff%';

  service_role_ok := pg_catalog.has_table_privilege(
    'service_role', 'storage.objects', 'SELECT'
  ) and pg_catalog.has_table_privilege(
    'service_role', 'storage.objects', 'INSERT'
  ) and pg_catalog.has_table_privilege(
    'service_role', 'storage.objects', 'UPDATE'
  ) and pg_catalog.has_table_privilege(
    'service_role', 'storage.objects', 'DELETE'
  );

  result_order := result_order + 1;
  results := results || pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'test_order', result_order,
      'category', 'STORAGE_CONTRACT',
      'scenario', 'CATALOG',
      'object_name', 'bucket jugadores',
      'expected', 'public=true conservado; 4 policies STAFF; ninguna policy anon para jugadores; service_role operativo',
      'observed', pg_catalog.jsonb_build_object(
        'bucket_public', bucket_public,
        'staff_policy_count', policy_count,
        'anon_or_public_player_bucket_policy_count', (
          select pg_catalog.count(*)
          from pg_catalog.pg_policies policy
          where policy.schemaname = 'storage'
            and policy.tablename = 'objects'
            and policy.roles && array['public', 'anon']::name[]
            and pg_catalog.lower(
              coalesce(policy.qual, '') || ' ' || coalesce(policy.with_check, '')
            ) like '%jugadores%'
        ),
        'service_role_crud', service_role_ok
      ),
      'risk_level', case
        when bucket_public is distinct from true
          or policy_count <> 4
          or not service_role_ok then 'CRITICAL'
        else 'MEDIUM'
      end,
      'test_ok', bucket_public
        and policy_count = 4
        and service_role_ok
        and (
          select pg_catalog.count(*)
          from pg_catalog.pg_policies policy
          where policy.schemaname = 'storage'
            and policy.tablename = 'objects'
            and policy.roles && array['public', 'anon']::name[]
            and pg_catalog.lower(
              coalesce(policy.qual, '') || ' ' || coalesce(policy.with_check, '')
            ) like '%jugadores%'
        ) = 0,
      'details', 'Riesgo residual aceptado: una URL publica conocida sigue siendo accesible mientras public=true.'
    )
  );

  ---------------------------------------------------------------------------
  -- RPC mutadoras: auditoria estatica. NO se ejecuta ninguna.
  ---------------------------------------------------------------------------
  for function_target in
    select *
    from (values
      ('public.set_player_availability(uuid,text,integer)', '466c8d47470aaa5acee20cf44fa7d502', true),
      ('public.consume_player_suspensions_for_match(uuid)', '3b02b9eb3bbe11a3a21bfe06cb783e1c', true),
      ('public.apply_rival_tactical_placements(uuid,jsonb)', 'be25e6a1de65150ee8a911eb7a11ccd7', false),
      ('public.assign_global_player_to_team(uuid,uuid,text,text,date)', '3442decaf92c00c43c430fe12078dde7', false),
      ('public.create_own_player_atomic(uuid,jsonb,jsonb,jsonb,jsonb)', '45dfc24ec82df4b8cf3987e7e41fffa2', false),
      ('public.merge_global_player_profiles(uuid,uuid)', '5c5121dbebf1c75b2ec013693c2e5a2e', false),
      ('public.remove_global_player_from_current_team(uuid,date)', '0cd47394f23797cdefa3578eb84e2be9', false),
      ('public.remove_rival_player_from_team_atomic(uuid,uuid,uuid,text)', '665350c6a1dbcfc6eed4b8f12b0799f6', false),
      ('public.save_global_player_profile(jsonb,jsonb,jsonb,jsonb,jsonb)', 'b4a1b3987f20e7eb3cd8695b40341634', false),
      ('public.save_match_squad_lineup_atomic(uuid,text,jsonb,jsonb)', '9a61cf69d600145dbbe9e6fab3e1ccb1', false),
      ('public.save_own_captain_priorities(uuid[])', 'ea72384385e286c5df3f71666d3d2581', false),
      ('public.save_rival_lineup_atomic(uuid,text,jsonb,jsonb,jsonb,jsonb)', 'a103846f1c9da2cf5effc6836f80e742', false)
    ) targets(signature, expected_source_md5, expected_security_definer)
  loop
    function_oid := pg_catalog.to_regprocedure(function_target.signature);
    function_source := null;
    function_owner := null;
    function_definition := null;
    actual_security_definer := null;
    normalized_function_source := null;
    unguarded_function_source := null;
    expected_guarded_function_source := null;
    guard_occurrence_count := 0;
    main_begin_count := 0;
    main_begin_match := null;
    normalized_source_md5 := null;

    select
      function_row.prosrc,
      function_row.proowner,
      pg_catalog.pg_get_functiondef(function_row.oid),
      function_row.prosecdef
    into function_source, function_owner, function_definition, actual_security_definer
    from pg_catalog.pg_proc function_row
    where function_row.oid = function_oid;

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

    anon_execute := function_oid is not null
      and pg_catalog.has_function_privilege('anon', function_oid, 'EXECUTE');
    authenticated_execute := function_oid is not null
      and pg_catalog.has_function_privilege('authenticated', function_oid, 'EXECUTE');
    service_role_execute := function_oid is not null
      and pg_catalog.has_function_privilege('service_role', function_oid, 'EXECUTE');

    if function_oid is not null then
      normalized_function_source := pg_catalog.replace(
        function_source,
        chr(13),
        ''
      );
      guard_occurrence_count := (
        pg_catalog.length(normalized_function_source)
        - pg_catalog.length(pg_catalog.replace(
            normalized_function_source,
            staff_guard,
            ''
          ))
      ) / pg_catalog.length(staff_guard);
      unguarded_function_source := pg_catalog.replace(
        normalized_function_source,
        staff_guard,
        ''
      );
      normalized_source_md5 := pg_catalog.md5(unguarded_function_source);

      select pg_catalog.count(*)::integer
      into main_begin_count
      from pg_catalog.regexp_matches(
        unguarded_function_source,
        '^[[:blank:]]*begin[[:blank:]]*$',
        'gni'
      );
      main_begin_match := pg_catalog.regexp_match(
        unguarded_function_source,
        E'^([[:blank:]]*begin[[:blank:]]*\n)',
        'ni'
      );

      if main_begin_match is not null then
        expected_guarded_function_source := pg_catalog.regexp_replace(
          unguarded_function_source,
          E'^[[:blank:]]*begin[[:blank:]]*\n',
          main_begin_match[1] || staff_guard,
          'ni'
        );
      end if;
    end if;

    guard_present := function_oid is not null
      and guard_occurrence_count = 1
      and normalized_source_md5 = function_target.expected_source_md5;
    guard_is_early := coalesce(
      guard_present
      and main_begin_count = 1
      and main_begin_match is not null
      and normalized_function_source = expected_guarded_function_source,
      false
    );

    result_order := result_order + 1;
    results := results || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'test_order', result_order,
        'category', 'MUTATING_RPC_STATIC',
        'scenario', 'CATALOG_ONLY_NOT_EXECUTED',
        'object_name', function_target.signature,
        'expected', 'PUBLIC=false; anon=false; authenticated=true; service_role=true; guard STAFF al inicio',
        'observed', pg_catalog.jsonb_build_object(
          'exists', function_oid is not null,
          'public_execute', public_execute,
          'anon_execute', anon_execute,
          'authenticated_execute', authenticated_execute,
          'service_role_execute', service_role_execute,
          'guard_present', guard_present,
          'guard_is_early', guard_is_early,
          'guard_occurrences', guard_occurrence_count,
          'main_begin_count', main_begin_count,
          'original_body_md5', normalized_source_md5,
          'original_body_matches_expected',
            normalized_source_md5 = function_target.expected_source_md5,
          'security_mode', case
            when actual_security_definer then 'SECURITY DEFINER'
            else 'SECURITY INVOKER'
          end,
          'security_mode_matches_expected',
            actual_security_definer is not distinct from function_target.expected_security_definer,
          'search_path_or_config', case
            when function_oid is null then null
            else (
              select coalesce(function_row.proconfig, array[]::text[])
              from pg_catalog.pg_proc function_row
              where function_row.oid = function_oid
            )
          end
        ),
        'risk_level', case
          when function_oid is null
            or public_execute
            or anon_execute
            or not authenticated_execute
            or not service_role_execute
            or actual_security_definer is distinct from function_target.expected_security_definer
            or not guard_is_early then 'CRITICAL'
          else 'INFO'
        end,
        'test_ok', function_oid is not null
          and not public_execute
          and not anon_execute
          and authenticated_execute
          and service_role_execute
          and actual_security_definer is not distinct from function_target.expected_security_definer
          and guard_is_early,
        'details', 'La definicion se inspecciona estaticamente; la RPC no se invoca.'
      )
    );
  end loop;

  begin execute 'reset role'; exception when others then null; end;
  perform pg_catalog.set_config('request.jwt.claims', '{}'::jsonb::text, true);
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', '', true);
  perform pg_catalog.set_config(
    'appcaudal.player_perimeter_verify_results',
    results::text,
    true
  );
end;
$verify$;

-- UNICO RESULT SET DEL ARCHIVO.
with verification_rows as (
  select value as row_data
  from pg_catalog.jsonb_array_elements(
    pg_catalog.current_setting(
      'appcaudal.player_perimeter_verify_results',
      false
    )::jsonb
  ) result(value)
)
select
  (row_data ->> 'test_order')::integer as test_order,
  row_data ->> 'category' as category,
  row_data ->> 'scenario' as scenario,
  row_data ->> 'object_name' as object_name,
  row_data ->> 'expected' as expected,
  case
    when pg_catalog.jsonb_typeof(row_data -> 'observed') = 'string'
      then row_data ->> 'observed'
    else (row_data -> 'observed')::text
  end as observed,
  row_data ->> 'risk_level' as risk_level,
  (row_data ->> 'test_ok')::boolean as test_ok,
  case
    when row_data -> 'details' is null
      or row_data -> 'details' = 'null'::jsonb then null
    when pg_catalog.jsonb_typeof(row_data -> 'details') = 'string'
      then row_data ->> 'details'
    else (row_data -> 'details')::text
  end as details
from verification_rows
order by (row_data ->> 'test_order')::integer;

rollback;
