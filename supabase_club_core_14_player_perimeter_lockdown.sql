-- BLOQUE 2.1b - Cierre del perimetro PLAYER antes de Perfil.
--
-- Esta migracion:
--   * sustituye las policies abiertas de jugadores y tablas globales por STAFF;
--   * cierra listado/escritura del bucket jugadores a PLAYER y anon;
--   * mantiene storage.buckets.public = true temporalmente;
--   * añade un guard STAFF al inicio de RPC mutadoras, sin cambiar su logica;
--   * normaliza EXECUTE de esas RPC para owner/authenticated/service_role;
--   * no cambia datos ni grants de tablas/storage.
--
-- No usa DROP POLICY IF EXISTS: todo el estado previo se valida y cualquier
-- drift provoca RAISE EXCEPTION y ROLLBACK de la transaccion completa.

begin;

do $migration$
declare
  target_table text;
  target_role text;
  target_command text;
  policy_count integer;
  table_policy_count integer;
  anon_jugadores_policy text;
  authenticated_jugadores_policy text;
  storage_policy_names text[];
  storage_policy_name text;
  function_target record;
  function_oid oid;
  function_source text;
  function_definition text;
  guarded_definition text;
  function_owner text;
  function_language text;
  function_security_definer boolean;
  authenticated_execute boolean;
  normalized_source_md5 text;
  expected_storage_predicate constant text := 'bucket_id=''jugadores''::text';
  staff_guard constant text := E'  if coalesce(auth.role(), '''') <> ''service_role''\n'
    || E'     and session_user <> ''service_role''\n'
    || E'     and not public.is_app_staff() then\n'
    || E'    raise exception using\n'
    || E'      errcode = ''42501'',\n'
    || E'      message = ''STAFF_ONLY'';\n'
    || E'  end if;\n\n';
begin
  ---------------------------------------------------------------------------
  -- PRECONDICIONES GENERALES.
  ---------------------------------------------------------------------------
  if pg_catalog.to_regprocedure('public.is_app_staff()') is null then
    raise exception 'Bloque 2.1b: falta public.is_app_staff()';
  end if;

  if pg_catalog.to_regprocedure('auth.role()') is null then
    raise exception 'Bloque 2.1b: falta auth.role() para preservar service_role';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc function_row
    where function_row.oid = 'public.is_app_staff()'::regprocedure
      and function_row.provolatile = 's'
      and not function_row.prosecdef
      and pg_catalog.pg_get_function_result(function_row.oid) = 'boolean'
  ) then
    raise exception 'Bloque 2.1b: contrato inesperado de public.is_app_staff()';
  end if;

  if not pg_catalog.has_function_privilege(
    'authenticated', 'public.is_app_staff()'::regprocedure, 'EXECUTE'
  ) then
    raise exception 'Bloque 2.1b: authenticated no puede ejecutar is_app_staff()';
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    raise exception 'Bloque 2.1b: falta el rol service_role';
  end if;

  ---------------------------------------------------------------------------
  -- PRECONDICIONES PUBLIC.JUGADORES.
  ---------------------------------------------------------------------------
  if pg_catalog.to_regclass('public.jugadores') is null then
    raise exception 'Bloque 2.1b: falta public.jugadores';
  end if;

  if not (
    select relation.relrowsecurity
    from pg_catalog.pg_class relation
    where relation.oid = 'public.jugadores'::regclass
  ) then
    raise exception 'Bloque 2.1b: RLS no esta activo en public.jugadores';
  end if;

  select pg_catalog.count(*)::integer
  into table_policy_count
  from pg_catalog.pg_policies policy
  where policy.schemaname = 'public'
    and policy.tablename = 'jugadores';

  if table_policy_count <> 2 then
    raise exception
      'Bloque 2.1b: se esperaban exactamente 2 policies abiertas en jugadores; encontradas %',
      table_policy_count;
  end if;

  select pg_catalog.count(*)::integer, min(policy.policyname)
  into policy_count, anon_jugadores_policy
  from pg_catalog.pg_policies policy
  where policy.schemaname = 'public'
    and policy.tablename = 'jugadores'
    and policy.cmd = 'ALL'
    and policy.permissive = 'PERMISSIVE'
    and policy.roles = array['anon']::name[]
    and pg_catalog.regexp_replace(
      pg_catalog.lower(coalesce(policy.qual, '')), '[[:space:]()]', '', 'g'
    ) = 'true'
    and pg_catalog.regexp_replace(
      pg_catalog.lower(coalesce(policy.with_check, '')), '[[:space:]()]', '', 'g'
    ) = 'true';

  if policy_count <> 1 then
    raise exception
      'Bloque 2.1b: no existe exactamente una policy anon ALL USING(true) WITH CHECK(true) en jugadores';
  end if;

  select pg_catalog.count(*)::integer, min(policy.policyname)
  into policy_count, authenticated_jugadores_policy
  from pg_catalog.pg_policies policy
  where policy.schemaname = 'public'
    and policy.tablename = 'jugadores'
    and policy.cmd = 'ALL'
    and policy.permissive = 'PERMISSIVE'
    and policy.roles = array['authenticated']::name[]
    and pg_catalog.regexp_replace(
      pg_catalog.lower(coalesce(policy.qual, '')), '[[:space:]()]', '', 'g'
    ) = 'true'
    and pg_catalog.regexp_replace(
      pg_catalog.lower(coalesce(policy.with_check, '')), '[[:space:]()]', '', 'g'
    ) = 'true';

  if policy_count <> 1 then
    raise exception
      'Bloque 2.1b: no existe exactamente una policy authenticated ALL USING(true) WITH CHECK(true) en jugadores';
  end if;

  if not pg_catalog.has_table_privilege(
    'authenticated', 'public.jugadores', 'SELECT'
  ) or not pg_catalog.has_table_privilege(
    'authenticated', 'public.jugadores', 'INSERT'
  ) or not pg_catalog.has_table_privilege(
    'authenticated', 'public.jugadores', 'UPDATE'
  ) or not pg_catalog.has_table_privilege(
    'authenticated', 'public.jugadores', 'DELETE'
  ) then
    raise exception 'Bloque 2.1b: faltan grants de tabla requeridos por STAFF en jugadores';
  end if;

  ---------------------------------------------------------------------------
  -- PRECONDICIONES DE LAS SEIS TABLAS GLOBALES.
  ---------------------------------------------------------------------------
  foreach target_table in array array[
    'players_database',
    'player_team_memberships',
    'player_positions',
    'player_sources',
    'player_scouting_traits',
    'legacy_own_player_migration'
  ]
  loop
    if pg_catalog.to_regclass(pg_catalog.format('public.%I', target_table)) is null then
      raise exception 'Bloque 2.1b: falta public.%', target_table;
    end if;

    if not (
      select relation.relrowsecurity
      from pg_catalog.pg_class relation
      where relation.oid = pg_catalog.to_regclass(
        pg_catalog.format('public.%I', target_table)
      )
    ) then
      raise exception 'Bloque 2.1b: RLS no esta activo en public.%', target_table;
    end if;

    select pg_catalog.count(*)::integer
    into table_policy_count
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = target_table;

    if table_policy_count <> 4 then
      raise exception
        'Bloque 2.1b: public.% debe tener exactamente 4 policies legacy; encontradas %',
        target_table,
        table_policy_count;
    end if;

    if not exists (
      select 1 from pg_catalog.pg_policies policy
      where policy.schemaname = 'public'
        and policy.tablename = target_table
        and policy.policyname = 'Authenticated staff can read ' || target_table
        and policy.cmd = 'SELECT'
        and policy.permissive = 'PERMISSIVE'
        and policy.roles = array['authenticated']::name[]
        and pg_catalog.regexp_replace(
          pg_catalog.lower(coalesce(policy.qual, '')), '[[:space:]()]', '', 'g'
        ) = 'true'
        and policy.with_check is null
    ) then
      raise exception 'Bloque 2.1b: drift en policy SELECT legacy de public.%', target_table;
    end if;

    if not exists (
      select 1 from pg_catalog.pg_policies policy
      where policy.schemaname = 'public'
        and policy.tablename = target_table
        and policy.policyname = 'Authenticated staff can insert ' || target_table
        and policy.cmd = 'INSERT'
        and policy.permissive = 'PERMISSIVE'
        and policy.roles = array['authenticated']::name[]
        and policy.qual is null
        and pg_catalog.regexp_replace(
          pg_catalog.lower(coalesce(policy.with_check, '')), '[[:space:]()]', '', 'g'
        ) = 'true'
    ) then
      raise exception 'Bloque 2.1b: drift en policy INSERT legacy de public.%', target_table;
    end if;

    if not exists (
      select 1 from pg_catalog.pg_policies policy
      where policy.schemaname = 'public'
        and policy.tablename = target_table
        and policy.policyname = 'Authenticated staff can update ' || target_table
        and policy.cmd = 'UPDATE'
        and policy.permissive = 'PERMISSIVE'
        and policy.roles = array['authenticated']::name[]
        and pg_catalog.regexp_replace(
          pg_catalog.lower(coalesce(policy.qual, '')), '[[:space:]()]', '', 'g'
        ) = 'true'
        and pg_catalog.regexp_replace(
          pg_catalog.lower(coalesce(policy.with_check, '')), '[[:space:]()]', '', 'g'
        ) = 'true'
    ) then
      raise exception 'Bloque 2.1b: drift en policy UPDATE legacy de public.%', target_table;
    end if;

    if not exists (
      select 1 from pg_catalog.pg_policies policy
      where policy.schemaname = 'public'
        and policy.tablename = target_table
        and policy.policyname = 'Authenticated staff can delete ' || target_table
        and policy.cmd = 'DELETE'
        and policy.permissive = 'PERMISSIVE'
        and policy.roles = array['authenticated']::name[]
        and pg_catalog.regexp_replace(
          pg_catalog.lower(coalesce(policy.qual, '')), '[[:space:]()]', '', 'g'
        ) = 'true'
        and policy.with_check is null
    ) then
      raise exception 'Bloque 2.1b: drift en policy DELETE legacy de public.%', target_table;
    end if;

    if not pg_catalog.has_table_privilege(
      'authenticated', pg_catalog.format('public.%I', target_table), 'SELECT'
    ) or not pg_catalog.has_table_privilege(
      'authenticated', pg_catalog.format('public.%I', target_table), 'INSERT'
    ) or not pg_catalog.has_table_privilege(
      'authenticated', pg_catalog.format('public.%I', target_table), 'UPDATE'
    ) or not pg_catalog.has_table_privilege(
      'authenticated', pg_catalog.format('public.%I', target_table), 'DELETE'
    ) then
      raise exception
        'Bloque 2.1b: faltan grants de tabla requeridos por STAFF en public.%',
        target_table;
    end if;
  end loop;

  ---------------------------------------------------------------------------
  -- PRECONDICIONES DE STORAGE. No se cambia public=true.
  ---------------------------------------------------------------------------
  if pg_catalog.to_regclass('storage.buckets') is null
     or pg_catalog.to_regclass('storage.objects') is null then
    raise exception 'Bloque 2.1b: faltan storage.buckets o storage.objects';
  end if;

  if not exists (
    select 1
    from storage.buckets bucket
    where bucket.id = 'jugadores'
      and bucket.name = 'jugadores'
      and bucket.public
  ) then
    raise exception
      'Bloque 2.1b: bucket jugadores ausente o public ya no coincide con true';
  end if;

  if not (
    select relation.relrowsecurity
    from pg_catalog.pg_class relation
    where relation.oid = 'storage.objects'::regclass
  ) then
    raise exception 'Bloque 2.1b: RLS no esta activo en storage.objects';
  end if;

  storage_policy_names := array[]::text[];
  foreach target_role in array array['anon', 'authenticated']
  loop
    foreach target_command in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE']
    loop
      select pg_catalog.count(*)::integer,
             min(policy.policyname)
      into policy_count, storage_policy_name
      from pg_catalog.pg_policies policy
      where policy.schemaname = 'storage'
        and policy.tablename = 'objects'
        and policy.cmd = target_command
        and policy.permissive = 'PERMISSIVE'
        and policy.roles = array[target_role]::name[]
        and (
          case target_command
            when 'SELECT' then
              pg_catalog.regexp_replace(
                pg_catalog.lower(coalesce(policy.qual, '')),
                '[[:space:]()]', '', 'g'
              ) = expected_storage_predicate
              and policy.with_check is null
            when 'INSERT' then
              policy.qual is null
              and pg_catalog.regexp_replace(
                pg_catalog.lower(coalesce(policy.with_check, '')),
                '[[:space:]()]', '', 'g'
              ) = expected_storage_predicate
            when 'UPDATE' then
              pg_catalog.regexp_replace(
                pg_catalog.lower(coalesce(policy.qual, '')),
                '[[:space:]()]', '', 'g'
              ) = expected_storage_predicate
              and pg_catalog.regexp_replace(
                pg_catalog.lower(coalesce(policy.with_check, '')),
                '[[:space:]()]', '', 'g'
              ) = expected_storage_predicate
            when 'DELETE' then
              pg_catalog.regexp_replace(
                pg_catalog.lower(coalesce(policy.qual, '')),
                '[[:space:]()]', '', 'g'
              ) = expected_storage_predicate
              and policy.with_check is null
          end
        );

      if policy_count <> 1 then
        raise exception
          'Bloque 2.1b: se esperaba una policy storage jugadores % %; encontradas %',
          target_role,
          target_command,
          policy_count;
      end if;

      storage_policy_names := pg_catalog.array_append(
        storage_policy_names,
        storage_policy_name
      );
    end loop;
  end loop;

  if pg_catalog.cardinality(storage_policy_names) <> 8
     or (
       select pg_catalog.count(distinct policy_name)
       from pg_catalog.unnest(storage_policy_names) names(policy_name)
     ) <> 8 then
    raise exception 'Bloque 2.1b: las 8 policies Storage esperadas no son univocas';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and (
        policy.roles && array['public', 'anon', 'authenticated']::name[]
      )
      and (
        pg_catalog.regexp_replace(
          pg_catalog.lower(coalesce(policy.qual, '')),
          '[[:space:]()]', '', 'g'
        ) = 'true'
        or pg_catalog.regexp_replace(
          pg_catalog.lower(coalesce(policy.with_check, '')),
          '[[:space:]()]', '', 'g'
        ) = 'true'
      )
  ) then
    raise exception
      'Bloque 2.1b: existe una policy Storage generica abierta a PUBLIC/anon/authenticated';
  end if;

  if not pg_catalog.has_table_privilege(
    'authenticated', 'storage.objects', 'SELECT'
  ) or not pg_catalog.has_table_privilege(
    'authenticated', 'storage.objects', 'INSERT'
  ) or not pg_catalog.has_table_privilege(
    'authenticated', 'storage.objects', 'UPDATE'
  ) or not pg_catalog.has_table_privilege(
    'authenticated', 'storage.objects', 'DELETE'
  ) then
    raise exception 'Bloque 2.1b: faltan grants Storage requeridos por STAFF';
  end if;

  ---------------------------------------------------------------------------
  -- PRECONDICIONES DE LAS 12 RPC MUTADORAS CONFIRMADAS.
  -- La huella es md5(prosrc con CRLF normalizado a LF).
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
    if function_oid is null then
      raise exception 'Bloque 2.1b: falta la RPC %', function_target.signature;
    end if;

    select
      function_row.prosrc,
      pg_catalog.pg_get_userbyid(function_row.proowner),
      language.lanname,
      function_row.prosecdef,
      pg_catalog.has_function_privilege(
        'authenticated', function_row.oid, 'EXECUTE'
      )
    into
      function_source,
      function_owner,
      function_language,
      function_security_definer,
      authenticated_execute
    from pg_catalog.pg_proc function_row
    join pg_catalog.pg_language language
      on language.oid = function_row.prolang
    where function_row.oid = function_oid;

    normalized_source_md5 := pg_catalog.md5(
      pg_catalog.replace(function_source, chr(13), '')
    );

    if function_owner <> 'postgres'
       or function_language <> 'plpgsql'
       or function_security_definer is distinct from function_target.expected_security_definer
       or normalized_source_md5 <> function_target.expected_source_md5
       or not authenticated_execute then
      raise exception using message = pg_catalog.format(
        'Bloque 2.1b: drift en %s (owner=%s language=%s definer=%s md5=%s auth_execute=%s)',
        function_target.signature,
        function_owner,
        function_language,
        function_security_definer,
        normalized_source_md5,
        authenticated_execute
      );
    end if;

    if pg_catalog.position('public.is_app_staff()' in function_source) > 0 then
      raise exception 'Bloque 2.1b: % ya contiene un guard STAFF no esperado', function_target.signature;
    end if;

    if (
      pg_catalog.length(function_source)
      - pg_catalog.length(pg_catalog.replace(function_source, E'\nbegin\n', ''))
    ) / pg_catalog.length(E'\nbegin\n') <> 1 then
      raise exception
        'Bloque 2.1b: no se encontro un unico BEGIN principal en %',
        function_target.signature;
    end if;
  end loop;

  ---------------------------------------------------------------------------
  -- APLICACION: PUBLIC.JUGADORES.
  ---------------------------------------------------------------------------
  raise notice 'Eliminando policy jugadores anon: %', anon_jugadores_policy;
  raise notice 'Eliminando policy jugadores authenticated: %', authenticated_jugadores_policy;
  execute pg_catalog.format(
    'drop policy %I on public.jugadores',
    anon_jugadores_policy
  );
  execute pg_catalog.format(
    'drop policy %I on public.jugadores',
    authenticated_jugadores_policy
  );

  execute $policy$
    create policy player_perimeter_staff_select
    on public.jugadores
    for select
    to authenticated
    using (public.is_app_staff())
  $policy$;
  execute $policy$
    create policy player_perimeter_staff_insert
    on public.jugadores
    for insert
    to authenticated
    with check (public.is_app_staff())
  $policy$;
  execute $policy$
    create policy player_perimeter_staff_update
    on public.jugadores
    for update
    to authenticated
    using (public.is_app_staff())
    with check (public.is_app_staff())
  $policy$;
  execute $policy$
    create policy player_perimeter_staff_delete
    on public.jugadores
    for delete
    to authenticated
    using (public.is_app_staff())
  $policy$;

  ---------------------------------------------------------------------------
  -- APLICACION: TABLAS GLOBALES.
  ---------------------------------------------------------------------------
  foreach target_table in array array[
    'players_database',
    'player_team_memberships',
    'player_positions',
    'player_sources',
    'player_scouting_traits',
    'legacy_own_player_migration'
  ]
  loop
    execute pg_catalog.format(
      'drop policy %I on public.%I',
      'Authenticated staff can read ' || target_table,
      target_table
    );
    execute pg_catalog.format(
      'drop policy %I on public.%I',
      'Authenticated staff can insert ' || target_table,
      target_table
    );
    execute pg_catalog.format(
      'drop policy %I on public.%I',
      'Authenticated staff can update ' || target_table,
      target_table
    );
    execute pg_catalog.format(
      'drop policy %I on public.%I',
      'Authenticated staff can delete ' || target_table,
      target_table
    );

    execute pg_catalog.format(
      'create policy player_perimeter_staff_select on public.%I for select to authenticated using (public.is_app_staff())',
      target_table
    );
    execute pg_catalog.format(
      'create policy player_perimeter_staff_insert on public.%I for insert to authenticated with check (public.is_app_staff())',
      target_table
    );
    execute pg_catalog.format(
      'create policy player_perimeter_staff_update on public.%I for update to authenticated using (public.is_app_staff()) with check (public.is_app_staff())',
      target_table
    );
    execute pg_catalog.format(
      'create policy player_perimeter_staff_delete on public.%I for delete to authenticated using (public.is_app_staff())',
      target_table
    );
  end loop;

  ---------------------------------------------------------------------------
  -- APLICACION: STORAGE JUGADORES.
  ---------------------------------------------------------------------------
  foreach storage_policy_name in array storage_policy_names
  loop
    raise notice 'Eliminando policy storage jugadores: %', storage_policy_name;
    execute pg_catalog.format(
      'drop policy %I on storage.objects',
      storage_policy_name
    );
  end loop;

  execute $policy$
    create policy player_assets_staff_select
    on storage.objects
    for select
    to authenticated
    using (
      bucket_id = 'jugadores'
      and public.is_app_staff()
    )
  $policy$;
  execute $policy$
    create policy player_assets_staff_insert
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'jugadores'
      and public.is_app_staff()
    )
  $policy$;
  execute $policy$
    create policy player_assets_staff_update
    on storage.objects
    for update
    to authenticated
    using (
      bucket_id = 'jugadores'
      and public.is_app_staff()
    )
    with check (
      bucket_id = 'jugadores'
      and public.is_app_staff()
    )
  $policy$;
  execute $policy$
    create policy player_assets_staff_delete
    on storage.objects
    for delete
    to authenticated
    using (
      bucket_id = 'jugadores'
      and public.is_app_staff()
    )
  $policy$;

  ---------------------------------------------------------------------------
  -- APLICACION: GUARD STAFF + ACL DE RPC MUTADORAS.
  -- pg_get_functiondef conserva firma, retorno, SECURITY MODE y search_path.
  ---------------------------------------------------------------------------
  for function_target in
    select *
    from (values
      ('public.set_player_availability(uuid,text,integer)'),
      ('public.consume_player_suspensions_for_match(uuid)'),
      ('public.apply_rival_tactical_placements(uuid,jsonb)'),
      ('public.assign_global_player_to_team(uuid,uuid,text,text,date)'),
      ('public.create_own_player_atomic(uuid,jsonb,jsonb,jsonb,jsonb)'),
      ('public.merge_global_player_profiles(uuid,uuid)'),
      ('public.remove_global_player_from_current_team(uuid,date)'),
      ('public.remove_rival_player_from_team_atomic(uuid,uuid,uuid,text)'),
      ('public.save_global_player_profile(jsonb,jsonb,jsonb,jsonb,jsonb)'),
      ('public.save_match_squad_lineup_atomic(uuid,text,jsonb,jsonb)'),
      ('public.save_own_captain_priorities(uuid[])'),
      ('public.save_rival_lineup_atomic(uuid,text,jsonb,jsonb,jsonb,jsonb)')
    ) targets(signature)
  loop
    function_oid := pg_catalog.to_regprocedure(function_target.signature);
    function_definition := pg_catalog.pg_get_functiondef(function_oid);
    guarded_definition := pg_catalog.replace(
      function_definition,
      E'\nbegin\n',
      E'\nbegin\n' || staff_guard
    );

    if guarded_definition = function_definition then
      raise exception
        'Bloque 2.1b: no se pudo insertar el guard en %',
        function_target.signature;
    end if;

    execute guarded_definition;
    execute pg_catalog.format(
      'revoke all on function %s from public, anon',
      function_target.signature
    );
    execute pg_catalog.format(
      'grant execute on function %s to authenticated, service_role',
      function_target.signature
    );
  end loop;
end;
$migration$;

-----------------------------------------------------------------------------
-- POSTCONDICIONES. Cualquier fallo revierte todos los cambios anteriores.
-----------------------------------------------------------------------------
do $postconditions$
declare
  target_table text;
  function_target record;
  function_oid oid;
  function_source text;
  function_owner oid;
  policy_count integer;
  normalized_source_md5 text;
  staff_guard constant text := E'  if coalesce(auth.role(), '''') <> ''service_role''\n'
    || E'     and session_user <> ''service_role''\n'
    || E'     and not public.is_app_staff() then\n'
    || E'    raise exception using\n'
    || E'      errcode = ''42501'',\n'
    || E'      message = ''STAFF_ONLY'';\n'
    || E'  end if;\n\n';
