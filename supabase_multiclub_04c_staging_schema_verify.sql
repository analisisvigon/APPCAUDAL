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
 ('jugadores_rivales', to_regclass('public.jugadores_rivales') is not null),
 ('equipo_rival_alineacion', to_regclass('public.equipo_rival_alineacion') is not null),
 ('equipo_rival_banquillo', to_regclass('public.equipo_rival_banquillo') is not null),
 ('partido_alineacion_slots', to_regclass('public.partido_alineacion_slots') is not null),
 ('partido_eventos_sustitucion', to_regclass('public.partido_eventos_sustitucion') is not null),
 ('competitions', to_regclass('public.competitions') is not null),
 ('partido_estadisticas_jugador', to_regclass('public.partido_estadisticas_jugador') is not null),
 ('my_access_contexts_v1', to_regprocedure('public.my_access_contexts_v1()') is not null),
 ('my_cts_matches_v1', to_regprocedure('public.my_cts_matches_v1(uuid)') is not null),
 ('my_cts_jugadores_v1', to_regprocedure('public.my_cts_jugadores_v1(uuid)') is not null),
 ('my_cts_roster_links_v1', to_regprocedure('public.my_cts_roster_links_v1(uuid)') is not null),
 ('can_read_club_team_season', to_regprocedure('public.can_read_club_team_season(uuid)') is not null),
 ('can_write_club_team_season', to_regprocedure('public.can_write_club_team_season(uuid)') is not null),
 ('can_read_match', to_regprocedure('public.can_read_match(uuid)') is not null),
 ('can_write_match', to_regprocedure('public.can_write_match(uuid)') is not null),
 ('get_match_substitution_events', to_regprocedure('public.get_match_substitution_events(uuid)') is not null),
 ('mutate_match_substitution_atomic', to_regprocedure('public.mutate_match_substitution_atomic(text,uuid,uuid,jsonb,integer)') is not null),
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
 'jugadores','partidos','club_memberships','club_team_season_players',
 'jugadores_rivales','equipo_rival_alineacion','equipo_rival_banquillo',
 'partido_estadisticas_jugador','competitions')
group by c.relname,c.relrowsecurity order by c.relname;

-- Contratos de relaciones que usan las RPC y el seed. La consulta informa
-- nombres y definiciones reales; no da por buenas FK ausentes o no validadas.
select child.relname as child_table, k.conname, k.convalidated,
       pg_get_constraintdef(k.oid, true) as definition
from pg_constraint k
join pg_class child on child.oid = k.conrelid
join pg_class parent on parent.oid = k.confrelid
where k.contype = 'f' and child.relnamespace = 'public'::regnamespace
  and ((child.relname = 'partidos' and parent.relname in ('competitions','club_team_seasons'))
    or (child.relname = 'partido_estadisticas_jugador'
        and parent.relname in ('partidos','jugadores'))
    or (child.relname = 'partido_eventos_sustitucion'
        and parent.relname in ('partidos','jugadores')))
order by child.relname, k.conname;

-- S1/S2: el usuario anon debe carecer de privilegios efectivos de tabla.
-- Las politicas legacy para authenticated siguen siendo un riesgo hasta 03C.
select c.relname as table_name,
       has_table_privilege('anon',c.oid,'SELECT') as anon_select,
       has_table_privilege('anon',c.oid,'INSERT') as anon_insert,
       has_table_privilege('anon',c.oid,'UPDATE') as anon_update,
       has_table_privilege('anon',c.oid,'DELETE') as anon_delete,
       has_table_privilege('anon',c.oid,'TRUNCATE') as anon_truncate,
       has_table_privilege('anon',c.oid,'REFERENCES') as anon_references,
       has_table_privilege('anon',c.oid,'TRIGGER') as anon_trigger
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('jugadores','jugadores_rivales',
                    'equipo_rival_alineacion','equipo_rival_banquillo')
order by c.relname;

-- Indicio de que 03C NO se aplico. Comparar las expresiones exactas con el
-- preflight 03; el mero recuento de politicas no acredita seguridad.
select tablename, policyname, cmd, qual, with_check
from pg_policies where schemaname='public'
  and tablename in ('jugadores','partidos')
order by tablename, policyname;

select to_regclass('public.nexoclub_04c_staging_guard') is not null
  as staging_guard_installed;
