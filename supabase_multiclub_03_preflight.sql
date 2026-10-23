-- Multiclub 03: SOLO LECTURA. Ejecutar manualmente ANTES de fase A y repetir
-- antes del corte. Cualquier fila inesperada exige revisar, no inferir CTS.
select object_name, present from (values
  ('my_access_contexts_v1', to_regprocedure('public.my_access_contexts_v1()') is not null),
  ('can_read_match', to_regprocedure('public.can_read_match(uuid)') is not null),
  ('can_write_match', to_regprocedure('public.can_write_match(uuid)') is not null),
  ('legacy_links_02b', to_regclass('public.legacy_jugador_cts_links_v1') is not null),
  ('get_substitutions', to_regprocedure('public.get_match_substitution_events(uuid)') is not null),
  ('mutate_substitutions', to_regprocedure('public.mutate_match_substitution_atomic(text,uuid,uuid,jsonb,integer)') is not null)
) check_list(object_name, present);

select p.oid::regprocedure as function_name, not p.prosecdef as security_invoker,
       p.proowner = 'postgres'::regrole as owned_by_postgres,
       p.proconfig as settings
from pg_proc p where p.oid =
  to_regprocedure('public.save_global_player_profile(jsonb,jsonb,jsonb,jsonb,jsonb)');

-- Comparar este hash con el postflight B: la funcion legacy no se reemplaza.
select md5(pg_get_functiondef(
  to_regprocedure('public.create_own_player_atomic(uuid,jsonb,jsonb,jsonb,jsonb)')))
  as legacy_own_player_create_definition_hash;

-- Comparar con el postflight B: las politicas de estas relaciones no cambian.
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in (
  'players_database', 'player_team_memberships',
  'club_team_season_players', 'legacy_jugador_cts_links_v1'
)
order by tablename, policyname;

select
  (select count(*) from public.partidos where club_team_season_id is null) as matches_without_cts,
  (select count(*) from public.jugadores ficha
   left join public.legacy_jugador_cts_links_v1 binding on binding.jugador_id = ficha.id
   where ficha.active_in_squad and binding.jugador_id is null) as active_roster_without_exact_link,
  (select count(*) from public.legacy_jugador_cts_links_v1 binding
   left join public.club_team_season_players roster on roster.id = binding.club_team_season_player_id
   left join public.jugadores ficha on ficha.id = binding.jugador_id
   left join public.player_team_memberships stage on stage.id = ficha.membership_id
   left join public.club_team_seasons cts on cts.id = roster.club_team_season_id
   where roster.id is null or ficha.id is null or stage.id is null or cts.id is null
     or roster.voided_at is not null
     or roster.player_id is distinct from ficha.global_player_id
     or stage.player_id is distinct from ficha.global_player_id
     or stage.team_id is distinct from cts.team_id)
    as invalid_exact_links;

-- Referencias UUID deportivas existentes. Si hay cruces/huérfanos, no
-- instalar la fase C: resolver manualmente sin reasignar por nombre.
with refs(source, partido_id, jugador_id) as (
  select 'partidos.captain', id, captain_player_id from public.partidos
  union all select 'partidos.gk_primary', id, goalkeeper_protocol_primary_player_id from public.partidos
  union all select 'partidos.gk_secondary', id, goalkeeper_protocol_secondary_player_id from public.partidos
  union all select 'stats', partido_id, jugador_id from public.partido_estadisticas_jugador
  union all select 'lineup', partido_id, jugador_id from public.partido_alineacion_slots
  union all select 'convocados', partido_id, jugador_id from public.partido_convocados
  union all select 'quick_events', partido_id, jugador_id from public.match_quick_events
  union all select 'goals.scorer', partido_id, scorer_id from public.partido_eventos_gol
  union all select 'goals.assistant', partido_id, assistant_id from public.partido_eventos_gol
  union all select 'set_piece_takers', partido_id, jugador_id from public.match_set_piece_takers
  union all select 'snapshot_slots', snapshot.partido_id, slot.jugador_id
    from public.partido_snapshot_tactico_slots slot
    join public.partido_snapshots_tacticos snapshot on snapshot.id = slot.snapshot_id
), checked as (
  select refs.source, refs.partido_id, refs.jugador_id,
    exists (
      select 1 from public.partidos match_row
      join public.legacy_jugador_cts_links_v1 binding on binding.jugador_id = refs.jugador_id
      join public.club_team_season_players roster
        on roster.id = binding.club_team_season_player_id
        and roster.club_team_season_id = match_row.club_team_season_id
        and roster.voided_at is null
      join public.jugadores ficha on ficha.id = binding.jugador_id
        and ficha.global_player_id = roster.player_id
      join public.player_team_memberships stage on stage.id = ficha.membership_id
        and stage.player_id = ficha.global_player_id
      join public.club_team_seasons cts on cts.id = roster.club_team_season_id
        and cts.team_id = stage.team_id
      where match_row.id = refs.partido_id
    ) as same_cts
  from refs where refs.jugador_id is not null
)
select source, count(*) as references_checked,
       count(*) filter (where not same_cts) as missing_or_cross_cts
