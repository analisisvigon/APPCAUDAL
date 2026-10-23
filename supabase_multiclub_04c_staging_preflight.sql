-- SOLO LECTURA. Ejecutar manualmente en el proyecto Supabase NUEVO de ensayo
-- antes de instalar cualquier archivo 04C. Todas las casillas deben ser true.
-- Confirmar además visualmente el project ref en el panel: SQL Editor no puede
-- demostrar por sí solo que la pestaña abierta no sea producción.
select current_setting('server_version_num')::integer >= 170000 as postgres_17_or_newer,
       to_regnamespace('extensions') is not null as extensions_schema_present,
       current_user = 'postgres' as sql_editor_postgres,
       auth.uid() is null as no_application_jwt,
       (select count(*) from auth.users)=0 as no_auth_users,
       to_regclass('public.clubs') is null as no_club_core,
       to_regclass('public.equipos_rivales') is null as no_legacy_teams,
       to_regclass('public.jugadores') is null as no_legacy_players,
       to_regclass('public.partidos') is null as no_legacy_matches,
       to_regclass('public.nexoclub_04c_staging_guard') is null as no_prior_fixture;
