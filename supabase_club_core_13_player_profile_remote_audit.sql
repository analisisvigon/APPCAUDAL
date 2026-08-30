-- BLOQUE 2.1a - Auditoria remota READ ONLY de jugadores, RPC y Storage.
--
-- Ejecutar el archivo COMPLETO en Supabase SQL Editor.
-- Devuelve UN UNICO result set al final y termina en ROLLBACK.
--
-- Garantias de este artefacto:
--   * la transaccion se declara READ ONLY;
--   * no contiene INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, GRANT ni REVOKE;
--   * no invoca ninguna RPC de negocio o mutadora;
--   * SET LOCAL ROLE y claims JWT solo simulan identidades durante la transaccion;
--   * los resultados se acumulan en memoria/configuracion local, no en tablas.

begin;
set transaction read only;
set local statement_timeout = '120s';
set local lock_timeout = '5s';
set local row_security = on;

do $audit$
declare
  audit_results jsonb := '[]'::jsonb;
  audit_order integer := 0;
  item record;
  scenario record;
  target_column text;
  target_table text;
  target_role text;
  relation_oid oid;
  relation_owner oid;
  relation_acl aclitem[];
  relation_owner_name text;
  rls_enabled boolean;
  force_rls boolean;
  public_select boolean;
  public_insert boolean;
  public_update boolean;
  public_delete boolean;
  role_select boolean;
  role_insert boolean;
  role_update boolean;
  role_delete boolean;
  visible_count bigint;
  visible_ids jsonb;
  own_visible boolean;
  other_visible boolean;
  sample_row jsonb;
  non_null_count bigint;
  error_state text;
  error_message text;
  function_definition text;
  function_mutates boolean;
  function_staff_guard boolean;
  function_player_guard boolean;
  function_public_execute boolean;
  function_authenticated_execute boolean;
  function_classification text;
  function_risk text;
  function_ok boolean;
  bucket_exists boolean;
  bucket_public boolean;
  bucket_id text;
  bucket_name text;
  bucket_file_size_limit bigint;
  bucket_allowed_mime_types text[];
  normalized_using text;
  normalized_check text;
  policy_open boolean;
  role_clause text;
