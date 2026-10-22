-- Solo lectura. Ejecutar manualmente antes de la fase A y guardar resultados.
-- Recuentos y nombres tecnicos; no devuelve nombres ni datos de jugadores.
select object_name, present from (values
  ('jugadores', to_regclass('public.jugadores') is not null),
  ('partidos', to_regclass('public.partidos') is not null),
  ('player_team_memberships', to_regclass('public.player_team_memberships') is not null),
  ('club_team_season_players', to_regclass('public.club_team_season_players') is not null),
  ('club_team_seasons', to_regclass('public.club_team_seasons') is not null),
  ('can_read_club_team_season', to_regprocedure('public.can_read_club_team_season(uuid)') is not null),
  ('can_write_club_team_season', to_regprocedure('public.can_write_club_team_season(uuid)') is not null),
  ('can_read_match', to_regprocedure('public.can_read_match(uuid)') is not null),
  ('can_write_match', to_regprocedure('public.can_write_match(uuid)') is not null)
) objects(object_name, present);

select p.oid::regprocedure as helper, md5(pg_get_functiondef(p.oid)) as definition_hash,
       p.prosecdef as security_definer,
       p.proowner = 'postgres'::regrole as owned_by_postgres,
       'search_path=pg_catalog' = any(p.proconfig) as fixed_search_path,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
where p.oid in (
  to_regprocedure('public.can_read_club_team_season(uuid)'),
  to_regprocedure('public.can_write_club_team_season(uuid)'),
  to_regprocedure('public.can_read_match(uuid)'),
  to_regprocedure('public.can_write_match(uuid)')
);

select to_regclass('public.legacy_jugador_cts_links_v1') is not null
         as phase_a_table_already_exists,
       to_regprocedure('public.can_read_legacy_jugador_v1(uuid,uuid,uuid)') is not null
         as phase_a_read_helper_already_exists,
       md5(pg_get_functiondef(to_regprocedure('public.current_membership()')))
         as legacy_identity_definition_hash;

select
  count(*) filter (where club_team_season_id is null) as matches_without_cts,
  count(*) filter (where club_team_season_id is not null) as matches_with_cts
from public.partidos;

-- Una coincidencia es solo candidata: la atribucion requiere revision humana.
with candidates as (
  select jugador.id,
         count(distinct relation.id) filter (where roster.id is not null)
           as cts_count
  from public.jugadores jugador
  left join public.player_team_memberships stage
    on stage.id = jugador.membership_id
   and stage.player_id = jugador.global_player_id
  left join public.club_team_seasons relation
    on relation.team_id = stage.team_id
  left join public.club_team_season_players roster
    on roster.club_team_season_id = relation.id
   and roster.player_id = jugador.global_player_id
   and roster.voided_at is null
  group by jugador.id
)
select count(*) filter (where cts_count = 0) as fichas_without_canonical_cts,
       count(*) filter (where cts_count = 1) as fichas_with_one_candidate,
       count(*) filter (where cts_count > 1) as fichas_with_multiple_candidates
from candidates;

-- Mostrar TODAS las politicas; una permisiva adicional puede abrir acceso.
select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'jugadores', 'partidos', 'partido_estadisticas_jugador',
    'partido_eventos_gol', 'match_quick_events', 'partido_alineacion_slots',
    'partido_eventos_sistema', 'partido_snapshots_tacticos',
    'partido_snapshot_tactico_slots', 'partido_eventos_post',
    'partido_convocados', 'partido_notas_individuales_pre',
    'partido_eventos_sustitucion'
  )
order by tablename, policyname;

-- Relaciones hijas adicionales de partidos que tambien habria que cerrar.
select conrelid::regclass as child_table, conname as foreign_key
from pg_constraint
where contype = 'f' and confrelid = 'public.partidos'::regclass
order by conrelid::regclass::text, conname;

-- RPC y vistas potencialmente expuestas; revisar definicion y EXECUTE reales.
select p.oid::regprocedure as function_name, p.prosecdef as security_definer,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
       position('is_app_staff' in pg_get_functiondef(p.oid)) > 0 as uses_legacy_staff,
       position('can_write_match' in pg_get_functiondef(p.oid)) > 0 as checks_match_write
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and (pg_get_functiondef(p.oid) ilike '%partidos%'
       or pg_get_functiondef(p.oid) ilike '%jugadores%'
       or pg_get_functiondef(p.oid) ilike '%is_app_staff%')
order by p.oid::regprocedure::text;

select views.schemaname, views.viewname,
       pg_get_userbyid(relation.relowner) as view_owner,
       relation.reloptions as view_options,
       has_table_privilege('authenticated', relation.oid, 'SELECT')
         as authenticated_can_select,
       position('is_app_staff' in definition) > 0 as uses_legacy_staff,
       position('partidos' in definition) > 0 as uses_partidos,
       position('jugadores' in definition) > 0 as uses_jugadores
from pg_views views
join pg_class relation on relation.oid = format('%I.%I', views.schemaname, views.viewname)::regclass
where views.schemaname = 'public' and
  (definition ilike '%is_app_staff%' or definition ilike '%partidos%'
   or definition ilike '%jugadores%')
order by views.viewname;

select schemaname, matviewname
from pg_matviews
where schemaname = 'public'
  and (definition ilike '%partidos%' or definition ilike '%jugadores%')
order by matviewname;
