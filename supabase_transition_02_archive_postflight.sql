-- TRANSICION 02 / CORTE FUTURO. SOLO LECTURA.
-- Ejecutar manualmente SOLO despues del corte y comparar con su preflight.
select active.club_team_season_id, active.writes_enabled,
       season.status as season_status,
       membership.role as designated_owner_role,
       membership.is_active as designated_owner_active
from public.operational_cts_v1 active
join public.club_team_seasons cts on cts.id = active.club_team_season_id
join public.club_seasons season on season.id = cts.season_id
join public.club_memberships membership on membership.user_id = active.owner_user_id
  and membership.club_id = cts.club_id;

select p.prosecdef as security_definer,
       p.proowner = 'postgres'::regrole as owned_by_postgres,
       'search_path=pg_catalog' = any(p.proconfig) as fixed_search_path,
       position('public.operational_cts_v1' in p.prosrc) > 0
         as requires_explicit_operational_cts,
       position('season.status = ''open''' in p.prosrc) > 0
         as requires_open_season
from pg_proc p where p.oid =
  to_regprocedure('public.can_write_club_team_season(uuid)');

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
