-- TRANSICION 02 / INVENTARIO ACOTADO. SOLO LECTURA.
-- Revisar manualmente antes del corte en el proyecto de ensayo. Busca
-- referencias a Plantilla/Partidos para hallar RPC SECURITY DEFINER que no
-- esten en el repositorio. La coincidencia textual es INVENTARIO, no prueba
-- de autorizacion. No devuelve cuerpos de funciones ni filas deportivas.
select p.oid::regprocedure as routine, p.prosecdef as security_definer,
  p.proowner::regrole as owner,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_executes,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_executes
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosecdef
  and p.prosrc ~* '(jugadores|partidos|club_team_season_players|player_team_memberships|players_database|equipos_rivales|competitions)'
order by p.oid::regprocedure::text;

-- Triggers de las tablas del primer espacio: detectar funciones adicionales
-- con efectos indirectos que deban probarse bajo un JWT authenticated.
select c.relname as table_name,t.tgname as trigger_name,
  t.tgenabled as enabled,t.tgfoid::regprocedure as routine,
  p.prosecdef as security_definer
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
join pg_proc p on p.oid=t.tgfoid
where n.nspname='public' and not t.tgisinternal
  and c.relname in ('jugadores','partidos','partido_estadisticas_jugador',
    'partido_eventos_gol','match_quick_events','partido_alineacion_slots',
    'partido_eventos_sistema','partido_snapshots_tacticos',
    'partido_snapshot_tactico_slots','partido_eventos_post',
    'partido_convocados','partido_notas_individuales_pre',
    'partido_eventos_sustitucion','match_set_piece_takers',
    'match_set_piece_notes','match_set_piece_diagrams',
    'players_database','player_team_memberships',
    'club_team_season_players','legacy_jugador_cts_links_v1')
order by c.relname,t.tgname;