from checked group by source order by source;

-- Las politicas efectivas, incluidas las permisivas inesperadas, son el contrato
-- a revisar antes de reemplazarlas. No se truncan expresiones.
select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in (
  'jugadores', 'partidos', 'partido_estadisticas_jugador',
  'partido_eventos_gol', 'match_quick_events', 'partido_alineacion_slots',
  'partido_eventos_sistema', 'partido_snapshots_tacticos',
  'partido_snapshot_tactico_slots', 'partido_eventos_post',
  'partido_convocados', 'partido_notas_individuales_pre',
  'partido_eventos_sustitucion', 'match_set_piece_takers',
  'match_set_piece_notes', 'match_set_piece_diagrams'
)
order by tablename, policyname;

-- Contratos de FK de hijos. Si falta alguna FK hacia partidos/snapshots,
-- el corte debe detenerse porque un hijo podria apuntar a otro CTS.
select child.relname as child_table, column_row.attname as child_column,
       parent.relname as parent_table, constraint_row.conname,
       constraint_row.convalidated
from pg_constraint constraint_row
join pg_class child on child.oid = constraint_row.conrelid
join pg_class parent on parent.oid = constraint_row.confrelid
join pg_attribute column_row on column_row.attrelid = child.oid
  and column_row.attnum = any(constraint_row.conkey)
where constraint_row.contype = 'f' and child.relnamespace = 'public'::regnamespace
  and child.relname in (
    'partido_estadisticas_jugador', 'partido_eventos_gol', 'match_quick_events',
    'partido_alineacion_slots', 'partido_eventos_sistema',
    'partido_snapshots_tacticos', 'partido_snapshot_tactico_slots',
    'partido_eventos_post', 'partido_convocados',
    'partido_notas_individuales_pre', 'partido_eventos_sustitucion',
    'match_set_piece_takers', 'match_set_piece_notes', 'match_set_piece_diagrams'
  ) and parent.relname in ('partidos', 'partido_snapshots_tacticos')
order by child.relname, column_row.attname;

-- Solo RPC/vistas que mencionan tablas de esta fase. Revisar los resultados
-- SECURITY DEFINER / vistas expuestas antes de activar segundo club.
select p.oid::regprocedure as routine, p.prosecdef as security_definer,
       p.proowner::regrole as owner,
       p.proconfig as settings,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_executes,
       position('is_app_staff' in p.prosrc) > 0 as uses_legacy_staff_guard
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.prosecdef
  and p.prosrc ~* '(public\.)?(jugadores|partidos|partido_estadisticas_jugador|partido_eventos_gol|match_quick_events|partido_convocados|partido_alineacion_slots|partido_eventos_sustitucion|match_set_piece_takers|match_set_piece_notes|match_set_piece_diagrams)'
order by p.oid::regprocedure::text;

select schemaname, viewname, viewowner,
       position('security_invoker=true' in coalesce(array_to_string(c.reloptions, ','), '')) > 0
         as security_invoker,
       has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_can_select
from pg_views v
join pg_class c on c.oid = (format('%I.%I', v.schemaname, v.viewname))::regclass
where v.schemaname = 'public'
  and v.definition ~* '(jugadores|partidos|partido_estadisticas_jugador|partido_eventos_gol|match_quick_events|match_set_piece_takers|match_set_piece_notes|match_set_piece_diagrams)'
order by viewname;