begin
  ---------------------------------------------------------------------------
  -- 1. PUBLIC.JUGADORES: relacion, columnas, constraints, indices, triggers.
  ---------------------------------------------------------------------------
  select
    relation.oid,
    relation.relowner,
    relation.relacl,
    pg_catalog.pg_get_userbyid(relation.relowner),
    relation.relrowsecurity,
    relation.relforcerowsecurity
  into
    relation_oid,
    relation_owner,
    relation_acl,
    relation_owner_name,
    rls_enabled,
    force_rls
  from pg_catalog.pg_class relation
  join pg_catalog.pg_namespace namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = 'jugadores'
    and relation.relkind in ('r', 'p');

  audit_order := audit_order + 1;
  audit_results := audit_results || pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'test_order', audit_order,
      'category', 'JUGADORES_TABLE',
      'test_name', 'public.jugadores relation contract',
      'expected_or_question', 'Existe; inspeccionar owner, RLS y FORCE RLS',
      'observed', case
        when relation_oid is null then pg_catalog.jsonb_build_object('exists', false)
        else pg_catalog.jsonb_build_object(
          'exists', true,
          'oid', relation_oid,
          'owner', relation_owner_name,
          'rls_enabled', rls_enabled,
          'force_rls', force_rls,
          'raw_acl', coalesce(relation_acl::text, 'NULL')
        )
      end,
      'risk_level', case
        when relation_oid is null then 'CRITICAL'
        when not rls_enabled then 'CRITICAL'
        else 'INFO'
      end,
      'test_ok', case
        when relation_oid is null then false
        else rls_enabled
      end,
      'details', 'FORCE RLS se informa, pero no se exige automaticamente porque el acceso API usa roles no propietarios.'
    )
  );

  if relation_oid is not null then
    for item in
      select
        attribute.attnum as ordinal_position,
        attribute.attname as column_name,
        pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) as data_type,
        not attribute.attnotnull as nullable,
        pg_catalog.pg_get_expr(attribute_default.adbin, attribute_default.adrelid) as column_default,
        attribute.attidentity as identity_kind,
        attribute.attgenerated as generated_kind
      from pg_catalog.pg_attribute attribute
      left join pg_catalog.pg_attrdef attribute_default
        on attribute_default.adrelid = attribute.attrelid
       and attribute_default.adnum = attribute.attnum
      where attribute.attrelid = relation_oid
        and attribute.attnum > 0
        and not attribute.attisdropped
      order by attribute.attnum
    loop
      audit_order := audit_order + 1;
      audit_results := audit_results || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'test_order', audit_order,
          'category', 'JUGADORES_COLUMN',
          'test_name', item.column_name,
          'expected_or_question', 'Inventario remoto real de columnas',
          'observed', pg_catalog.jsonb_build_object(
            'position', item.ordinal_position,
            'type', item.data_type,
            'nullable', item.nullable,
            'default', item.column_default,
            'identity', nullif(item.identity_kind, ''),
            'generated', nullif(item.generated_kind, '')
          ),
          'risk_level', 'INFO',
          'test_ok', null,
          'details', 'Fila descriptiva; no presupone el contrato futuro de get_my_player_profile().'
        )
      );
    end loop;

    for item in
      select
        constraint_row.conname as constraint_name,
        constraint_row.contype as constraint_type,
        pg_catalog.pg_get_constraintdef(constraint_row.oid, true) as definition,
        constraint_row.condeferrable as deferrable,
        constraint_row.condeferred as initially_deferred,
        constraint_row.convalidated as validated
      from pg_catalog.pg_constraint constraint_row
      where constraint_row.conrelid = relation_oid
      order by constraint_row.contype, constraint_row.conname
    loop
      audit_order := audit_order + 1;
      audit_results := audit_results || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'test_order', audit_order,
          'category', 'JUGADORES_CONSTRAINT',
          'test_name', item.constraint_name,
          'expected_or_question', 'PK, FK, UNIQUE y CHECK remotos',
          'observed', pg_catalog.jsonb_build_object(
            'type', item.constraint_type,
            'definition', item.definition,
            'deferrable', item.deferrable,
            'initially_deferred', item.initially_deferred,
            'validated', item.validated
          ),
          'risk_level', 'INFO',
          'test_ok', null,
          'details', null
        )
      );
    end loop;

    for item in
      select
        index_row.indexrelid::regclass::text as index_name,
        index_row.indisprimary as is_primary,
        index_row.indisunique as is_unique,
        index_row.indisvalid as is_valid,
        index_row.indisready as is_ready,
        pg_catalog.pg_get_indexdef(index_row.indexrelid) as definition
      from pg_catalog.pg_index index_row
      where index_row.indrelid = relation_oid
      order by index_row.indisprimary desc, index_row.indexrelid::regclass::text
    loop
      audit_order := audit_order + 1;
      audit_results := audit_results || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'test_order', audit_order,
          'category', 'JUGADORES_INDEX',
          'test_name', item.index_name,
          'expected_or_question', 'Inventario remoto de indices',
          'observed', pg_catalog.jsonb_build_object(
            'primary', item.is_primary,
            'unique', item.is_unique,
            'valid', item.is_valid,
            'ready', item.is_ready,
            'definition', item.definition
          ),
          'risk_level', 'INFO',
          'test_ok', null,
          'details', null
        )
      );
    end loop;

    for item in
      select
        trigger_row.tgname as trigger_name,
        trigger_row.tgenabled as enabled_mode,
        pg_catalog.pg_get_triggerdef(trigger_row.oid, true) as definition,
        trigger_row.tgfoid::regprocedure::text as function_signature
      from pg_catalog.pg_trigger trigger_row
      where trigger_row.tgrelid = relation_oid
        and not trigger_row.tgisinternal
      order by trigger_row.tgname
    loop
      audit_order := audit_order + 1;
      audit_results := audit_results || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'test_order', audit_order,
          'category', 'JUGADORES_TRIGGER',
          'test_name', item.trigger_name,
          'expected_or_question', 'Inventario y definicion de triggers no internos',
          'observed', pg_catalog.jsonb_build_object(
            'enabled_mode', item.enabled_mode,
            'function', item.function_signature,
            'definition', item.definition
          ),
          'risk_level', case when item.enabled_mode = 'D' then 'MEDIUM' else 'INFO' end,
          'test_ok', item.enabled_mode <> 'D',
          'details', null
        )
      );
    end loop;

    -------------------------------------------------------------------------
    -- Policies de jugadores.
    -------------------------------------------------------------------------
    for item in
      select
        policy.policyname,
        policy.cmd,
        policy.roles,
        policy.permissive,
        policy.qual,
        policy.with_check
      from pg_catalog.pg_policies policy
      where policy.schemaname = 'public'
        and policy.tablename = 'jugadores'
      order by policy.policyname
    loop
      normalized_using := pg_catalog.regexp_replace(
        pg_catalog.lower(coalesce(item.qual, '')),
        '[[:space:]()]', '', 'g'
      );
      normalized_check := pg_catalog.regexp_replace(
        pg_catalog.lower(coalesce(item.with_check, '')),
        '[[:space:]()]', '', 'g'
      );
      role_clause := pg_catalog.lower(pg_catalog.array_to_string(item.roles, ','));
      policy_open := normalized_using = 'true' or normalized_check = 'true';

      audit_order := audit_order + 1;
      audit_results := audit_results || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'test_order', audit_order,
          'category', 'JUGADORES_POLICY',
          'test_name', item.policyname,
          'expected_or_question', 'No debe abrir toda la tabla a PLAYER/anon/PUBLIC',
          'observed', pg_catalog.jsonb_build_object(
            'command', item.cmd,
            'roles', item.roles,
            'mode', item.permissive,
            'using', item.qual,
            'with_check', item.with_check,
            'using_true', normalized_using = 'true',
            'with_check_true', normalized_check = 'true'
          ),
          'risk_level', case
            when policy_open and (
              role_clause like '%authenticated%'
              or role_clause like '%anon%'
              or role_clause like '%public%'
            ) then 'CRITICAL'
            when role_clause like '%anon%' or role_clause like '%public%' then 'HIGH'
            else 'INFO'
          end,
          'test_ok', case
            when policy_open and (
              role_clause like '%authenticated%'
              or role_clause like '%anon%'
              or role_clause like '%public%'
            ) then false
            when role_clause like '%anon%' or role_clause like '%public%' then false
            else null
          end,
          'details', 'Las policies permisivas se combinan por OR; la simulacion funcional determina las filas realmente visibles.'
        )
      );
    end loop;

    if not exists (
      select 1
      from pg_catalog.pg_policies policy
      where policy.schemaname = 'public'
        and policy.tablename = 'jugadores'
    ) then
      audit_order := audit_order + 1;
      audit_results := audit_results || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'test_order', audit_order,
          'category', 'JUGADORES_POLICY',
          'test_name', 'NO_POLICIES',
          'expected_or_question', 'Determinar si la ausencia de policies bloquea o si RLS esta desactivado',
          'observed', 'No existen policies remotas en public.jugadores',
          'risk_level', case when rls_enabled then 'INFO' else 'CRITICAL' end,
          'test_ok', rls_enabled,
          'details', case
            when rls_enabled then 'RLS activo sin policies aplica denegacion por defecto a roles no propietarios.'
            else 'Sin RLS, los grants de tabla deciden el acceso completo.'
          end
        )
      );
    end if;

    -------------------------------------------------------------------------
    -- Grants y privilegios efectivos de jugadores.
    -------------------------------------------------------------------------
    select
      coalesce(pg_catalog.bool_or(acl.grantee = 0 and acl.privilege_type = 'SELECT'), false),
      coalesce(pg_catalog.bool_or(acl.grantee = 0 and acl.privilege_type = 'INSERT'), false),
      coalesce(pg_catalog.bool_or(acl.grantee = 0 and acl.privilege_type = 'UPDATE'), false),
      coalesce(pg_catalog.bool_or(acl.grantee = 0 and acl.privilege_type = 'DELETE'), false)
    into public_select, public_insert, public_update, public_delete
    from pg_catalog.aclexplode(
      coalesce(relation_acl, pg_catalog.acldefault('r', relation_owner))
    ) acl;

    for target_role in
      select role_name
      from (values ('PUBLIC'), ('anon'), ('authenticated'), ('service_role')) roles(role_name)
    loop
      if target_role = 'PUBLIC' then
        role_select := public_select;
        role_insert := public_insert;
        role_update := public_update;
        role_delete := public_delete;
      else
        role_select := pg_catalog.has_table_privilege(target_role, relation_oid, 'SELECT');
        role_insert := pg_catalog.has_table_privilege(target_role, relation_oid, 'INSERT');
        role_update := pg_catalog.has_table_privilege(target_role, relation_oid, 'UPDATE');
        role_delete := pg_catalog.has_table_privilege(target_role, relation_oid, 'DELETE');
      end if;

      audit_order := audit_order + 1;
      audit_results := audit_results || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'test_order', audit_order,
          'category', 'JUGADORES_GRANT',
          'test_name', target_role,
          'expected_or_question', case
            when target_role in ('PUBLIC', 'anon') then 'Sin privilegios efectivos'
            else 'Informar privilegios; RLS sigue siendo obligatorio para authenticated'
          end,
          'observed', pg_catalog.jsonb_build_object(
            'select', role_select,
            'insert', role_insert,
            'update', role_update,
            'delete', role_delete
          ),
          'risk_level', case
            when target_role in ('PUBLIC', 'anon')
             and (role_select or role_insert or role_update or role_delete) then 'CRITICAL'
            else 'INFO'
          end,
          'test_ok', case
            when target_role in ('PUBLIC', 'anon')
              then not (role_select or role_insert or role_update or role_delete)
            else null
          end,
          'details', case
            when target_role = 'PUBLIC' then 'Calculado expandiendo la ACL efectiva, incluida la ACL por defecto.'
            else 'has_table_privilege incluye privilegios efectivos por memberships de rol.'
          end
        )
      );
    end loop;
  end if;

  ---------------------------------------------------------------------------
  -- 2. Simulaciones JWT READ ONLY sobre public.jugadores.
  ---------------------------------------------------------------------------
  for scenario in
    select *
    from (values
      ('BORJA_PLAYER', 'authenticated', '350615a9-b068-450a-b867-da30a59b9082'),
      ('STAFF', 'authenticated', 'e0933d02-76c7-4e71-9765-896593e1ae80'),
      ('UID_WITHOUT_MEMBERSHIP', 'authenticated', '00000000-0000-4000-8000-000000000099'),
      ('ANON', 'anon', null)
    ) scenarios(scenario_name, database_role, user_id)
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

    visible_count := null;
    error_state := null;
    error_message := null;
    begin
      execute pg_catalog.format('set local role %I', scenario.database_role);
      execute 'select pg_catalog.count(*)::bigint from public.jugadores'
        into visible_count;
      execute 'reset role';
    exception when others then
      get stacked diagnostics
        error_state = returned_sqlstate,
        error_message = message_text;
      begin execute 'reset role'; exception when others then null; end;
    end;

    audit_order := audit_order + 1;
    audit_results := audit_results || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'test_order', audit_order,
        'category', 'JUGADORES_SIMULATION',
        'test_name', scenario.scenario_name || ' visible row count',
        'expected_or_question', case
          when scenario.scenario_name = 'STAFF' then 'STAFF ve la plantilla actual (>0 filas)'
          else 'Acceso directo PLAYER/sin membership/anon: 0 filas o permiso denegado'
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
          when scenario.scenario_name = 'STAFF' and error_state is not null then 'HIGH'
          when scenario.scenario_name = 'STAFF' and coalesce(visible_count, 0) = 0 then 'HIGH'
          when scenario.scenario_name <> 'STAFF' and error_state is null and visible_count > 0 then 'CRITICAL'
          else 'INFO'
        end,
        'test_ok', case
          when scenario.scenario_name = 'STAFF'
            then error_state is null and coalesce(visible_count, 0) > 0
          else error_state is not null or coalesce(visible_count, 0) = 0
        end,
        'details', 'Consulta real ejecutada bajo SET LOCAL ROLE y claims JWT; no se escriben datos.'
      )
    );

    if scenario.scenario_name = 'BORJA_PLAYER' then
      visible_ids := null;
      own_visible := null;
      other_visible := null;
      error_state := null;
      error_message := null;
      begin
        execute 'set local role authenticated';
        execute $sql$
          select
            coalesce(pg_catalog.jsonb_agg(player.id order by player.id), '[]'::jsonb),
            pg_catalog.bool_or(player.id = '2e0146e9-e9fc-45ad-b055-edc138a85f7e'::uuid),
            pg_catalog.bool_or(player.id = 'f7f5aaeb-e82b-4e6b-8920-694bc32cb6c7'::uuid)
          from public.jugadores player
        $sql$
        into visible_ids, own_visible, other_visible;
        execute 'reset role';
      exception when others then
        get stacked diagnostics
          error_state = returned_sqlstate,
          error_message = message_text;
        begin execute 'reset role'; exception when others then null; end;
      end;

      audit_order := audit_order + 1;
      audit_results := audit_results || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'test_order', audit_order,
          'category', 'JUGADORES_SIMULATION',
          'test_name', 'BORJA_PLAYER visible IDs and cross-player isolation',
          'expected_or_question', 'Acceso directo bloqueado; Borja no ve su fila ni la de Jairo antes de una RPC segura',
          'observed', case
            when error_state is not null then pg_catalog.jsonb_build_object(
              'status', 'DENIED_OR_ERROR',
              'sqlstate', error_state,
              'message', error_message
            )
            else pg_catalog.jsonb_build_object(
              'visible_ids', visible_ids,
              'borja_visible', coalesce(own_visible, false),
              'jairo_visible', coalesce(other_visible, false)
            )
          end,
          'risk_level', case
            when error_state is null and coalesce(other_visible, false) then 'CRITICAL'
            when error_state is null and coalesce(own_visible, false) then 'HIGH'
            else 'INFO'
          end,
          'test_ok', error_state is not null
            or (
              not coalesce(own_visible, false)
              and not coalesce(other_visible, false)
            ),
          'details', 'Los UUID solo son fixtures de auditoria; no se usan para autorizacion.'
        )
      );

      sample_row := null;
      error_state := null;
      error_message := null;
      begin
        execute 'set local role authenticated';
        execute 'select pg_catalog.to_jsonb(player) from public.jugadores player limit 1'
          into sample_row;
        execute 'reset role';
      exception when others then
        get stacked diagnostics
          error_state = returned_sqlstate,
          error_message = message_text;
        begin execute 'reset role'; exception when others then null; end;
      end;

      audit_order := audit_order + 1;
      audit_results := audit_results || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'test_order', audit_order,
          'category', 'JUGADORES_SIMULATION',
          'test_name', 'BORJA_PLAYER SELECT * capability',
          'expected_or_question', 'SELECT * no devuelve ninguna fila o es denegado',
          'observed', case
            when error_state is not null then pg_catalog.jsonb_build_object(
              'status', 'DENIED_OR_ERROR',
              'sqlstate', error_state,
              'message', error_message
            )
            else pg_catalog.jsonb_build_object(
              'status', 'QUERY_SUCCEEDED',
              'returned_a_row', sample_row is not null,
              'returned_column_names', case
                when sample_row is null then '[]'::jsonb
                else (
                  select coalesce(pg_catalog.jsonb_agg(key order by key), '[]'::jsonb)
                  from pg_catalog.jsonb_object_keys(sample_row) keys(key)
                )
              end
            )
          end,
          'risk_level', case
            when error_state is null and sample_row is not null then 'CRITICAL'
            else 'INFO'
          end,
          'test_ok', error_state is not null or sample_row is null,
          'details', 'No se vuelcan valores de la fila; solo se informa si existe y los nombres de columnas expuestos.'
        )
      );

      for target_column in
        select column_name
        from (values
          ('google_forms_name'),
          ('global_player_id'),
          ('membership_id'),
          ('availability_status'),
          ('suspension_matches_remaining')
        ) columns(column_name)
      loop
        if exists (
          select 1
          from pg_catalog.pg_attribute attribute
          where attribute.attrelid = relation_oid
            and attribute.attname = target_column
            and attribute.attnum > 0
            and not attribute.attisdropped
        ) then
          non_null_count := null;
          error_state := null;
          error_message := null;
          begin
            execute 'set local role authenticated';
            execute pg_catalog.format(
              'select pg_catalog.count(%I)::bigint from public.jugadores',
              target_column
            ) into non_null_count;
            execute 'reset role';
          exception when others then
            get stacked diagnostics
              error_state = returned_sqlstate,
              error_message = message_text;
            begin execute 'reset role'; exception when others then null; end;
          end;

          audit_order := audit_order + 1;
          audit_results := audit_results || pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
              'test_order', audit_order,
              'category', 'JUGADORES_TECHNICAL_COLUMN_SIMULATION',
              'test_name', 'BORJA_PLAYER selects ' || target_column,
              'expected_or_question', 'Columna tecnica no devuelve datos a PLAYER mediante acceso directo',
              'observed', case
                when error_state is not null then pg_catalog.jsonb_build_object(
                  'status', 'DENIED_OR_ERROR',
                  'sqlstate', error_state,
                  'message', error_message
                )
                else pg_catalog.jsonb_build_object(
                  'status', 'QUERY_SUCCEEDED',
                  'visible_non_null_values', non_null_count
                )
              end,
              'risk_level', case
                when error_state is null and non_null_count > 0 then 'CRITICAL'
                else 'INFO'
              end,
              'test_ok', error_state is not null or coalesce(non_null_count, 0) = 0,
              'details', 'La consulta COUNT(columna) fuerza la comprobacion del privilegio de columna sin mostrar su contenido.'
            )
          );
        else
          audit_order := audit_order + 1;
          audit_results := audit_results || pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
              'test_order', audit_order,
              'category', 'JUGADORES_TECHNICAL_COLUMN_SIMULATION',
              'test_name', 'BORJA_PLAYER selects ' || target_column,
              'expected_or_question', 'Comprobar solo si la columna existe remotamente',
              'observed', 'COLUMN_NOT_PRESENT',
              'risk_level', 'INFO',
              'test_ok', null,
              'details', null
            )
          );
        end if;
      end loop;
    end if;
  end loop;

  ---------------------------------------------------------------------------
  -- 3. Funciones/RPC relacionadas con jugadores y modelo global.
  ---------------------------------------------------------------------------
  for item in
    with function_catalog as (
      select
        function_row.oid,
        namespace.nspname as schema_name,
        function_row.proname as function_name,
        function_row.proowner,
        function_row.proacl,
        function_row.prosecdef,
        function_row.provolatile,
        function_row.proconfig,
        function_row.prorettype,
        function_row.prokind,
        pg_catalog.pg_get_function_identity_arguments(function_row.oid) as identity_arguments,
        pg_catalog.pg_get_function_result(function_row.oid) as result_type,
        pg_catalog.pg_get_functiondef(function_row.oid) as definition
      from pg_catalog.pg_proc function_row
      join pg_catalog.pg_namespace namespace
        on namespace.oid = function_row.pronamespace
      where namespace.nspname = 'public'
        and function_row.prokind in ('f', 'p')
    )
    select *
    from function_catalog
    where pg_catalog.lower(definition) ~ '\mjugadores\M'
       or pg_catalog.lower(definition) like '%players_database%'
       or pg_catalog.lower(definition) like '%player_team_memberships%'
       or pg_catalog.lower(definition) like '%legacy_own_player_migration%'
       or function_name in (
         'set_player_availability',
         'consume_player_suspensions_for_match',
         'create_own_player_atomic',
         'save_global_player_profile',
         'assign_global_player_to_team',
         'remove_global_player_from_current_team',
         'merge_global_player_profiles',
         'sync_global_player_shirt_name_to_legacy',
         'project_global_player_shirt_name_on_legacy_insert'
       )
    order by function_name, identity_arguments
  loop
    function_definition := item.definition;
    function_mutates := pg_catalog.lower(function_definition)
      ~ '\m(insert|update|delete|merge|truncate)\M';
    function_staff_guard := pg_catalog.lower(function_definition)
      ~ '(is_app_staff|can_manage_club|can_edit_club_data|has_club_role)[[:space:]]*\(';
    function_player_guard := pg_catalog.lower(function_definition)
      ~ 'is_player[[:space:]]*\('
      and pg_catalog.lower(function_definition)
      ~ 'current_jugador_id[[:space:]]*\(';

    select coalesce(pg_catalog.bool_or(
      acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
    ), false)
    into function_public_execute
    from pg_catalog.aclexplode(
      coalesce(item.proacl, pg_catalog.acldefault('f', item.proowner))
    ) acl;

    function_authenticated_execute := pg_catalog.has_function_privilege(
      'authenticated', item.oid, 'EXECUTE'
    );

    if item.result_type = 'trigger' then
      function_classification := 'NEEDS_REVIEW';
      function_risk := 'INFO';
      function_ok := null;
    elsif function_mutates
      and function_authenticated_execute
      and not function_staff_guard then
      function_classification := 'STAFF_ONLY_BUT_EXPOSED';
      function_risk := case
        when item.function_name in (
          'set_player_availability',
          'consume_player_suspensions_for_match'
        ) then 'CRITICAL'
        else 'HIGH'
      end;
      function_ok := false;
    elsif function_mutates
      and (not function_authenticated_execute or function_staff_guard) then
      function_classification := 'STAFF_ONLY_PROTECTED';
      function_risk := 'INFO';
      function_ok := true;
    elsif not function_mutates and function_player_guard then
      function_classification := 'SAFE_FOR_PLAYER';
      function_risk := 'INFO';
      function_ok := true;
    else
      function_classification := 'NEEDS_REVIEW';
      function_risk := case
        when function_public_execute or function_authenticated_execute then 'MEDIUM'
        else 'INFO'
      end;
      function_ok := null;
    end if;

    audit_order := audit_order + 1;
    audit_results := audit_results || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'test_order', audit_order,
        'category', 'PLAYER_RELATED_FUNCTION',
        'test_name', pg_catalog.format(
          '%I.%I(%s)',
          item.schema_name,
          item.function_name,
          item.identity_arguments
        ),
        'expected_or_question', 'Clasificar seguridad y exposicion PLAYER sin ejecutar la funcion',
        'observed', function_classification,
        'risk_level', function_risk,
        'test_ok', function_ok,
        'details', pg_catalog.jsonb_build_object(
          'owner', pg_catalog.pg_get_userbyid(item.proowner),
          'security_mode', case when item.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end,
          'volatility', case item.provolatile when 'i' then 'IMMUTABLE' when 's' then 'STABLE' else 'VOLATILE' end,
          'result_type', item.result_type,
          'search_path_or_config', coalesce(item.proconfig, array[]::text[]),
          'raw_acl', coalesce(item.proacl::text, 'NULL (PostgreSQL function default applies)'),
          'public_execute', function_public_execute,
          'anon_execute', pg_catalog.has_function_privilege('anon', item.oid, 'EXECUTE'),
          'authenticated_execute', function_authenticated_execute,
          'service_role_execute', pg_catalog.has_function_privilege('service_role', item.oid, 'EXECUTE'),
          'body_detected_as_mutating', function_mutates,
          'staff_guard_detected', function_staff_guard,
          'player_self_guard_detected', function_player_guard,
          'definition', function_definition
        )
      )
    );
  end loop;

  ---------------------------------------------------------------------------
  -- 4. Tablas globales relacionadas: catalogo, policies, grants y PLAYER.
  ---------------------------------------------------------------------------
  for target_table in
    select table_name
    from (values
      ('players_database'),
      ('player_team_memberships'),
      ('player_positions'),
      ('player_sources'),
      ('player_scouting_traits'),
      ('legacy_own_player_migration')
    ) tables(table_name)
  loop
    relation_oid := null;
    relation_owner := null;
    relation_acl := null;
    relation_owner_name := null;
    rls_enabled := null;
    force_rls := null;

    select
      relation.oid,
      relation.relowner,
      relation.relacl,
      pg_catalog.pg_get_userbyid(relation.relowner),
      relation.relrowsecurity,
      relation.relforcerowsecurity
    into
      relation_oid,
      relation_owner,
      relation_acl,
      relation_owner_name,
      rls_enabled,
      force_rls
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = target_table
      and relation.relkind in ('r', 'p');

    audit_order := audit_order + 1;
    audit_results := audit_results || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'test_order', audit_order,
        'category', 'GLOBAL_PLAYER_TABLE',
        'test_name', 'public.' || target_table,
        'expected_or_question', 'PLAYER no debe rodear jugadores mediante esta tabla',
        'observed', case
          when relation_oid is null then pg_catalog.jsonb_build_object('exists', false)
          else pg_catalog.jsonb_build_object(
            'exists', true,
            'owner', relation_owner_name,
            'rls_enabled', rls_enabled,
            'force_rls', force_rls,
            'raw_acl', coalesce(relation_acl::text, 'NULL')
          )
        end,
        'risk_level', case
          when relation_oid is null then 'INFO'
          when not rls_enabled then 'HIGH'
          else 'INFO'
        end,
        'test_ok', case
          when relation_oid is null then null
          else rls_enabled
        end,
        'details', null
      )
    );

    if relation_oid is not null then
      for item in
        select
          policy.policyname,
          policy.cmd,
          policy.roles,
          policy.permissive,
          policy.qual,
          policy.with_check
        from pg_catalog.pg_policies policy
        where policy.schemaname = 'public'
          and policy.tablename = target_table
        order by policy.policyname
      loop
        normalized_using := pg_catalog.regexp_replace(
          pg_catalog.lower(coalesce(item.qual, '')),
          '[[:space:]()]', '', 'g'
        );
        normalized_check := pg_catalog.regexp_replace(
          pg_catalog.lower(coalesce(item.with_check, '')),
          '[[:space:]()]', '', 'g'
        );
        role_clause := pg_catalog.lower(pg_catalog.array_to_string(item.roles, ','));
        policy_open := normalized_using = 'true' or normalized_check = 'true';

        audit_order := audit_order + 1;
        audit_results := audit_results || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'test_order', audit_order,
            'category', 'GLOBAL_PLAYER_POLICY',
            'test_name', target_table || ' / ' || item.policyname,
            'expected_or_question', 'Detectar USING(true), WITH CHECK(true) y roles abiertos',
            'observed', pg_catalog.jsonb_build_object(
              'command', item.cmd,
              'roles', item.roles,
              'mode', item.permissive,
              'using', item.qual,
              'with_check', item.with_check,
              'using_true', normalized_using = 'true',
              'with_check_true', normalized_check = 'true'
            ),
            'risk_level', case
              when policy_open and role_clause like '%authenticated%' then 'CRITICAL'
              when role_clause like '%anon%' or role_clause like '%public%' then 'CRITICAL'
              else 'INFO'
            end,
            'test_ok', case
              when policy_open and role_clause like '%authenticated%' then false
              when role_clause like '%anon%' or role_clause like '%public%' then false
              else null
            end,
            'details', null
          )
        );
      end loop;

      select
        coalesce(pg_catalog.bool_or(acl.grantee = 0 and acl.privilege_type = 'SELECT'), false),
        coalesce(pg_catalog.bool_or(acl.grantee = 0 and acl.privilege_type = 'INSERT'), false),
        coalesce(pg_catalog.bool_or(acl.grantee = 0 and acl.privilege_type = 'UPDATE'), false),
        coalesce(pg_catalog.bool_or(acl.grantee = 0 and acl.privilege_type = 'DELETE'), false)
      into public_select, public_insert, public_update, public_delete
      from pg_catalog.aclexplode(
        coalesce(relation_acl, pg_catalog.acldefault('r', relation_owner))
      ) acl;

      for target_role in
        select role_name
        from (values ('PUBLIC'), ('anon'), ('authenticated'), ('service_role')) roles(role_name)
      loop
        if target_role = 'PUBLIC' then
          role_select := public_select;
          role_insert := public_insert;
          role_update := public_update;
          role_delete := public_delete;
        else
          role_select := pg_catalog.has_table_privilege(target_role, relation_oid, 'SELECT');
          role_insert := pg_catalog.has_table_privilege(target_role, relation_oid, 'INSERT');
          role_update := pg_catalog.has_table_privilege(target_role, relation_oid, 'UPDATE');
          role_delete := pg_catalog.has_table_privilege(target_role, relation_oid, 'DELETE');
        end if;

        audit_order := audit_order + 1;
        audit_results := audit_results || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'test_order', audit_order,
            'category', 'GLOBAL_PLAYER_GRANT',
            'test_name', target_table || ' / ' || target_role,
            'expected_or_question', 'Informar privilegios efectivos; anon/PUBLIC no deben tenerlos',
            'observed', pg_catalog.jsonb_build_object(
              'select', role_select,
              'insert', role_insert,
              'update', role_update,
              'delete', role_delete
            ),
            'risk_level', case
              when target_role in ('PUBLIC', 'anon')
               and (role_select or role_insert or role_update or role_delete) then 'CRITICAL'
              else 'INFO'
            end,
            'test_ok', case
              when target_role in ('PUBLIC', 'anon')
                then not (role_select or role_insert or role_update or role_delete)
              else null
            end,
            'details', null
          )
        );
      end loop;

      -- Acceso real de Borja a cada tabla global.
      perform pg_catalog.set_config(
        'request.jwt.claims',
        pg_catalog.jsonb_build_object(
          'sub', '350615a9-b068-450a-b867-da30a59b9082',
          'role', 'authenticated'
        )::text,
        true
      );
      perform pg_catalog.set_config(
        'request.jwt.claim.sub',
        '350615a9-b068-450a-b867-da30a59b9082',
        true
      );
      perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
      visible_count := null;
      error_state := null;
      error_message := null;
      begin
        execute 'set local role authenticated';
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

      audit_order := audit_order + 1;
      audit_results := audit_results || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'test_order', audit_order,
          'category', 'GLOBAL_PLAYER_SIMULATION',
          'test_name', 'BORJA_PLAYER reads ' || target_table,
          'expected_or_question', '0 filas o permiso denegado',
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
            when error_state is null and visible_count > 0 then 'CRITICAL'
            else 'INFO'
          end,
          'test_ok', error_state is not null or coalesce(visible_count, 0) = 0,
          'details', 'Prueba funcional de lectura, no inferencia basada solo en grants.'
        )
      );

      -- Acceso real anon a cada tabla global.
      perform pg_catalog.set_config(
        'request.jwt.claims',
        pg_catalog.jsonb_build_object('role', 'anon')::text,
        true
      );
      perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
      perform pg_catalog.set_config('request.jwt.claim.role', 'anon', true);
      visible_count := null;
      error_state := null;
      error_message := null;
      begin
        execute 'set local role anon';
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

      audit_order := audit_order + 1;
      audit_results := audit_results || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'test_order', audit_order,
          'category', 'GLOBAL_PLAYER_SIMULATION',
          'test_name', 'ANON reads ' || target_table,
          'expected_or_question', '0 filas o permiso denegado',
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
            when error_state is null and visible_count > 0 then 'CRITICAL'
            else 'INFO'
          end,
          'test_ok', error_state is not null or coalesce(visible_count, 0) = 0,
          'details', null
        )
      );
    end if;
  end loop;

  ---------------------------------------------------------------------------
  -- 5. Storage: bucket jugadores, policies/grants y listados READ ONLY.
  ---------------------------------------------------------------------------
  bucket_exists := false;
  bucket_public := null;
  bucket_id := null;
  bucket_name := null;
  bucket_file_size_limit := null;
  bucket_allowed_mime_types := null;

  if pg_catalog.to_regclass('storage.buckets') is not null then
    select
      true,
      bucket.id,
      bucket.name,
      bucket.public,
      bucket.file_size_limit,
      bucket.allowed_mime_types
    into
      bucket_exists,
      bucket_id,
      bucket_name,
      bucket_public,
      bucket_file_size_limit,
      bucket_allowed_mime_types
    from storage.buckets bucket
    where bucket.id = 'jugadores'
       or bucket.name = 'jugadores'
    order by (bucket.id = 'jugadores') desc
    limit 1;
    if not found then
      bucket_exists := false;
    end if;
  end if;

  audit_order := audit_order + 1;
  audit_results := audit_results || pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'test_order', audit_order,
      'category', 'STORAGE_BUCKET',
      'test_name', 'storage.buckets / jugadores',
      'expected_or_question', 'Informar existencia y configuracion real',
      'observed', pg_catalog.jsonb_build_object(
        'exists', bucket_exists,
        'id', bucket_id,
        'name', bucket_name,
        'public', bucket_public,
        'file_size_limit', bucket_file_size_limit,
        'allowed_mime_types', bucket_allowed_mime_types
      ),
      'risk_level', case
        when not bucket_exists then 'MEDIUM'
        when bucket_public then 'MEDIUM'
        else 'INFO'
      end,
      'test_ok', null,
      'details', case
        when bucket_public then 'public=true permite entrega por URL publica; no equivale a SELECT/listado de storage.objects.'
        when bucket_exists then 'Bucket privado segun catalogo; aun deben revisarse policies y URLs guardadas.'
        else 'El frontend referencia este bucket, pero no existe con id/name jugadores en el catalogo consultado.'
      end
    )
  );

  if pg_catalog.to_regclass('storage.objects') is not null then
    for item in
      select
        policy.policyname,
        policy.cmd,
        policy.roles,
        policy.permissive,
        policy.qual,
        policy.with_check
      from pg_catalog.pg_policies policy
      where policy.schemaname = 'storage'
        and policy.tablename = 'objects'
      order by policy.policyname
    loop
      normalized_using := pg_catalog.regexp_replace(
        pg_catalog.lower(coalesce(item.qual, '')),
        '[[:space:]()]', '', 'g'
      );
      normalized_check := pg_catalog.regexp_replace(
        pg_catalog.lower(coalesce(item.with_check, '')),
        '[[:space:]()]', '', 'g'
      );
      role_clause := pg_catalog.lower(pg_catalog.array_to_string(item.roles, ','));

      audit_order := audit_order + 1;
      audit_results := audit_results || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'test_order', audit_order,
          'category', 'STORAGE_OBJECTS_POLICY',
          'test_name', item.policyname,
          'expected_or_question', 'Policy explicita o generica que puede afectar bucket jugadores',
          'observed', pg_catalog.jsonb_build_object(
            'scope_hint', case
              when pg_catalog.lower(coalesce(item.qual, '') || ' ' || coalesce(item.with_check, '')) like '%jugadores%'
                then 'EXPLICITLY_REFERENCES_JUGADORES'
              else 'GENERIC_OR_OTHER_BUCKET_PREDICATE'
            end,
            'command', item.cmd,
            'roles', item.roles,
            'mode', item.permissive,
            'using', item.qual,
            'with_check', item.with_check,
            'using_true', normalized_using = 'true',
            'with_check_true', normalized_check = 'true'
          ),
          'risk_level', case
            when role_clause like '%anon%'
             and (normalized_using = 'true' or normalized_check = 'true') then 'CRITICAL'
            when role_clause like '%public%'
             and (normalized_using = 'true' or normalized_check = 'true') then 'CRITICAL'
            else 'INFO'
          end,
          'test_ok', case
            when (role_clause like '%anon%' or role_clause like '%public%')
             and (normalized_using = 'true' or normalized_check = 'true') then false
            else null
          end,
          'details', 'Se incluyen todas las policies de storage.objects porque una policy generica tambien puede afectar al bucket.'
        )
      );
    end loop;

    select
      relation.oid,
      relation.relowner,
      relation.relacl
    into relation_oid, relation_owner, relation_acl
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'storage'
      and relation.relname = 'objects'
      and relation.relkind in ('r', 'p');

    select
      coalesce(pg_catalog.bool_or(acl.grantee = 0 and acl.privilege_type = 'SELECT'), false),
      coalesce(pg_catalog.bool_or(acl.grantee = 0 and acl.privilege_type = 'INSERT'), false),
      coalesce(pg_catalog.bool_or(acl.grantee = 0 and acl.privilege_type = 'UPDATE'), false),
      coalesce(pg_catalog.bool_or(acl.grantee = 0 and acl.privilege_type = 'DELETE'), false)
    into public_select, public_insert, public_update, public_delete
    from pg_catalog.aclexplode(
      coalesce(relation_acl, pg_catalog.acldefault('r', relation_owner))
    ) acl;

    for target_role in
      select role_name
      from (values ('PUBLIC'), ('anon'), ('authenticated'), ('service_role')) roles(role_name)
    loop
      if target_role = 'PUBLIC' then
        role_select := public_select;
        role_insert := public_insert;
        role_update := public_update;
        role_delete := public_delete;
      else
        role_select := pg_catalog.has_table_privilege(target_role, relation_oid, 'SELECT');
        role_insert := pg_catalog.has_table_privilege(target_role, relation_oid, 'INSERT');
        role_update := pg_catalog.has_table_privilege(target_role, relation_oid, 'UPDATE');
        role_delete := pg_catalog.has_table_privilege(target_role, relation_oid, 'DELETE');
      end if;

      audit_order := audit_order + 1;
      audit_results := audit_results || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'test_order', audit_order,
          'category', 'STORAGE_OBJECTS_GRANT',
          'test_name', target_role,
          'expected_or_question', 'Privilegios efectivos sobre storage.objects',
          'observed', pg_catalog.jsonb_build_object(
            'select', role_select,
            'insert', role_insert,
            'update', role_update,
            'delete', role_delete
          ),
          'risk_level', case
            when target_role in ('PUBLIC', 'anon')
             and (role_select or role_insert or role_update or role_delete) then 'HIGH'
            else 'INFO'
          end,
          'test_ok', case
            when target_role in ('PUBLIC', 'anon')
              then not (role_select or role_insert or role_update or role_delete)
            else null
          end,
          'details', 'Los grants no bastan para listar: RLS tambien se aplica a storage.objects.'
        )
      );
    end loop;

    for scenario in
      select *
      from (values
        ('BORJA_PLAYER', 'authenticated', '350615a9-b068-450a-b867-da30a59b9082'),
        ('STAFF', 'authenticated', 'e0933d02-76c7-4e71-9765-896593e1ae80'),
        ('ANON', 'anon', null)
      ) scenarios(scenario_name, database_role, user_id)
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

      audit_order := audit_order + 1;
      audit_results := audit_results || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'test_order', audit_order,
          'category', 'STORAGE_LIST_SIMULATION',
          'test_name', scenario.scenario_name || ' lists jugadores bucket',
          'expected_or_question', case
            when scenario.scenario_name = 'ANON' then '0 objetos o permiso denegado'
            when scenario.scenario_name = 'BORJA_PLAYER' then 'Determinar si PLAYER puede enumerar fotos'
            else 'Determinar si STAFF puede listar el bucket'
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
            when scenario.scenario_name = 'ANON'
             and error_state is null and visible_count > 0 then 'CRITICAL'
            when scenario.scenario_name = 'BORJA_PLAYER'
             and error_state is null and visible_count > 0 then 'HIGH'
            else 'INFO'
          end,
          'test_ok', case
            when scenario.scenario_name = 'ANON'
              then error_state is not null or coalesce(visible_count, 0) = 0
            when scenario.scenario_name = 'BORJA_PLAYER'
              then error_state is not null or coalesce(visible_count, 0) = 0
            else null
          end,
          'details', 'La prueba solo cuenta metadatos visibles; no descarga ni muestra nombres/rutas de objetos.'
        )
      );
    end loop;
  else
    audit_order := audit_order + 1;
    audit_results := audit_results || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'test_order', audit_order,
        'category', 'STORAGE_OBJECTS',
        'test_name', 'storage.objects relation',
        'expected_or_question', 'Debe existir en un proyecto Supabase con Storage',
        'observed', 'RELATION_NOT_FOUND',
        'risk_level', 'HIGH',
        'test_ok', false,
        'details', null
      )
    );
  end if;

  -- Restaura el contexto elevado de SQL Editor antes de publicar el resultado.
  begin execute 'reset role'; exception when others then null; end;
  perform pg_catalog.set_config('request.jwt.claims', '{}'::jsonb::text, true);
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', '', true);
  perform pg_catalog.set_config(
    'appcaudal.player_profile_audit_results',
    audit_results::text,
    true
  );
