-- APPCAUDAL / Cambio 38: auditoria efectiva de seguridad de partidos.
--
-- SOLO LECTURA. Este archivo contiene una unica sentencia SELECT (WITH ... SELECT).
-- No crea objetos, no cambia privilegios, no prueba escrituras y no simula usuarios.
-- Ejecutar el archivo completo en Supabase SQL Editor con una identidad administrativa
-- autorizada para leer pg_catalog. El resultado unico se puede exportar directamente a CSV.
--
-- Privacidad: solo devuelve metadatos, definiciones de seguridad, huellas de funciones y
-- recuentos agregados. No devuelve UUID de jugadores, notas, wellness ni datos deportivos.
--
-- Alcance:
--   * public.partidos, public.club_team_seasons y dependencias conocidas en el repositorio.
--   * cualquier descendiente real de public.partidos acreditado por una FK del catalogo.
--   * RPC publicas que mencionan esos objetos o cuyo nombre esta relacionado con partidos.
--
-- Limitaciones:
--   * La deteccion de llamadas y controles dentro de funciones es textual; no resuelve
--     SQL dinamico ni toda la cadena transitiva de llamadas.
--   * Los privilegios indican capacidad SQL efectiva. RLS puede restringir despues las filas.
--   * PUBLIC se obtiene de las ACL; authenticated y anon incluyen privilegios heredados.

