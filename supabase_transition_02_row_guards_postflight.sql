-- TRANSICION 02 / GUARDAS: SOLO LECTURA. Ejecutar manualmente tras PREPARE.
-- Todas las filas deben devolver installed=true; active_writes debe ser false.
with expected(table_name, trigger_name, deferred_insert) as (values
  ('jugadores','transition_02_ficha_change_guard',false),
  ('jugadores','transition_02_ficha_insert_guard',true),
  ('partidos','transition_02_row_write_guard',false),
  ('partido_estadisticas_jugador','transition_02_row_write_guard',false),
  ('partido_eventos_gol','transition_02_row_write_guard',false),
  ('match_quick_events','transition_02_row_write_guard',false),
  ('partido_alineacion_slots','transition_02_row_write_guard',false),
  ('partido_eventos_sistema','transition_02_row_write_guard',false),
  ('partido_snapshots_tacticos','transition_02_row_write_guard',false),
  ('partido_snapshot_tactico_slots','transition_02_row_write_guard',false),
  ('partido_eventos_post','transition_02_row_write_guard',false),
  ('partido_convocados','transition_02_row_write_guard',false),
  ('partido_notas_individuales_pre','transition_02_row_write_guard',false),
  ('partido_eventos_sustitucion','transition_02_row_write_guard',false),
  ('match_set_piece_takers','transition_02_row_write_guard',false),
  ('match_set_piece_notes','transition_02_row_write_guard',false),
  ('match_set_piece_diagrams','transition_02_row_write_guard',false),
  ('club_team_season_players','transition_02_row_write_guard',false),
  ('legacy_jugador_cts_links_v1','transition_02_row_write_guard',false),
  ('player_team_memberships','transition_02_stage_change_guard',false),
  ('player_team_memberships','transition_02_stage_insert_guard',true),
  ('players_database','transition_02_change_guard',false),
  ('players_database','transition_02_insert_guard',true),
  ('player_positions','transition_02_change_guard',false),
  ('player_positions','transition_02_insert_guard',true),
  ('player_sources','transition_02_change_guard',false),
  ('player_sources','transition_02_insert_guard',true),
  ('player_scouting_traits','transition_02_change_guard',false),
  ('player_scouting_traits','transition_02_insert_guard',true),
  ('legacy_own_player_migration','transition_02_change_guard',false),
  ('legacy_own_player_migration','transition_02_insert_guard',true),
  ('equipos_rivales','transition_02_global_freeze_guard',false),
  ('jugadores_rivales','transition_02_global_freeze_guard',false),
  ('equipo_rival_alineacion','transition_02_global_freeze_guard',false),
  ('equipo_rival_banquillo','transition_02_global_freeze_guard',false),
  ('competitions','transition_02_global_freeze_guard',false)
)
select e.table_name, e.trigger_name,
  coalesce(t.tgenabled in ('O','A')
    and t.tgfoid=to_regprocedure('public.transition_02_row_write_guard_v1()')
    and (not e.deferred_insert or (t.tgdeferrable and t.tginitdeferred)),false)
      as installed
from expected e
left join pg_trigger t on t.tgrelid=to_regclass(format('public.%I',e.table_name))
  and t.tgname=e.trigger_name
order by e.table_name,e.trigger_name;

select p.prosecdef as security_definer,
  p.proowner='postgres'::regrole as owned_by_postgres,
  coalesce('search_path=pg_catalog'=any(p.proconfig),false) as fixed_search_path,
  not has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_cannot_execute,
  not has_function_privilege('anon',p.oid,'EXECUTE') as anon_cannot_execute
from pg_proc p
where p.oid=to_regprocedure('public.transition_02_row_write_guard_v1()');

select not exists (select 1 from public.operational_cts_v1 where writes_enabled)
    as active_writes_false,
  not exists (select 1 from public.operational_guard_versions_v1)
    as guard_marker_absent;
