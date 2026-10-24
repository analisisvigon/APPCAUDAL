-- TRANSICION 02 / CORTE FUTURO. SOLO LECTURA.
-- Ejecutar manualmente SOLO despues del corte y comparar con su preflight.
select active.club_team_season_id, active.writes_enabled,
       active.guard_version = 1 as guard_version_enabled,
       exists (select 1 from public.operational_guard_versions_v1
         where version=1) as guard_marker_present,
       season.status as season_status,
       season.is_active as season_active,
       membership.role as designated_owner_role,
       membership.is_active as designated_owner_active
from public.operational_cts_v1 active
join public.club_team_seasons cts on cts.id = active.club_team_season_id
join public.club_seasons season on season.id = cts.season_id
join public.club_memberships membership on membership.user_id = active.owner_user_id
  and membership.club_id = cts.club_id;

select p.prosecdef as security_definer,
       p.proowner = 'postgres'::regrole as owned_by_postgres,
       'search_path=pg_catalog' = any(p.proconfig) as fixed_search_path
from pg_proc p where p.oid =
  to_regprocedure('public.can_write_club_team_season(uuid)');

-- Estas ACL cierran el DML directo de identidades/vinculos canónicos.
with target(name) as (values ('players_database'),('player_positions'),
  ('player_sources'),('player_scouting_traits'),
  ('player_team_memberships'),('club_team_season_players'),
  ('legacy_jugador_cts_links_v1'),('legacy_own_player_migration'))
select name,
  not (has_table_privilege('authenticated',to_regclass(format('public.%I',name)),'INSERT')
    or has_table_privilege('authenticated',to_regclass(format('public.%I',name)),'UPDATE')
    or has_table_privilege('authenticated',to_regclass(format('public.%I',name)),'DELETE'))
    as authenticated_dml_revoked,
  not (has_table_privilege('anon',to_regclass(format('public.%I',name)),'INSERT')
    or has_table_privilege('anon',to_regclass(format('public.%I',name)),'UPDATE')
    or has_table_privilege('anon',to_regclass(format('public.%I',name)),'DELETE'))
    as anon_dml_revoked
from target order by name;

-- TRUNCATE no dispara las guardas de fila; debe estar revocado en todas.
with target(name) as (values
  ('jugadores'),('partidos'),('partido_estadisticas_jugador'),
  ('partido_eventos_gol'),('match_quick_events'),('partido_alineacion_slots'),
  ('partido_eventos_sistema'),('partido_snapshots_tacticos'),
  ('partido_snapshot_tactico_slots'),('partido_eventos_post'),
  ('partido_convocados'),('partido_notas_individuales_pre'),
  ('partido_eventos_sustitucion'),('match_set_piece_takers'),
  ('match_set_piece_notes'),('match_set_piece_diagrams'),
  ('club_team_season_players'),('legacy_jugador_cts_links_v1'),
  ('player_team_memberships'),('players_database'),('player_positions'),
  ('player_sources'),('player_scouting_traits'),
  ('legacy_own_player_migration'),('equipos_rivales'),('jugadores_rivales'),
  ('equipo_rival_alineacion'),('equipo_rival_banquillo'),('competitions')
)
select name,
  not has_table_privilege('authenticated',to_regclass(format('public.%I',name)),
    'TRUNCATE') as authenticated_cannot_truncate,
  not has_table_privilege('anon',to_regclass(format('public.%I',name)),
    'TRUNCATE') as anon_cannot_truncate
from target order by name;

select tablename, policyname, permissive, cmd, qual, with_check
from pg_policies where schemaname = 'public' and tablename in
  ('jugadores','partidos','partido_estadisticas_jugador',
   'partido_eventos_gol','match_quick_events','partido_alineacion_slots',
   'partido_eventos_sistema','partido_snapshots_tacticos',
   'partido_snapshot_tactico_slots','partido_eventos_post',
   'partido_convocados','partido_notas_individuales_pre',
   'partido_eventos_sustitucion','match_set_piece_takers',
   'match_set_piece_notes','match_set_piece_diagrams')
order by tablename, policyname;

-- Esta comprobacion de catalogo NO sustituye pruebas como usuarios
-- authenticated de Libia, Caudal, sin acceso y PLAYER, con INSERT/UPDATE/
-- DELETE directos y mediante las RPC antiguas y nuevas.