with recursive
expected_tables(table_name, area) as (
  values
    ('club_team_seasons', 'ambito'),
    ('competitions', 'catalogo'),
    ('partidos', 'partido'),
    ('partido_convocados', 'hija_directa'),
    ('partido_estadisticas_jugador', 'hija_directa'),
    ('partido_eventos_gol', 'hija_directa'),
    ('match_quick_events', 'hija_directa'),
    ('partido_alineacion_slots', 'hija_directa'),
    ('partido_eventos_sistema', 'hija_directa'),
    ('partido_eventos_sustitucion', 'hija_directa'),
    ('partido_eventos_post', 'hija_directa'),
    ('partido_notas_individuales_pre', 'hija_directa'),
    ('partido_snapshots_tacticos', 'hija_directa'),
    ('partido_snapshot_tactico_slots', 'hija_indirecta'),
    ('match_set_piece_takers', 'hija_directa'),
    ('match_set_piece_notes', 'hija_directa'),
    ('match_set_piece_diagrams', 'hija_directa'),
    ('jugador_suspension_consumptions', 'hija_directa'),
    ('rival_scouting_evidence', 'vinculo_opcional'),
    ('rival_scouting_connections', 'vinculo_opcional')
),
expected_links(child_table, parent_table, child_column, parent_column, link_required) as (
  values
    ('partidos', 'club_team_seasons', 'club_team_season_id', 'id', true),
    ('partido_convocados', 'partidos', 'partido_id', 'id', true),
    ('partido_estadisticas_jugador', 'partidos', 'partido_id', 'id', true),
    ('partido_eventos_gol', 'partidos', 'partido_id', 'id', true),
    ('match_quick_events', 'partidos', 'partido_id', 'id', true),
    ('partido_alineacion_slots', 'partidos', 'partido_id', 'id', true),
    ('partido_eventos_sistema', 'partidos', 'partido_id', 'id', true),
    ('partido_eventos_sustitucion', 'partidos', 'partido_id', 'id', true),
    ('partido_eventos_post', 'partidos', 'partido_id', 'id', true),
    ('partido_notas_individuales_pre', 'partidos', 'partido_id', 'id', true),
    ('partido_snapshots_tacticos', 'partidos', 'partido_id', 'id', true),
    ('partido_snapshot_tactico_slots', 'partido_snapshots_tacticos', 'snapshot_id', 'id', true),
    ('match_set_piece_takers', 'partidos', 'partido_id', 'id', true),
    ('match_set_piece_notes', 'partidos', 'partido_id', 'id', true),
    ('match_set_piece_diagrams', 'partidos', 'partido_id', 'id', true),
    ('jugador_suspension_consumptions', 'partidos', 'partido_id', 'id', true),
    ('rival_scouting_evidence', 'partidos', 'partido_id', 'id', false),
    ('rival_scouting_connections', 'partidos', 'partido_id', 'id', false)
),
expected_player_functions(function_name, purpose) as (
  values
    ('is_player_match_publishable', 'regla_publicacion'),
    ('get_my_player_matches', 'partidos_publicados'),
    ('get_my_player_analysis_summary', 'resumen_estadistico'),
    ('get_my_player_analysis_overview', 'analisis_general'),
    ('get_my_player_analysis_live_stats', 'estadisticas_actuales'),
    ('get_my_player_production_actions', 'acciones_produccion'),
    ('get_my_player_match_history', 'historial_partidos'),
    ('get_my_player_analysis_match_stats', 'estadisticas_por_partido')
),
partidos_root as (
  select pg_catalog.to_regclass('public.partidos') as relation_oid
),
-- Descubre dependencias reales mediante FK. El control de path evita ciclos.
match_tree(relation_oid, depth, path) as (
  select relation_oid::oid, 0, array[relation_oid::oid]::oid[]
  from partidos_root
  where relation_oid is not null
  union all
  select fk.conrelid, tree.depth + 1, tree.path || fk.conrelid
  from match_tree tree
  join pg_catalog.pg_constraint fk
    on fk.contype = 'f' and fk.confrelid = tree.relation_oid
  join pg_catalog.pg_class child on child.oid = fk.conrelid
  join pg_catalog.pg_namespace child_ns on child_ns.oid = child.relnamespace
  where child_ns.nspname = 'public'
    and child.relkind in ('r', 'p')
    and not fk.conrelid = any(tree.path)
),
target_names as (
  select e.table_name, e.area
  from expected_tables e
  union
  select c.relname::text, 'descendiente_fk'::text
  from match_tree tree
  join pg_catalog.pg_class c on c.oid = tree.relation_oid
  where tree.depth > 0
),
targets as (
  select names.table_name,
         pg_catalog.string_agg(distinct names.area, ', ' order by names.area) as area,
         pg_catalog.to_regclass(pg_catalog.format('public.%I', names.table_name)) as relation_oid
  from target_names names
  group by names.table_name
),
target_oids as (
  select relation_oid from targets where relation_oid is not null
),
table_state_rows as (
  select
    '01 TABLAS_Y_RLS'::text as section,
    'TABLE'::text as object_type,
    pg_catalog.format('public.%I', t.table_name)::text as object_name,
    'existencia_y_estado_rls'::text as check_name,
    case
      when c.oid is null then 'NOT_FOUND'
      when not c.relrowsecurity then 'FAIL'
      else 'PASS'
    end::text as status,
    case
      when c.oid is null then 'HIGH'
      when not c.relrowsecurity then 'CRITICAL'
      else 'INFO'
    end::text as severity,
    case
      when c.oid is null then 'Objeto esperado por el repositorio no encontrado.'
      when not c.relrowsecurity then 'RLS no esta activada en una tabla del alcance.'
      else 'RLS activada; revisar las politicas y privilegios de las secciones siguientes.'
    end::text as finding,
    case when c.oid is null then pg_catalog.format('area=%s', t.area)
         else pg_catalog.format(
           'area=%s; relkind=%s; force_rls=%s; owner=%s',
           t.area, c.relkind, c.relforcerowsecurity,
           pg_catalog.pg_get_userbyid(c.relowner))
    end::text as evidence
  from targets t
  left join pg_catalog.pg_class c on c.oid = t.relation_oid
),
policy_source as (
  select
    t.table_name,
    t.area,
    p.oid as policy_oid,
    p.polname,
    p.polcmd,
    p.polpermissive,
    p.polroles,
    pg_catalog.pg_get_expr(p.polqual, p.polrelid) as using_expr,
    pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) as check_expr
  from targets t
  join pg_catalog.pg_policy p on p.polrelid = t.relation_oid
),
policy_analysis as (
  select p.*,
         pg_catalog.lower(
           pg_catalog.coalesce(p.using_expr, '') || ' ' ||
           pg_catalog.coalesce(p.check_expr, '')
         ) as combined_expr,
         pg_catalog.regexp_replace(
           pg_catalog.lower(pg_catalog.coalesce(p.using_expr, '')),
           '[[:space:]()]', '', 'g') as normalized_using,
         pg_catalog.regexp_replace(
           pg_catalog.lower(pg_catalog.coalesce(p.check_expr, '')),
           '[[:space:]()]', '', 'g') as normalized_check
  from policy_source p
),
policy_flags as (
  select p.*,
         not (
           pg_catalog.strpos(p.area, 'catalogo') > 0
           or pg_catalog.strpos(p.area, 'ambito') > 0
         ) as scope_required,
         p.polcmd in ('a', 'w', 'd', '*') as is_write_policy,
         exists (
           select 1
           from pg_catalog.unnest(p.polroles) as policy_role(role_oid)
           where case
             when role_oid = 0::oid then true
             else pg_catalog.pg_has_role('authenticated', role_oid, 'USAGE')
               or pg_catalog.pg_has_role('anon', role_oid, 'USAGE')
           end
         ) as applies_client_role,
         p.combined_expr like '%is_app_staff%' as uses_is_app_staff,
         (
           p.combined_expr like '%can_read_club_team_season%'
           or p.combined_expr like '%can_write_club_team_season%'
           or p.combined_expr like '%can_read_match%'
           or p.combined_expr like '%can_write_match%'
           or p.combined_expr like '%club_team_season_id%'
           or p.combined_expr like '%club_team_season_permissions%'
         ) as has_team_season_scope,
         (
           p.normalized_using in ('true', 'true::boolean')
           or p.normalized_check in ('true', 'true::boolean')
         ) as has_true_predicate
  from policy_analysis p
),
policy_rows as (
  select
    '02 POLITICAS_RLS'::text as section,
    'POLICY'::text as object_type,
    pg_catalog.format('public.%I.%I', p.table_name, p.polname)::text as object_name,
    'definicion_efectiva'::text as check_name,
    case
      when p.polpermissive and p.applies_client_role and p.has_true_predicate
       and (p.scope_required or p.is_write_policy) then 'FAIL'
      when p.polpermissive and p.applies_client_role and p.scope_required
       and p.uses_is_app_staff and not p.has_team_season_scope then 'FAIL'
      when p.polpermissive and p.applies_client_role and p.scope_required
       and not p.has_team_season_scope then 'WARN'
      when p.polpermissive and p.applies_client_role and p.has_true_predicate then 'WARN'
      else 'PASS'
    end::text as status,
    case
      when p.polpermissive and p.applies_client_role and p.has_true_predicate
       and (p.scope_required or p.is_write_policy) then 'CRITICAL'
      when p.polpermissive and p.applies_client_role and p.scope_required
       and p.uses_is_app_staff and not p.has_team_season_scope then 'HIGH'
      when p.polpermissive and p.applies_client_role and p.scope_required
       and not p.has_team_season_scope then 'MEDIUM'
      when p.polpermissive and p.applies_client_role and p.has_true_predicate then 'MEDIUM'
      else 'INFO'
    end::text as severity,
    case
      when p.polpermissive and p.applies_client_role and p.has_true_predicate
       and (p.scope_required or p.is_write_policy)
        then 'Politica permisiva con predicado verdadero; puede abrir filas al rol aplicable.'
      when p.polpermissive and p.applies_client_role and p.scope_required
       and p.uses_is_app_staff and not p.has_team_season_scope
        then 'is_app_staff() sin control textual de equipo-temporada.'
      when p.polpermissive and p.applies_client_role and p.scope_required
       and not p.has_team_season_scope
        then 'No se observa control textual de equipo-temporada; revisar helpers llamados.'
      when p.polpermissive and p.applies_client_role and p.has_true_predicate
        then 'Lectura abierta detectada en un objeto sin alcance equipo-temporada obligatorio; confirmar que sea publica por diseno.'
      when not p.scope_required and not p.has_team_season_scope
        then 'Objeto clasificado como catalogo o entidad de ambito; no se exige herencia desde partido.'
      else 'No se detecta el patron abierto auditado.'
    end::text as finding,
    pg_catalog.format(
      'area=%s; scope_required=%s; command=%s; mode=%s; roles=%s; USING=%s; WITH CHECK=%s',
      p.area,
      p.scope_required,
      case p.polcmd
        when 'r' then 'SELECT' when 'a' then 'INSERT'
        when 'w' then 'UPDATE' when 'd' then 'DELETE' else 'ALL'
      end,
      case when p.polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end,
      pg_catalog.coalesce((
        select pg_catalog.string_agg(
          case when role_oid = 0::oid then 'PUBLIC'
               else pg_catalog.coalesce(role_name.rolname, role_oid::text) end,
          ', ' order by role_oid)
        from pg_catalog.unnest(p.polroles) as policy_role(role_oid)
        left join pg_catalog.pg_roles role_name on role_name.oid = role_oid
      ), '<sin roles>'),
      pg_catalog.coalesce(p.using_expr, '<sin USING>'),
      pg_catalog.coalesce(p.check_expr, '<sin WITH CHECK>')
    )::text as evidence
  from policy_flags p
),
expanded_permissive_policies as (
  select p.*,
         command_name
  from policy_flags p
  cross join lateral pg_catalog.unnest(
    case p.polcmd
      when '*' then array['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]
      when 'r' then array['SELECT']::text[]
      when 'a' then array['INSERT']::text[]
      when 'w' then array['UPDATE']::text[]
      when 'd' then array['DELETE']::text[]
      else array['UNKNOWN']::text[]
    end
  ) as expanded(command_name)
  where p.polpermissive
    and p.applies_client_role
    and (p.scope_required or (p.has_true_predicate and p.is_write_policy))
),
policy_combination_rows as (
  select
    '03 COMBINACIONES_PERMISIVAS'::text as section,
    'TABLE_COMMAND'::text as object_type,
    pg_catalog.format('public.%I:%s', p.table_name, p.command_name)::text as object_name,
    'posible_OR_inseguro'::text as check_name,
    case
      when pg_catalog.count(*) > 1
       and pg_catalog.count(*) filter (where p.has_true_predicate or not p.has_team_season_scope) > 0
        then 'FAIL'
      else 'PASS'
    end::text as status,
    case
      when pg_catalog.count(*) > 1
       and pg_catalog.count(*) filter (where p.has_true_predicate or not p.has_team_season_scope) > 0
        then 'HIGH'
      else 'INFO'
    end::text as severity,
    case
      when pg_catalog.count(*) > 1
       and pg_catalog.count(*) filter (where p.has_true_predicate or not p.has_team_season_scope) > 0
        then 'Varias politicas permisivas se combinan mediante OR y al menos una carece de alcance acreditado.'
      else 'No se detecta esta combinacion permisiva concreta.'
    end::text as finding,
    pg_catalog.format(
      'permissive_count=%s; open_or_unscoped=%s; policies=%s',
      pg_catalog.count(*),
      pg_catalog.count(*) filter (where p.has_true_predicate or not p.has_team_season_scope),
      pg_catalog.string_agg(p.polname, ', ' order by p.polname)
    )::text as evidence
  from expanded_permissive_policies p
  group by p.table_name, p.command_name
),
role_names(role_name) as (
  values ('authenticated'::text), ('anon'::text)
),
table_role_privileges as (
  select
    t.table_name,
    roles.role_name,
    pg_catalog.concat_ws(', ',
      case when pg_catalog.has_table_privilege(roles.role_name, t.relation_oid, 'SELECT') then 'SELECT' end,
      case when pg_catalog.has_table_privilege(roles.role_name, t.relation_oid, 'INSERT') then 'INSERT' end,
      case when pg_catalog.has_table_privilege(roles.role_name, t.relation_oid, 'UPDATE') then 'UPDATE' end,
      case when pg_catalog.has_table_privilege(roles.role_name, t.relation_oid, 'DELETE') then 'DELETE' end,
      case when pg_catalog.has_table_privilege(roles.role_name, t.relation_oid, 'TRUNCATE') then 'TRUNCATE' end,
      case when pg_catalog.has_table_privilege(roles.role_name, t.relation_oid, 'REFERENCES') then 'REFERENCES' end,
      case when pg_catalog.has_table_privilege(roles.role_name, t.relation_oid, 'TRIGGER') then 'TRIGGER' end
    ) as privileges
  from targets t
  cross join role_names roles
  where t.relation_oid is not null
),
table_public_privileges as (
  select
    t.table_name,
    'PUBLIC'::text as role_name,
    pg_catalog.coalesce(pg_catalog.string_agg(distinct acl.privilege_type, ', ' order by acl.privilege_type), '') as privileges
  from targets t
  join pg_catalog.pg_class c on c.oid = t.relation_oid
  left join lateral pg_catalog.aclexplode(
    pg_catalog.coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
  ) acl on acl.grantee = 0::oid
  group by t.table_name
),
table_privilege_rows as (
  select
    '04 PRIVILEGIOS_TABLA'::text as section,
    'TABLE_ACL'::text as object_type,
    pg_catalog.format('public.%I', privileges.table_name)::text as object_name,
    pg_catalog.format('privilegios_efectivos_%s', privileges.role_name)::text as check_name,
    case
      when privileges.privileges = '' then 'PASS'
      when privileges.role_name in ('anon', 'PUBLIC')
       and privileges.privileges ~ 'INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER' then 'FAIL'
      else 'INFO'
    end::text as status,
    case
      when privileges.role_name in ('anon', 'PUBLIC')
       and privileges.privileges ~ 'INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER' then 'CRITICAL'
      when privileges.role_name in ('anon', 'PUBLIC') and privileges.privileges <> '' then 'HIGH'
      else 'INFO'
    end::text as severity,
    case
      when privileges.privileges = '' then 'El rol no tiene privilegios SQL efectivos sobre la tabla.'
      else 'Los privilegios permiten intentar la operacion; RLS sigue determinando las filas accesibles.'
    end::text as finding,
    pg_catalog.format('role=%s; privileges=%s', privileges.role_name,
      case when privileges.privileges = '' then '<ninguno>' else privileges.privileges end)::text as evidence
  from (
    select * from table_role_privileges
    union all
    select * from table_public_privileges
  ) privileges
),
function_candidates as (
  select
    proc.oid,
    ns.nspname,
    proc.proname,
    proc.prosecdef,
    proc.prosrc,
    proc.proconfig,
    proc.proowner,
    proc.proacl,
    proc.provolatile,
    language.lanname,
    pg_catalog.pg_get_function_identity_arguments(proc.oid) as identity_arguments,
    pg_catalog.pg_get_function_result(proc.oid) as result_type,
    pg_catalog.md5(pg_catalog.pg_get_functiondef(proc.oid)) as definition_hash
  from pg_catalog.pg_proc proc
  join pg_catalog.pg_namespace ns on ns.oid = proc.pronamespace
  join pg_catalog.pg_language language on language.oid = proc.prolang
  where ns.nspname = 'public'
    and proc.prokind = 'f'
    and (
      proc.proname ~* '(partido|match|player_analysis|player_production|player_availability|suspension)'
      or proc.proname in (
        'is_player_match_publishable',
        'get_my_player_matches',
        'get_my_player_analysis_summary',
        'get_my_player_analysis_overview',
        'get_my_player_analysis_live_stats',
        'get_my_player_production_actions',
        'get_my_player_match_history',
        'get_my_player_analysis_match_stats',
        'set_player_availability',
        'consume_player_suspensions_for_match'
      )
      or exists (
        select 1
        from targets t
        where pg_catalog.strpos(pg_catalog.lower(proc.prosrc), pg_catalog.lower(t.table_name)) > 0
      )
    )
),
function_flags as (
  select f.*,
         pg_catalog.lower(f.prosrc) as source_lower,
         pg_catalog.strpos(pg_catalog.lower(f.prosrc), 'is_app_staff') > 0 as uses_is_app_staff,
         (
           pg_catalog.strpos(pg_catalog.lower(f.prosrc), 'can_read_club_team_season') > 0
           or pg_catalog.strpos(pg_catalog.lower(f.prosrc), 'can_write_club_team_season') > 0
           or pg_catalog.strpos(pg_catalog.lower(f.prosrc), 'can_read_match') > 0
           or pg_catalog.strpos(pg_catalog.lower(f.prosrc), 'can_write_match') > 0
           or pg_catalog.strpos(pg_catalog.lower(f.prosrc), 'club_team_season_id') > 0
           or pg_catalog.strpos(pg_catalog.lower(f.prosrc), 'club_team_season_permissions') > 0
         ) as has_team_season_scope,
         (
           pg_catalog.strpos(pg_catalog.lower(f.prosrc), 'auth.uid') > 0
           or pg_catalog.strpos(pg_catalog.lower(f.prosrc), 'current_membership') > 0
           or pg_catalog.strpos(pg_catalog.lower(f.prosrc), 'current_jugador_id') > 0
           or pg_catalog.strpos(pg_catalog.lower(f.prosrc), 'is_player') > 0
         ) as has_identity_check,
         pg_catalog.strpos(pg_catalog.lower(f.prosrc), 'is_player_match_publishable') > 0 as uses_publication_helper,
         pg_catalog.strpos(pg_catalog.lower(f.prosrc), 'player_visible') > 0 as uses_player_visible,
         pg_catalog.lower(f.prosrc) ~ '(^|[^a-z_])(insert[[:space:]]+into|update[[:space:]]+|delete[[:space:]]+from)' as appears_to_mutate,
         pg_catalog.has_function_privilege('authenticated', f.oid, 'EXECUTE') as authenticated_execute,
         pg_catalog.has_function_privilege('anon', f.oid, 'EXECUTE') as anon_execute,
         exists (
           select 1
           from pg_catalog.aclexplode(
             pg_catalog.coalesce(f.proacl, pg_catalog.acldefault('f', f.proowner))
           ) acl
           where acl.grantee = 0::oid and acl.privilege_type = 'EXECUTE'
         ) as public_execute
  from function_candidates f
),
function_rows as (
  select
    '05 FUNCIONES_RPC'::text as section,
    'FUNCTION'::text as object_type,
    pg_catalog.format('%I.%I(%s)', f.nspname, f.proname, f.identity_arguments)::text as object_name,
    'configuracion_y_privilegios'::text as check_name,
    case
      when f.prosecdef and f.appears_to_mutate and f.authenticated_execute
       and not f.has_team_season_scope then 'FAIL'
      when f.prosecdef and f.authenticated_execute and not f.has_team_season_scope then 'WARN'
      when f.prosecdef and f.public_execute then 'WARN'
      else 'INFO'
    end::text as status,
    case
      when f.prosecdef and f.appears_to_mutate and f.authenticated_execute
       and not f.has_team_season_scope then 'CRITICAL'
      when f.prosecdef and f.authenticated_execute and not f.has_team_season_scope then 'HIGH'
      when f.prosecdef and f.public_execute then 'HIGH'
      else 'INFO'
    end::text as severity,
    case
      when f.prosecdef and f.appears_to_mutate and f.authenticated_execute
       and not f.has_team_season_scope
        then 'SECURITY DEFINER de escritura ejecutable por authenticated sin alcance equipo-temporada detectado.'
      when f.prosecdef and f.authenticated_execute and not f.has_team_season_scope
        then 'SECURITY DEFINER ejecutable por authenticated sin alcance equipo-temporada detectado.'
      when f.prosecdef and f.public_execute
        then 'SECURITY DEFINER conserva EXECUTE para PUBLIC; revisar si es intencionado.'
      else 'Funcion relacionada inventariada; revisar la evidencia y su cadena de llamadas.'
    end::text as finding,
    pg_catalog.format(
      'security=%s; owner=%s; language=%s; volatility=%s; search_path=%s; result=%s; execute_authenticated=%s; execute_anon=%s; execute_PUBLIC=%s; uses_is_app_staff=%s; team_season_scope=%s; identity_check=%s; appears_to_mutate=%s; definition_md5=%s',
      case when f.prosecdef then 'DEFINER' else 'INVOKER' end,
      pg_catalog.pg_get_userbyid(f.proowner),
      f.lanname,
      case f.provolatile when 'i' then 'IMMUTABLE' when 's' then 'STABLE' else 'VOLATILE' end,
      pg_catalog.coalesce(pg_catalog.array_to_string(f.proconfig, '; '), '<por defecto>'),
      f.result_type,
      f.authenticated_execute,
      f.anon_execute,
      f.public_execute,
      f.uses_is_app_staff,
      f.has_team_season_scope,
      f.has_identity_check,
      f.appears_to_mutate,
      f.definition_hash
    )::text as evidence
  from function_flags f
),
function_staff_scope_rows as (
  select
    '06 FUNCIONES_STAFF_SIN_ALCANCE'::text as section,
    'FUNCTION_ALERT'::text as object_type,
    pg_catalog.format('%I.%I(%s)', f.nspname, f.proname, f.identity_arguments)::text as object_name,
    'is_app_staff_sin_equipo_temporada'::text as check_name,
    'FAIL'::text as status,
    case when f.prosecdef or f.appears_to_mutate then 'CRITICAL' else 'HIGH' end::text as severity,
    'La funcion usa is_app_staff() y no contiene un control textual acreditado de equipo-temporada.'::text as finding,
    pg_catalog.format(
      'security=%s; appears_to_mutate=%s; execute_authenticated=%s; definition_md5=%s; revisar llamadas transitivas y SQL dinamico',
      case when f.prosecdef then 'DEFINER' else 'INVOKER' end,
      f.appears_to_mutate,
      f.authenticated_execute,
      f.definition_hash
    )::text as evidence
  from function_flags f
  where f.uses_is_app_staff and not f.has_team_season_scope
),
function_search_path_rows as (
  select
    '06A SEARCH_PATH_DEFINER'::text as section,
    'FUNCTION_ALERT'::text as object_type,
    pg_catalog.format('%I.%I(%s)', f.nspname, f.proname, f.identity_arguments)::text as object_name,
    'search_path_security_definer'::text as check_name,
    case
      when f.proconfig is null
        or not exists (
          select 1 from pg_catalog.unnest(f.proconfig) as config(setting)
          where pg_catalog.lower(setting) like 'search_path=%'
        ) then 'FAIL'
      when exists (
        select 1 from pg_catalog.unnest(f.proconfig) as config(setting)
        where pg_catalog.regexp_replace(
          pg_catalog.lower(pg_catalog.replace(setting, ' ', '')),
          '^search_path=', '') ~ '(^|,)public(,|$)'
      ) then 'WARN'
      else 'PASS'
    end::text as status,
    case
      when f.proconfig is null
        or not exists (
          select 1 from pg_catalog.unnest(f.proconfig) as config(setting)
          where pg_catalog.lower(setting) like 'search_path=%'
        ) then 'HIGH'
      when exists (
        select 1 from pg_catalog.unnest(f.proconfig) as config(setting)
        where pg_catalog.regexp_replace(
          pg_catalog.lower(pg_catalog.replace(setting, ' ', '')),
          '^search_path=', '') ~ '(^|,)public(,|$)'
      ) then 'MEDIUM'
      else 'INFO'
    end::text as severity,
    case
      when f.proconfig is null
        or not exists (
          select 1 from pg_catalog.unnest(f.proconfig) as config(setting)
          where pg_catalog.lower(setting) like 'search_path=%'
        ) then 'SECURITY DEFINER sin search_path local explicito.'
      when exists (
        select 1 from pg_catalog.unnest(f.proconfig) as config(setting)
        where pg_catalog.regexp_replace(
          pg_catalog.lower(pg_catalog.replace(setting, ' ', '')),
          '^search_path=', '') ~ '(^|,)public(,|$)'
      ) then 'El search_path de SECURITY DEFINER incluye public; revisar nombres no cualificados y CREATE sobre el esquema.'
      else 'SECURITY DEFINER con search_path local explicito sin public detectado.'
    end::text as finding,
    pg_catalog.format(
      'search_path=%s; owner=%s; execute_authenticated=%s; execute_PUBLIC=%s; definition_md5=%s',
      pg_catalog.coalesce(pg_catalog.array_to_string(f.proconfig, '; '), '<por defecto>'),
      pg_catalog.pg_get_userbyid(f.proowner),
      f.authenticated_execute,
      f.public_execute,
      f.definition_hash
    )::text as evidence
  from function_flags f
  where f.prosecdef
),
player_function_rows as (
  select
    '07 PUBLICACION_Y_ESTADISTICAS_PLAYER'::text as section,
    'PLAYER_RPC'::text as object_type,
    pg_catalog.format('public.%I', expected.function_name)::text as object_name,
    expected.purpose::text as check_name,
    case
      when f.oid is null then 'NOT_FOUND'
      when expected.function_name <> 'is_player_match_publishable'
       and not f.has_identity_check then 'FAIL'
      when expected.function_name <> 'is_player_match_publishable'
       and f.prosecdef and not f.has_team_season_scope then 'WARN'
      else 'INFO'
    end::text as status,
    case
      when f.oid is null then 'HIGH'
      when expected.function_name <> 'is_player_match_publishable'
       and not f.has_identity_check then 'CRITICAL'
      when expected.function_name <> 'is_player_match_publishable'
       and f.prosecdef and not f.has_team_season_scope then 'HIGH'
      else 'INFO'
    end::text as severity,
    case
      when f.oid is null then 'Funcion esperada por el repositorio no encontrada en produccion.'
      when expected.function_name <> 'is_player_match_publishable'
       and not f.has_identity_check then 'No se detecta vinculacion textual con la identidad del jugador.'
      when expected.function_name <> 'is_player_match_publishable'
       and f.prosecdef and not f.has_team_season_scope
        then 'RPC de jugador SECURITY DEFINER sin alcance equipo-temporada detectado; revisar manualmente sus resultados.'
      else 'Funcion localizada; la evidencia permite revisar identidad, publicacion y alcance.'
    end::text as finding,
    case when f.oid is null then 'sin funcion efectiva'
         else pg_catalog.format(
           'signature=%I.%I(%s); security=%s; identity_check=%s; publication_helper=%s; player_visible=%s; team_season_scope=%s; execute_authenticated=%s; execute_anon=%s; definition_md5=%s',
           f.nspname, f.proname, f.identity_arguments,
           case when f.prosecdef then 'DEFINER' else 'INVOKER' end,
           f.has_identity_check,
           f.uses_publication_helper,
           f.uses_player_visible,
           f.has_team_season_scope,
           f.authenticated_execute,
           f.anon_execute,
           f.definition_hash)
    end::text as evidence
  from expected_player_functions expected
  left join function_flags f on f.proname = expected.function_name
),
fk_source as (
  select
    fk.oid,
    fk.conname,
    fk.conrelid,
    fk.confrelid,
    fk.conkey,
    fk.confkey,
    fk.convalidated,
    fk.condeferrable,
    fk.condeferred,
    fk.confdeltype,
    fk.confupdtype
  from pg_catalog.pg_constraint fk
  where fk.contype = 'f'
    and fk.conrelid in (select relation_oid from target_oids)
    and fk.confrelid in (select relation_oid from target_oids)
),
fk_rows as (
  select
    '08 CLAVES_FORANEAS'::text as section,
    'FOREIGN_KEY'::text as object_type,
    pg_catalog.format('%s.%I', fk.conrelid::pg_catalog.regclass, fk.conname)::text as object_name,
    'integridad_referencial'::text as check_name,
    case when fk.convalidated then 'PASS' else 'FAIL' end::text as status,
    case when fk.convalidated then 'INFO' else 'HIGH' end::text as severity,
    case when fk.convalidated then 'Clave foranea validada.'
         else 'Clave foranea NOT VALID; no acredita todas las filas historicas.' end::text as finding,
    pg_catalog.format(
      '%s; validated=%s; deferrable=%s; initially_deferred=%s; on_delete=%s; on_update=%s',
      pg_catalog.pg_get_constraintdef(fk.oid, true),
      fk.convalidated,
      fk.condeferrable,
      fk.condeferred,
      case fk.confdeltype when 'a' then 'NO ACTION' when 'r' then 'RESTRICT'
        when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' else fk.confdeltype::text end,
      case fk.confupdtype when 'a' then 'NO ACTION' when 'r' then 'RESTRICT'
        when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' else fk.confupdtype::text end
    )::text as evidence
  from fk_source fk
),
expected_link_state as (
  select
    expected.*,
    child.oid as child_oid,
    parent.oid as parent_oid,
    child_column.attnum as child_attnum,
    parent_column.attnum as parent_attnum,
    exists (
      select 1
      from pg_catalog.pg_constraint fk
      where fk.contype = 'f'
        and fk.conrelid = child.oid
        and fk.confrelid = parent.oid
        and fk.conkey = array[child_column.attnum]::smallint[]
        and fk.confkey = array[parent_column.attnum]::smallint[]
    ) as fk_exists,
    exists (
      select 1
      from pg_catalog.pg_constraint fk
      where fk.contype = 'f'
        and fk.conrelid = child.oid
        and fk.confrelid = parent.oid
        and fk.conkey = array[child_column.attnum]::smallint[]
        and fk.confkey = array[parent_column.attnum]::smallint[]
        and fk.convalidated
    ) as validated_fk_exists
  from expected_links expected
  left join pg_catalog.pg_class child
    on child.oid = pg_catalog.to_regclass(pg_catalog.format('public.%I', expected.child_table))
  left join pg_catalog.pg_class parent
    on parent.oid = pg_catalog.to_regclass(pg_catalog.format('public.%I', expected.parent_table))
  left join pg_catalog.pg_attribute child_column
    on child_column.attrelid = child.oid
   and child_column.attname = expected.child_column
   and child_column.attnum > 0
   and not child_column.attisdropped
  left join pg_catalog.pg_attribute parent_column
    on parent_column.attrelid = parent.oid
   and parent_column.attname = expected.parent_column
   and parent_column.attnum > 0
   and not parent_column.attisdropped
),
expected_link_rows as (
  select
    '09 RELACIONES_ESPERADAS'::text as section,
    'EXPECTED_LINK'::text as object_type,
    pg_catalog.format('public.%I.%I -> public.%I.%I', l.child_table, l.child_column, l.parent_table, l.parent_column)::text as object_name,
    'existencia_y_validacion'::text as check_name,
    case
      when l.child_oid is null or l.parent_oid is null or l.child_attnum is null or l.parent_attnum is null then 'NOT_FOUND'
      when not l.fk_exists then 'FAIL'
      when not l.validated_fk_exists then 'FAIL'
      else 'PASS'
    end::text as status,
    case
      when l.child_oid is null or l.parent_oid is null or l.child_attnum is null or l.parent_attnum is null then 'HIGH'
      when not l.fk_exists or not l.validated_fk_exists then 'HIGH'
      else 'INFO'
    end::text as severity,
    case
      when l.child_oid is null then 'No existe la tabla hija esperada.'
      when l.parent_oid is null then 'No existe la tabla padre esperada.'
      when l.child_attnum is null then 'No existe la columna de relacion esperada.'
      when l.parent_attnum is null then 'No existe la columna padre esperada.'
      when not l.fk_exists then 'La columna existe, pero no tiene una FK acreditada hacia el padre esperado.'
      when not l.validated_fk_exists then 'Existe FK, pero no esta validada.'
      else 'Relacion esperada presente y validada.'
    end::text as finding,
    pg_catalog.format('fk_exists=%s; validated_fk_exists=%s', l.fk_exists, l.validated_fk_exists)::text as evidence
  from expected_link_state l
),
-- Cuenta tambien relaciones esperadas que aun no tengan FK. Asi se pueden
-- detectar huerfanos antes de decidir si es seguro validar una restriccion.
expected_link_count_queries as (
  select
    l.*,
    pg_catalog.query_to_xml(
      pg_catalog.format(
        'select count(*) filter (where child.%I is not null and parent.%I is null) as orphan_count, count(*) filter (where child.%I is null) as null_link_count from %s child left join %s parent on child.%I = parent.%I',
        l.child_column,
        l.parent_column,
        l.child_column,
        l.child_oid::pg_catalog.regclass,
        l.parent_oid::pg_catalog.regclass,
        l.child_column,
        l.parent_column
      ),
      true,
      false,
      ''
    ) as counts_xml
  from expected_link_state l
  where l.child_oid is not null
    and l.parent_oid is not null
    and l.child_attnum is not null
    and l.parent_attnum is not null
),
expected_link_counts as (
  select q.*,
         pg_catalog.coalesce(
           ((pg_catalog.xpath('/table/row/orphan_count/text()', q.counts_xml))[1]::text)::bigint,
           0::bigint
         ) as orphan_count,
         pg_catalog.coalesce(
           ((pg_catalog.xpath('/table/row/null_link_count/text()', q.counts_xml))[1]::text)::bigint,
           0::bigint
         ) as null_link_count
  from expected_link_count_queries q
),
expected_link_count_rows as (
  select
    '10 VINCULOS_Y_HUERFANOS_ESPERADOS'::text as section,
    'EXPECTED_LINK_COUNT'::text as object_type,
    pg_catalog.format('public.%I.%I -> public.%I.%I', l.child_table, l.child_column, l.parent_table, l.parent_column)::text as object_name,
    'recuento_sin_datos_personales'::text as check_name,
    case
      when l.orphan_count > 0 then 'FAIL'
      when l.link_required and l.null_link_count > 0 then 'FAIL'
      when not l.link_required and l.null_link_count > 0 then 'INFO'
      else 'PASS'
    end::text as status,
    case
      when l.orphan_count > 0 then 'CRITICAL'
      when l.link_required and l.null_link_count > 0 then 'HIGH'
      else 'INFO'
    end::text as severity,
    case
      when l.orphan_count > 0 then 'Existen valores de relacion sin fila padre.'
      when l.link_required and l.null_link_count > 0 then 'Existen filas sin el vinculo requerido para aplicar autorizacion heredada.'
      when not l.link_required and l.null_link_count > 0 then 'Hay filas sin vinculo opcional; no pueden heredar autorizacion desde un partido.'
      else 'Todas las filas tienen una relacion valida conforme al alcance esperado.'
    end::text as finding,
    pg_catalog.format(
      'required=%s; orphan_count=%s; null_link_count=%s; fk_exists=%s; fk_validated=%s; no se muestran filas',
      l.link_required,
      l.orphan_count,
      l.null_link_count,
      l.fk_exists,
      l.validated_fk_exists
    )::text as evidence
  from expected_link_counts l
),
-- Construye recuentos agregados para cada FK real del grafo. query_to_xml solo
-- ejecuta el SELECT generado a partir de identificadores del propio catalogo.
fk_count_queries as (
  select
    fk.*,
    predicates.join_predicate,
    predicates.all_child_not_null,
    predicates.any_child_not_null,
    predicates.first_parent_column,
    pg_catalog.query_to_xml(
      pg_catalog.format(
        'select count(*) filter (where (%s) and parent.%I is null) as orphan_count, count(*) filter (where (%s) and not (%s)) as partial_null_count from %s child left join %s parent on %s',
        predicates.all_child_not_null,
        predicates.first_parent_column,
        predicates.any_child_not_null,
        predicates.all_child_not_null,
        fk.conrelid::pg_catalog.regclass,
        fk.confrelid::pg_catalog.regclass,
        predicates.join_predicate
      ),
      true,
      false,
      ''
    ) as counts_xml
  from fk_source fk
  cross join lateral (
    select
      pg_catalog.string_agg(
        pg_catalog.format('child.%I = parent.%I', child_attr.attname, parent_attr.attname),
        ' and ' order by keys.ordinality
      ) as join_predicate,
      pg_catalog.string_agg(
        pg_catalog.format('child.%I is not null', child_attr.attname),
        ' and ' order by keys.ordinality
      ) as all_child_not_null,
      pg_catalog.string_agg(
        pg_catalog.format('child.%I is not null', child_attr.attname),
        ' or ' order by keys.ordinality
      ) as any_child_not_null,
      (pg_catalog.array_agg(parent_attr.attname order by keys.ordinality))[1] as first_parent_column
    from pg_catalog.unnest(fk.conkey, fk.confkey) with ordinality
      as keys(child_attnum, parent_attnum, ordinality)
    join pg_catalog.pg_attribute child_attr
      on child_attr.attrelid = fk.conrelid and child_attr.attnum = keys.child_attnum
    join pg_catalog.pg_attribute parent_attr
      on parent_attr.attrelid = fk.confrelid and parent_attr.attnum = keys.parent_attnum
  ) predicates
),
fk_counts as (
  select q.*,
         pg_catalog.coalesce(
           ((pg_catalog.xpath('/table/row/orphan_count/text()', q.counts_xml))[1]::text)::bigint,
           0::bigint
         ) as orphan_count,
         pg_catalog.coalesce(
           ((pg_catalog.xpath('/table/row/partial_null_count/text()', q.counts_xml))[1]::text)::bigint,
           0::bigint
         ) as partial_null_count
  from fk_count_queries q
),
orphan_rows as (
  select
    '11 HUERFANOS_FK_ADICIONALES'::text as section,
    'FOREIGN_KEY_COUNT'::text as object_type,
    pg_catalog.format('%s.%I', fk.conrelid::pg_catalog.regclass, fk.conname)::text as object_name,
    'filas_sin_padre'::text as check_name,
    case when fk.orphan_count > 0 then 'FAIL'
         when fk.partial_null_count > 0 then 'WARN'
         else 'PASS' end::text as status,
    case when fk.orphan_count > 0 then 'CRITICAL'
         when fk.partial_null_count > 0 then 'MEDIUM'
         else 'INFO' end::text as severity,
    case when fk.orphan_count > 0 then 'Existen claves completas sin fila padre.'
         when fk.partial_null_count > 0 then 'Existen claves compuestas parcialmente nulas; revisar si son validas para el modelo.'
         else 'No se detectan huerfanos ni claves compuestas parcialmente nulas.' end::text as finding,
    pg_catalog.format(
      'child=%s; parent=%s; orphan_count=%s; partial_null_count=%s; no se muestran datos de filas',
      fk.conrelid::pg_catalog.regclass,
      fk.confrelid::pg_catalog.regclass,
      fk.orphan_count,
      fk.partial_null_count
    )::text as evidence
  from fk_counts fk
),
detail_rows as (
  select * from table_state_rows
  union all select * from policy_rows
  union all select * from policy_combination_rows
  union all select * from table_privilege_rows
  union all select * from function_rows
  union all select * from function_staff_scope_rows
  union all select * from function_search_path_rows
  union all select * from player_function_rows
  union all select * from fk_rows
  union all select * from expected_link_rows
  union all select * from expected_link_count_rows
  union all select * from orphan_rows
),
summary_rows as (
  select
    '00 RESUMEN'::text as section,
    'AUDIT'::text as object_type,
    'CAMBIO_38'::text as object_name,
    'decision_para_avanzar'::text as check_name,
    case
      when pg_catalog.count(*) filter (where severity in ('CRITICAL', 'HIGH') and status in ('FAIL', 'WARN', 'NOT_FOUND')) > 0
        then 'BLOCKED'
      else 'REVIEW'
    end::text as status,
    case
      when pg_catalog.count(*) filter (where severity = 'CRITICAL' and status in ('FAIL', 'WARN', 'NOT_FOUND')) > 0
        then 'CRITICAL'
      when pg_catalog.count(*) filter (where severity = 'HIGH' and status in ('FAIL', 'WARN', 'NOT_FOUND')) > 0
        then 'HIGH'
      else 'INFO'
    end::text as severity,
    case
      when pg_catalog.count(*) filter (where severity in ('CRITICAL', 'HIGH') and status in ('FAIL', 'WARN', 'NOT_FOUND')) > 0
        then 'No avanzar a cambios RLS hasta revisar todos los hallazgos CRITICAL/HIGH.'
      else 'Sin bloqueos automaticos; requiere revision humana antes de avanzar.'
    end::text as finding,
    pg_catalog.format(
      'rows=%s; critical=%s; high=%s; medium=%s; fail=%s; warn=%s; not_found=%s',
      pg_catalog.count(*),
      pg_catalog.count(*) filter (where severity = 'CRITICAL'),
      pg_catalog.count(*) filter (where severity = 'HIGH'),
      pg_catalog.count(*) filter (where severity = 'MEDIUM'),
      pg_catalog.count(*) filter (where status = 'FAIL'),
      pg_catalog.count(*) filter (where status = 'WARN'),
      pg_catalog.count(*) filter (where status = 'NOT_FOUND')
    )::text as evidence
  from detail_rows
)
select section, object_type, object_name, check_name, status, severity, finding, evidence
from (
  select * from summary_rows
  union all
  select * from detail_rows
) audit
order by section, object_type, object_name, check_name;
