-- NEXO CLUB - diagnóstico de solo lectura para estadísticas de sesiones realizadas.
-- Ejecutar completo en Supabase SQL Editor. No modifica filas ni objetos.
-- Ámbito revisado: Al-Madina SC Sub-23, temporada 2026/2027.

-- 1. Columnas, claves y relaciones instaladas de realización.
select
  c.relname as table_name,
  a.attname as column_name,
  pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
  a.attnotnull as not_null
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
join pg_catalog.pg_attribute a on a.attrelid = c.oid
where n.nspname = 'public'
  and c.relname in ('planned_session_realizations', 'planned_session_realized_player_statuses')
  and a.attnum > 0
  and not a.attisdropped
order by c.relname, a.attnum;

select
  c.conrelid::regclass::text as table_name,
  c.conname,
  c.contype,
  pg_catalog.pg_get_constraintdef(c.oid) as definition
from pg_catalog.pg_constraint c
where c.conrelid in (
  'public.planned_session_realizations'::regclass,
  'public.planned_session_realized_player_statuses'::regclass,
  'public.planned_session_player_roster'::regclass
)
order by c.conrelid::regclass::text, c.conname;

-- 2. Sesiones del CTS: distingue planificación confirmada de realización persistida.
with params as (
  select '961970c8-0fcf-4c45-94d6-787647619c61'::uuid as cts_id
)
select
  s.id as session_id,
  s.session_date,
  s.planning_state,
  s.cancelled_at,
  s.retired_at,
  r.realized_at,
  r.roster_count as recorded_roster_count,
  r.default_available_count,
  count(distinct roster.player_id) as frozen_roster_count,
  count(distinct final_state.player_id) as final_state_count,
  count(distinct final_state.player_id) filter (
    where final_state.status in ('available', 'adapted')
  ) as participant_count,
  count(distinct final_state.player_id) filter (
    where final_state.status = 'first_team'
  ) as first_team_count
from params p
join public.planned_training_sessions s on s.club_team_season_id = p.cts_id
left join public.planned_session_realizations r on r.session_id = s.id
left join public.planned_session_player_roster roster on roster.session_id = s.id
left join public.planned_session_realized_player_statuses final_state
  on final_state.session_id = s.id
group by s.id, s.session_date, s.planning_state, s.cancelled_at, s.retired_at,
  r.realized_at, r.roster_count, r.default_available_count
order by s.session_date desc, s.id;

-- 3. Correspondencia de cada ficha legacy con la identidad global usada por Sesiones.
with params as (
  select '961970c8-0fcf-4c45-94d6-787647619c61'::uuid as cts_id
), realized_by_player as (
  select
    final_state.player_id,
    count(distinct final_state.session_id) as registered_sessions,
    count(distinct final_state.session_id) filter (
      where final_state.status in ('available', 'adapted')
    ) as completed_sessions
  from params p
  join public.planned_training_sessions s on s.club_team_season_id = p.cts_id
  join public.planned_session_realizations realization on realization.session_id = s.id
  join public.planned_session_realized_player_statuses final_state
    on final_state.session_id = realization.session_id
  where s.cancelled_at is null and s.retired_at is null
  group by final_state.player_id
)
select
  ficha.id as legacy_jugador_id,
  ficha.name as legacy_name,
  ficha.global_player_id,
  profile.name as global_name,
  roster_link.id as cts_membership_id,
  roster_link.player_id as cts_player_id,
  roster_link.has_departed,
  roster_link.left_on,
  coalesce(stats.registered_sessions, 0) as registered_sessions,
  coalesce(stats.completed_sessions, 0) as completed_sessions,
  (ficha.global_player_id = roster_link.player_id) as identity_matches
from params p
join public.club_team_season_players roster_link
  on roster_link.club_team_season_id = p.cts_id and roster_link.voided_at is null
join public.players_database profile on profile.id = roster_link.player_id
left join public.jugadores ficha on ficha.global_player_id = roster_link.player_id
left join realized_by_player stats on stats.player_id = roster_link.player_id
order by profile.name, ficha.id;

-- 4. Estados finales detallados, con ambas identidades visibles.
with params as (
  select '961970c8-0fcf-4c45-94d6-787647619c61'::uuid as cts_id
)
select
  s.id as session_id,
  s.session_date,
  final_state.player_id as global_player_id,
  profile.name as player_name,
  ficha.id as legacy_jugador_id,
  final_state.status,
  final_state.status_source,
  realization.realized_at
from params p
join public.planned_training_sessions s on s.club_team_season_id = p.cts_id
join public.planned_session_realizations realization on realization.session_id = s.id
join public.planned_session_realized_player_statuses final_state
  on final_state.session_id = realization.session_id
join public.players_database profile on profile.id = final_state.player_id
left join public.jugadores ficha on ficha.global_player_id = final_state.player_id
order by s.session_date desc, profile.name, ficha.id;

-- 5. Inconsistencias que requieren revisión manual; el resultado esperado es cero filas.
with params as (
  select '961970c8-0fcf-4c45-94d6-787647619c61'::uuid as cts_id
), session_counts as (
  select
    s.id as session_id,
    realization.roster_count,
    count(distinct final_state.player_id) as final_state_count
  from params p
  join public.planned_training_sessions s on s.club_team_season_id = p.cts_id
  join public.planned_session_realizations realization on realization.session_id = s.id
  left join public.planned_session_realized_player_statuses final_state
    on final_state.session_id = s.id
  group by s.id, realization.roster_count
)
select
  'realization_count_mismatch'::text as issue,
  counts.session_id::text as reference_id,
  concat('roster_count=', counts.roster_count, ', final_state_count=', counts.final_state_count) as detail
from session_counts counts
where counts.roster_count <> counts.final_state_count
union all
select
  'legacy_global_identity_missing'::text,
  roster_link.player_id::text,
  profile.name
from params p
join public.club_team_season_players roster_link
  on roster_link.club_team_season_id = p.cts_id and roster_link.voided_at is null
join public.players_database profile on profile.id = roster_link.player_id
where not exists (
  select 1 from public.jugadores ficha where ficha.global_player_id = roster_link.player_id
)
order by issue, reference_id;
