-- SOLO LECTURA. Ejecutar MANUALMENTE en un proyecto Supabase nuevo de ensayo.
-- Confirmar visualmente el project ref en el panel antes de usar el SQL de datos.
select object_name, present from (values
 ('nexoclub_04c_staging_guard', to_regclass('public.nexoclub_04c_staging_guard') is not null),
 ('clubs', to_regclass('public.clubs') is not null),
 ('club_memberships', to_regclass('public.club_memberships') is not null),
 ('club_teams', to_regclass('public.club_teams') is not null),
 ('club_seasons', to_regclass('public.club_seasons') is not null),
 ('club_team_seasons', to_regclass('public.club_team_seasons') is not null),
 ('club_team_season_players', to_regclass('public.club_team_season_players') is not null),
 ('legacy_jugador_cts_links_v1', to_regclass('public.legacy_jugador_cts_links_v1') is not null),
 ('equipos_rivales', to_regclass('public.equipos_rivales') is not null),
 ('players_database', to_regclass('public.players_database') is not null),
 ('player_team_memberships', to_regclass('public.player_team_memberships') is not null),
 ('jugadores', to_regclass('public.jugadores') is not null),
 ('partidos', to_regclass('public.partidos') is not null),
 ('my_access_contexts_v1', to_regprocedure('public.my_access_contexts_v1()') is not null),
 ('my_cts_jugadores_v1', to_regprocedure('public.my_cts_jugadores_v1(uuid)') is not null),
 ('my_cts_matches_v1', to_regprocedure('public.my_cts_matches_v1(uuid)') is not null)
) checks(object_name,present);

-- Debe existir exactamente el marcador 04C y la base deportiva debe estar
-- vacia antes del primer seed. Ejecutar solo tras instalar el guard.
select (select count(*) from public.nexoclub_04c_staging_guard
        where marker = 'EMPTY_FIXTURE_04B_ONLY') = 1 as staging_guard_valid,
       (select count(*) from auth.users) = 5 as exactly_five_test_users,
       (select count(*) from public.clubs) = 0 as no_existing_clubs,
       (select count(*) from public.equipos_rivales) = 0 as no_existing_teams,
       (select count(*) from public.jugadores) = 0 as no_existing_players,
       (select count(*) from public.partidos) = 0 as no_existing_matches;

select indexname, indexdef from pg_indexes
where schemaname='public' and indexname='equipos_rivales_one_own_club_uidx';

-- Los cinco usuarios se crean antes en Authentication > Users.
select email, id from auth.users where email in (
 'owner-04b@example.invalid','staff-a-04b@example.invalid',
 'staff-b-04b@example.invalid','outsider-04b@example.invalid',
 'player-04b@example.invalid') order by email;

-- Ensayo nuevo: estos nombres no deben existir ya.
select name from public.clubs where name in ('ENSAYO 04B A','ENSAYO 04B B');
