-- SOLO LECTURA. Ejecutar MANUALMENTE en el proyecto ENSAYO, despues de
-- reconstruir el esquema y aplicar las migraciones, ANTES del guard/seed.
-- Todos los objetos deben existir. 03C debe seguir ausente.
select object_name, present from (values
 ('clubs', to_regclass('public.clubs') is not null),
 ('club_memberships', to_regclass('public.club_memberships') is not null),
 ('club_teams', to_regclass('public.club_teams') is not null),
 ('club_seasons', to_regclass('public.club_seasons') is not null),
 ('club_team_seasons', to_regclass('public.club_team_seasons') is not null),
 ('club_team_season_permissions', to_regclass('public.club_team_season_permissions') is not null),
 ('club_team_season_players', to_regclass('public.club_team_season_players') is not null),
 ('legacy_jugador_cts_links_v1', to_regclass('public.legacy_jugador_cts_links_v1') is not null),
 ('players_database', to_regclass('public.players_database') is not null),
 ('player_team_memberships', to_regclass('public.player_team_memberships') is not null),
 ('equipos_rivales', to_regclass('public.equipos_rivales') is not null),
 ('jugadores', to_regclass('public.jugadores') is not null),
 ('partidos', to_regclass('public.partidos') is not null),
 ('my_access_contexts_v1', to_regprocedure('public.my_access_contexts_v1()') is not null),
 ('my_cts_matches_v1', to_regprocedure('public.my_cts_matches_v1(uuid)') is not null),
 ('my_cts_jugadores_v1', to_regprocedure('public.my_cts_jugadores_v1(uuid)') is not null),
 ('create_own_player_atomic_v2',
   to_regprocedure('public.create_own_player_atomic_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb)') is not null),
 ('link_existing_global_player_to_cts_v1',
   to_regprocedure('public.link_existing_global_player_to_cts_v1(uuid,uuid)') is not null)
) checks(object_name, present) order by object_name;

select c.relname as table_name, c.relrowsecurity as rls_enabled,
       count(p.policyname) as policy_count
from pg_class c join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p on p.schemaname = n.nspname and p.tablename = c.relname
where n.nspname = 'public' and c.relname in (
 'jugadores','partidos','club_memberships','club_team_season_players')
group by c.relname,c.relrowsecurity order by c.relname;

-- Indicio de que 03C NO se aplico. Comparar las expresiones exactas con el
-- preflight 03; el mero recuento de politicas no acredita seguridad.
select tablename, policyname, cmd, qual, with_check
from pg_policies where schemaname='public'
  and tablename in ('jugadores','partidos')
order by tablename, policyname;

select to_regclass('public.nexoclub_04c_staging_guard') is not null
  as staging_guard_installed;
