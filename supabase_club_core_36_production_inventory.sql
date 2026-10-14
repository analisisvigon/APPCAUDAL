-- APPCAUDAL / Cambio 5A: inventario de producción exclusivamente de lectura.
-- Ejecutar el archivo completo en Supabase SQL Editor. El único resultado es
-- una tabla exportable a CSV; no se prueban permisos con service_role.
-- Las columnas de negocio se inspeccionan en pg_catalog o mediante to_jsonb:
-- ninguna columna opcional se referencia directamente.
-- Un partido SIN_VINCULO_DIRECTO_ACREDITADO no se asigna a ninguna temporada.

with
target_tables(table_name, area) as (
  values
    ('clubs', 'nucleo'),
    ('club_seasons', 'nucleo'),
    ('club_teams', 'nucleo'),
    ('club_team_seasons', 'nucleo'),
    ('club_team_season_permissions', 'nucleo'),
    ('club_memberships', 'nucleo'),
    ('equipos_rivales', 'equipos'),
    ('jugadores', 'plantilla'),
    ('jugadores_rivales', 'plantilla'),
    ('players_database', 'plantilla'),
    ('player_team_memberships', 'plantilla'),
    ('player_positions', 'plantilla'),
    ('player_sources', 'plantilla'),
    ('player_scouting_traits', 'plantilla'),
    ('legacy_own_player_migration', 'plantilla'),
    ('competitions', 'partidos'),
    ('partidos', 'partidos'),
    ('partido_convocados', 'partidos'),
    ('partido_estadisticas_jugador', 'partidos'),
    ('partido_eventos_gol', 'partidos'),
    ('match_quick_events', 'partidos'),
    ('partido_alineacion_slots', 'partidos'),
    ('partido_eventos_sistema', 'partidos'),
    ('partido_eventos_sustitucion', 'partidos'),
    ('partido_eventos_post', 'partidos'),
    ('partido_notas_individuales_pre', 'partidos'),
    ('partido_snapshots_tacticos', 'partidos'),
    ('partido_snapshot_tactico_slots', 'partidos'),
    ('match_set_piece_takers', 'partidos'),
    ('match_set_piece_notes', 'partidos'),
    ('match_set_piece_diagrams', 'partidos'),
    ('jugador_suspension_consumptions', 'partidos'),
    ('training_sessions', 'rendimiento'),
    ('training_session_load_metrics', 'rendimiento'),
    ('wellness_entries', 'rendimiento'),
    ('rpe_entries', 'rendimiento'),
    ('rpe_sync_pending', 'rendimiento'),
    ('physio_treatments', 'rendimiento'),
    ('training_tasks', 'entrenamientos'),
    ('training_task_shares', 'entrenamientos'),
    ('training_task_feedback', 'entrenamientos'),
    ('training_task_media', 'entrenamientos'),
    ('training_library', 'entrenamientos'),
    ('rival_scouting_profiles', 'rivales'),
    ('rival_scouting_player_profiles', 'rivales'),
    ('rival_scouting_evidence', 'rivales'),
    ('rival_scouting_connections', 'rivales'),
    ('rival_scouting_legacy_imports', 'rivales')
),
objects as (
  select t.area, t.table_name,
         pg_catalog.to_regclass(pg_catalog.format('public.%I', t.table_name)) as relation_oid
  from target_tables t
),
table_rows as (
  select '01 TABLAS'::text as seccion,
         ('public.' || o.table_name)::text as objeto,
         'existencia_y_rls'::text as detalle,
         case when c.oid is null then 'NO EXISTE'
              else pg_catalog.format('tipo=%s; rls=%s; force_rls=%s; propietario=%s',
                c.relkind, c.relrowsecurity, c.relforcerowsecurity,
                pg_catalog.pg_get_userbyid(c.relowner)) end::text as resultado,
         case when c.oid is null then 'Esperada en el repositorio; comprobar despliegue.'
              else 'Estado efectivo del catálogo, no prueba de identidad.' end::text as observacion
  from objects o
  left join pg_catalog.pg_class c on c.oid = o.relation_oid
),
column_rows as (
  select '02 COLUMNAS'::text as seccion,
         ('public.' || o.table_name)::text as objeto,
         a.attname::text as detalle,
         pg_catalog.format('tipo=%s; not_null=%s; default=%s',
           pg_catalog.format_type(a.atttypid, a.atttypmod), a.attnotnull,
           coalesce(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '<sin default>'))::text as resultado,
         case when o.table_name in
           ('partidos', 'club_seasons', 'club_teams', 'club_team_seasons',
            'club_team_season_permissions', 'competitions',
            'player_team_memberships', 'training_sessions')
           then 'Estructura completa solicitada.'
           else 'Columna relevante para alcance o vínculo.' end::text as observacion
  from objects o
  join pg_catalog.pg_attribute a on a.attrelid = o.relation_oid
    and a.attnum > 0 and not a.attisdropped
  left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid
    and d.adnum = a.attnum
  where o.table_name in
      ('partidos', 'club_seasons', 'club_teams', 'club_team_seasons',
       'club_team_season_permissions', 'competitions',
       'player_team_memberships', 'training_sessions')
     or a.attname ~* '(^|_)(club|team|season|partido|session|snapshot|player|jugador|competition|membership|equipo)(_id|_key)?$'
     or a.attname in ('date', 'entry_date', 'session_date', 'treatment_date',
                      'record_kind', 'team_kind', 'is_current', 'player_visible', 'scope')
),
constraint_rows as (
  select '03 RESTRICCIONES'::text as seccion,
         ('public.' || o.table_name)::text as objeto,
         con.conname::text as detalle,
         pg_catalog.pg_get_constraintdef(con.oid, true)::text as resultado,
         pg_catalog.format('tipo=%s; validada=%s; deferrable=%s; tabla_referenciada=%s',
           con.contype, con.convalidated, con.condeferrable,
           coalesce(con.confrelid::pg_catalog.regclass::text, '-'))::text as observacion
  from objects o
  join pg_catalog.pg_constraint con on con.conrelid = o.relation_oid
  where con.contype in ('p', 'u', 'f', 'c', 'x')
),
index_rows as (
  select '04 INDICES'::text as seccion,
         ('public.' || o.table_name)::text as objeto,
         idx.relname::text as detalle,
         pg_catalog.pg_get_indexdef(i.indexrelid)::text as resultado,
         pg_catalog.format('unique=%s; primary=%s; valid=%s; ready=%s',
           i.indisunique, i.indisprimary, i.indisvalid, i.indisready)::text as observacion
  from objects o
  join pg_catalog.pg_index i on i.indrelid = o.relation_oid
  join pg_catalog.pg_class idx on idx.oid = i.indexrelid
),
policy_source as (
  select o.table_name, p.polname, p.polcmd, p.polpermissive,
         p.polroles, p.polrelid,
         pg_catalog.pg_get_expr(p.polqual, p.polrelid) as using_expr,
         pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) as check_expr
  from objects o
  join pg_catalog.pg_policy p on p.polrelid = o.relation_oid
),
policy_rows as (
  select '05 POLITICAS_RLS'::text as seccion,
         ('public.' || p.table_name)::text as objeto,
         p.polname::text as detalle,
         pg_catalog.format('operacion=%s; modo=%s; roles=%s; using=%s; with_check=%s',
           case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
             when 'w' then 'UPDATE' when 'd' then 'DELETE' else 'ALL' end,
           case when p.polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end,
           coalesce((
             select pg_catalog.string_agg(
               case when role_oid = 0::oid then 'PUBLIC' else coalesce(r.rolname, role_oid::text) end,
               ', ' order by role_oid)
             from pg_catalog.unnest(p.polroles) as polrole(role_oid)
             left join pg_catalog.pg_roles r on r.oid = role_oid
           ), '<sin roles>'),
           coalesce(p.using_expr, '<sin USING>'),
           coalesce(p.check_expr, '<sin WITH CHECK>'))::text as resultado,
         pg_catalog.format('is_app_staff=%s; predicado_true=%s; chequeo_equipo_temporada_explicito=%s; REVISAR: solo análisis textual',
           pg_catalog.strpos(pg_catalog.lower(coalesce(p.using_expr, '') || ' ' || coalesce(p.check_expr, '')), 'is_app_staff') > 0,
           pg_catalog.regexp_replace(pg_catalog.lower(coalesce(p.using_expr, '')),
             '[[:space:]()]', '', 'g') = 'true'
             or pg_catalog.regexp_replace(pg_catalog.lower(coalesce(p.check_expr, '')),
               '[[:space:]()]', '', 'g') = 'true',
           pg_catalog.strpos(pg_catalog.lower(coalesce(p.using_expr, '') || ' ' || coalesce(p.check_expr, '')),
             'can_read_club_team_season') > 0
             or pg_catalog.strpos(pg_catalog.lower(coalesce(p.using_expr, '') || ' ' || coalesce(p.check_expr, '')),
               'club_team_season_permissions') > 0)::text as observacion
  from policy_source p
),
policy_alert_rows as (
  select '05A RLS_SIN_ALCANCE_EXPLICITO'::text as seccion,
         ('public.' || p.table_name)::text as objeto,
         p.polname::text as detalle,
         case
           when pg_catalog.strpos(pg_catalog.lower(coalesce(p.using_expr, '') || ' ' || coalesce(p.check_expr, '')),
                  'is_app_staff') > 0 then 'USA_IS_APP_STAFF'
           when pg_catalog.regexp_replace(pg_catalog.lower(coalesce(p.using_expr, '')),
                  '[[:space:]()]', '', 'g') = 'true'
             or pg_catalog.regexp_replace(pg_catalog.lower(coalesce(p.check_expr, '')),
                  '[[:space:]()]', '', 'g') = 'true' then 'PREDICADO_TRUE'
           else 'OTRO_PREDICADO_SIN_HELPER_EXPLICITO'
         end::text as resultado,
         'Alerta textual, no sentencia de vulnerabilidad: revisar funciones llamadas, rol y políticas OR/RESTRICTIVE.'::text as observacion
  from policy_source p
  join target_tables t on t.table_name = p.table_name
  where t.area in ('partidos', 'plantilla', 'rendimiento')
    and pg_catalog.strpos(pg_catalog.lower(coalesce(p.using_expr, '') || ' ' || coalesce(p.check_expr, '')),
          'can_read_club_team_season') = 0
    and pg_catalog.strpos(pg_catalog.lower(coalesce(p.using_expr, '') || ' ' || coalesce(p.check_expr, '')),
          'club_team_season_permissions') = 0
),
function_candidates as (
  select n.nspname, proc.proname, proc.oid,
         proc.prosecdef, proc.prosrc,
         pg_catalog.pg_get_userbyid(proc.proowner) as owner_name,
         pg_catalog.pg_get_function_identity_arguments(proc.oid) as arguments,
         (
           select pg_catalog.string_agg(t.table_name, ', ' order by t.table_name)
           from target_tables t
           where t.area <> 'nucleo'
             and pg_catalog.strpos(pg_catalog.lower(proc.prosrc), t.table_name) > 0
         ) as mentioned_tables
  from pg_catalog.pg_proc proc
  join pg_catalog.pg_namespace n on n.oid = proc.pronamespace
  where n.nspname = 'public' and proc.prosecdef
),
function_rows as (
  select '06 FUNCIONES_DEFINER'::text as seccion,
         pg_catalog.format('%I.%I(%s)', f.nspname, f.proname, f.arguments)::text as objeto,
         case when f.mentioned_tables is null then 'SIN_MENCION_DIRECTA'
              else 'MENCION_DIRECTA_DEPORTIVA' end::text as detalle,
         pg_catalog.format('owner=%s; menciona=%s', f.owner_name,
           coalesce(f.mentioned_tables, '<ninguna tabla inventariada>'))::text as resultado,
         'Inventario completo de SECURITY DEFINER públicas. La búsqueda textual en prosrc no detecta por sí sola SQL dinámico ni llamadas transitivas.'::text as observacion
  from function_candidates f
),
helper_rows as (
  select '07 HELPERS_AUTORIZACION'::text as seccion,
         pg_catalog.format('%I.%I(%s)', n.nspname, p.proname,
           pg_catalog.pg_get_function_identity_arguments(p.oid))::text as objeto,
         'configuracion'::text as detalle,
         pg_catalog.format('security_definer=%s; owner=%s; search_path=%s',
           p.prosecdef, pg_catalog.pg_get_userbyid(p.proowner),
           coalesce(pg_catalog.array_to_string(p.proconfig, '; '), '<por defecto>'))::text as resultado,
         'Revisar implementación y EXECUTE efectivo antes de cambiar RLS.'::text as observacion
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in
      ('is_app_staff', 'can_read_club_team_season', 'can_edit_club_data',
       'current_membership', 'current_jugador_id', 'is_player')
),
-- public.partidos está confirmado en producción por el contexto recibido.
-- to_jsonb evita usar columnas opcionales directamente en el analizador SQL.
direct_team_season_fks as (
  select con.oid, con.conrelid, con.conkey
  from pg_catalog.pg_constraint con
  where con.conrelid = pg_catalog.to_regclass('public.partidos')
    and con.confrelid = pg_catalog.to_regclass('public.club_team_seasons')
    and con.contype = 'f' and con.convalidated
),
match_rows as (
  select p.id, pg_catalog.to_jsonb(p) as doc
  from public.partidos p
),
match_linkage as (
  select m.id, m.doc,
         exists (
           select 1 from direct_team_season_fks fk
           where not exists (
             select 1
             from pg_catalog.unnest(fk.conkey) as source(source_attnum)
             join pg_catalog.pg_attribute a
               on a.attrelid = fk.conrelid and a.attnum = source_attnum
             where nullif(m.doc ->> a.attname::text, '') is null
           )
         ) as has_valid_direct_fk
  from match_rows m
),
count_rows as (
  select '08 RECUENTOS_PARTIDOS'::text as seccion,
         'public.partidos'::text as objeto,
         'total'::text as detalle,
         pg_catalog.count(*)::text as resultado,
         'Recuento exacto; no atribuye temporada por fecha ni competición.'::text as observacion
  from match_linkage
  union all
  select '08 RECUENTOS_PARTIDOS', 'public.partidos',
         'con_FK_directa_validada_y_no_nula',
         pg_catalog.count(*) filter (where has_valid_direct_fk)::text,
         'Solo acredita FK directa a club_team_seasons; verificar alcance de otras rutas.'
  from match_linkage
  union all
  select '08 RECUENTOS_PARTIDOS', 'public.partidos',
         'SIN_VINCULO_DIRECTO_ACREDITADO',
         pg_catalog.count(*) filter (where not has_valid_direct_fk)::text,
         'No equivale a afirmar que el partido carece de temporada; requiere mapeo manual.'
  from match_linkage
),
competition_count_rows as (
  select '09 PARTIDOS_POR_COMPETICION'::text as seccion,
         'public.partidos'::text as objeto,
         pg_catalog.format('competition_id=%s; competition_key=%s',
           coalesce(doc ->> 'competition_id', '<NULL/no existe>'),
           coalesce(doc ->> 'competition_key', '<NULL/no existe>'))::text as detalle,
         pg_catalog.count(*)::text as resultado,
         'Solo diagnóstico del catálogo; no determina temporada ni equipo.'::text as observacion
  from match_linkage
  group by doc ->> 'competition_id', doc ->> 'competition_key'
),
linkage_evidence_rows as (
  select '10 EVIDENCIA_VINCULO'::text as seccion,
         'public.partidos'::text as objeto,
         'FK_directa_a_club_team_seasons'::text as detalle,
         pg_catalog.count(*)::text as resultado,
         'Cantidad de FK validadas; una columna de fecha o competición no sustituye la relación.'::text as observacion
  from direct_team_season_fks
)
select seccion, objeto, detalle, resultado, observacion
from (
  select * from table_rows
  union all select * from column_rows
  union all select * from constraint_rows
  union all select * from index_rows
  union all select * from policy_rows
  union all select * from policy_alert_rows
  union all select * from function_rows
  union all select * from helper_rows
  union all select * from count_rows
  union all select * from competition_count_rows
  union all select * from linkage_evidence_rows
) inventory
order by seccion, objeto, detalle;