begin
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

    if policy_count <> 4 then
      raise exception
        'Bloque 2.1b postcondicion: policies STAFF incompletas en public.%',
        target_table;
    end if;

    if (
      select pg_catalog.count(*)
      from pg_catalog.pg_policies policy
      where policy.schemaname = 'public'
        and policy.tablename = target_table
    ) <> 4 then
      raise exception
        'Bloque 2.1b postcondicion: quedan policies adicionales en public.%',
        target_table;
    end if;

    if exists (
      select 1
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
        )
    ) then
      raise exception
        'Bloque 2.1b postcondicion: queda USING(true)/WITH CHECK(true) en public.%',
        target_table;
    end if;

    if not pg_catalog.has_table_privilege(
      'service_role', pg_catalog.format('public.%I', target_table), 'SELECT'
    ) or not pg_catalog.has_table_privilege(
      'service_role', pg_catalog.format('public.%I', target_table), 'INSERT'
    ) or not pg_catalog.has_table_privilege(
      'service_role', pg_catalog.format('public.%I', target_table), 'UPDATE'
    ) or not pg_catalog.has_table_privilege(
      'service_role', pg_catalog.format('public.%I', target_table), 'DELETE'
    ) then
      raise exception
        'Bloque 2.1b postcondicion: service_role perdio privilegios en public.%',
        target_table;
    end if;
  end loop;

  if not exists (
    select 1 from storage.buckets bucket
    where bucket.id = 'jugadores' and bucket.public
  ) then
    raise exception 'Bloque 2.1b postcondicion: bucket jugadores dejo de ser publico';
  end if;

  if (
    select pg_catalog.count(*)
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
      ) like '%is_app_staff%'
  ) <> 4 then
    raise exception 'Bloque 2.1b postcondicion: policies STAFF Storage incompletas';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.roles && array['public', 'anon']::name[]
      and pg_catalog.lower(
        coalesce(policy.qual, '') || ' ' || coalesce(policy.with_check, '')
      ) like '%jugadores%'
  ) then
    raise exception 'Bloque 2.1b postcondicion: queda policy PUBLIC/anon para bucket jugadores';
  end if;

  if not pg_catalog.has_table_privilege('service_role', 'storage.objects', 'SELECT')
     or not pg_catalog.has_table_privilege('service_role', 'storage.objects', 'INSERT')
     or not pg_catalog.has_table_privilege('service_role', 'storage.objects', 'UPDATE')
     or not pg_catalog.has_table_privilege('service_role', 'storage.objects', 'DELETE') then
    raise exception 'Bloque 2.1b postcondicion: service_role perdio Storage';
  end if;

  for function_target in
    select *
    from (values
      ('public.set_player_availability(uuid,text,integer)', '466c8d47470aaa5acee20cf44fa7d502'),
      ('public.consume_player_suspensions_for_match(uuid)', '3b02b9eb3bbe11a3a21bfe06cb783e1c'),
      ('public.apply_rival_tactical_placements(uuid,jsonb)', 'be25e6a1de65150ee8a911eb7a11ccd7'),
      ('public.assign_global_player_to_team(uuid,uuid,text,text,date)', '3442decaf92c00c43c430fe12078dde7'),
      ('public.create_own_player_atomic(uuid,jsonb,jsonb,jsonb,jsonb)', '45dfc24ec82df4b8cf3987e7e41fffa2'),
      ('public.merge_global_player_profiles(uuid,uuid)', '5c5121dbebf1c75b2ec013693c2e5a2e'),
      ('public.remove_global_player_from_current_team(uuid,date)', '0cd47394f23797cdefa3578eb84e2be9'),
      ('public.remove_rival_player_from_team_atomic(uuid,uuid,uuid,text)', '665350c6a1dbcfc6eed4b8f12b0799f6'),
      ('public.save_global_player_profile(jsonb,jsonb,jsonb,jsonb,jsonb)', 'b4a1b3987f20e7eb3cd8695b40341634'),
      ('public.save_match_squad_lineup_atomic(uuid,text,jsonb,jsonb)', '9a61cf69d600145dbbe9e6fab3e1ccb1'),
      ('public.save_own_captain_priorities(uuid[])', 'ea72384385e286c5df3f71666d3d2581'),
      ('public.save_rival_lineup_atomic(uuid,text,jsonb,jsonb,jsonb,jsonb)', 'a103846f1c9da2cf5effc6836f80e742')
    ) targets(signature, expected_source_md5)
  loop
    function_oid := pg_catalog.to_regprocedure(function_target.signature);
    select function_row.prosrc, function_row.proowner
    into function_source, function_owner
    from pg_catalog.pg_proc function_row
    where function_row.oid = function_oid;

    if pg_catalog.position(staff_guard in function_source) = 0 then
      raise exception
        'Bloque 2.1b postcondicion: falta guard STAFF en %',
        function_target.signature;
    end if;

    normalized_source_md5 := pg_catalog.md5(
      pg_catalog.replace(
        pg_catalog.replace(function_source, staff_guard, ''),
        chr(13),
        ''
      )
    );

    if normalized_source_md5 <> function_target.expected_source_md5 then
      raise exception
        'Bloque 2.1b postcondicion: cambio logico no autorizado en %',
        function_target.signature;
    end if;

    if pg_catalog.has_function_privilege(
      'anon', function_oid, 'EXECUTE'
    ) or exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(
          (select function_row.proacl from pg_catalog.pg_proc function_row where function_row.oid = function_oid),
          pg_catalog.acldefault('f', function_owner)
        )
      ) acl
      where acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ) or not pg_catalog.has_function_privilege(
      'authenticated', function_oid, 'EXECUTE'
    ) or not pg_catalog.has_function_privilege(
      'service_role', function_oid, 'EXECUTE'
    ) then
      raise exception
        'Bloque 2.1b postcondicion: ACL incorrecta en %',
        function_target.signature;
    end if;

    if exists (
      select 1
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
        )
    ) then
      raise exception
        'Bloque 2.1b postcondicion: EXECUTE adicional no previsto en %',
        function_target.signature;
    end if;
  end loop;
end;
$postconditions$;

commit;