end;
$audit$;

-- UNICO RESULT SET DEL ARCHIVO.
with audit_rows as (
  select value as row_data
  from pg_catalog.jsonb_array_elements(
    pg_catalog.current_setting(
      'appcaudal.player_profile_audit_results',
      false
    )::jsonb
  ) result(value)
)
select
  (row_data ->> 'test_order')::integer as test_order,
  row_data ->> 'category' as category,
  row_data ->> 'test_name' as test_name,
  row_data ->> 'expected_or_question' as expected_or_question,
  case
    when pg_catalog.jsonb_typeof(row_data -> 'observed') = 'string'
      then row_data ->> 'observed'
    else (row_data -> 'observed')::text
  end as observed,
  row_data ->> 'risk_level' as risk_level,
  case
    when row_data -> 'test_ok' is null
      or row_data -> 'test_ok' = 'null'::jsonb then null
    else (row_data ->> 'test_ok')::boolean
  end as test_ok,
  case
    when row_data -> 'details' is null
      or row_data -> 'details' = 'null'::jsonb then null
    when pg_catalog.jsonb_typeof(row_data -> 'details') = 'string'
      then row_data ->> 'details'
    else (row_data -> 'details')::text
  end as details
from audit_rows
order by (row_data ->> 'test_order')::integer;

rollback;
