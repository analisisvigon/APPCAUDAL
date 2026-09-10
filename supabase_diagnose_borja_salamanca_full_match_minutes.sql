-- Diagnostico de solo lectura para el backfill puntual de Borja Rodriguez
-- vs Salamanca CF UDS, 09/09/2026. No modifica ningun dato.

with
params as (
  select
    '2e0146e9-e9fc-45ad-b055-edc138a85f7e'::uuid as expected_player_id,
    'Borja Rodríguez'::text as expected_player_name,
    date '2026-09-09' as expected_match_date,
    'Salamanca CF UDS'::text as expected_opponent
),
players_by_signal as (
  select
    player.id,
    player.name,
    player.id = params.expected_player_id as id_matches,
    pg_catalog.lower(pg_catalog.btrim(coalesce(player.name, '')))
      = pg_catalog.lower(pg_catalog.btrim(params.expected_player_name)) as name_matches
  from public.jugadores player
  cross join params
  where player.id = params.expected_player_id
     or pg_catalog.lower(pg_catalog.btrim(coalesce(player.name, '')))
          = pg_catalog.lower(pg_catalog.btrim(params.expected_player_name))
     or pg_catalog.lower(coalesce(player.name, '')) like '%borja%'
),
matches_by_signal as (
  select
    match_row.id,
    match_row.date,
    match_row.opponent,
    match_row.home_score,
    match_row.away_score,
    match_row.status,
    match_row.stats_system,
    match_row.date = params.expected_match_date as date_matches,
    pg_catalog.lower(pg_catalog.btrim(coalesce(match_row.opponent, '')))
      = pg_catalog.lower(params.expected_opponent) as opponent_matches
  from public.partidos match_row
  cross join params
  where match_row.date = params.expected_match_date
     or pg_catalog.lower(pg_catalog.btrim(coalesce(match_row.opponent, '')))
          = pg_catalog.lower(params.expected_opponent)
     or pg_catalog.lower(coalesce(match_row.opponent, '')) like '%salamanca%'
),
exact_matches as (
  select match_row.*
  from matches_by_signal match_row
  where match_row.date_matches
    and match_row.opponent_matches
),
focus_match as (
  select match_row.*
  from matches_by_signal match_row
  order by
    (match_row.date_matches and match_row.opponent_matches) desc,
    match_row.date_matches desc,
    match_row.opponent_matches desc,
    match_row.date desc nulls last,
    match_row.id
  limit 1
),
focus_player as (
  select player.*
  from players_by_signal player
  order by player.id_matches desc, player.name_matches desc, player.id
  limit 1
),
stats_rows_for_focus as (
  select
    stats.id,
    stats.partido_id,
    stats.jugador_id,
    stats.player_name,
    stats.role,
    stats.minutes,
    stats.replacement_name
  from public.partido_estadisticas_jugador stats
  join focus_match match_row on match_row.id = stats.partido_id
  cross join params
  where stats.jugador_id = params.expected_player_id
     or stats.jugador_id in (select player.id from players_by_signal player)
     or pg_catalog.lower(pg_catalog.btrim(coalesce(stats.player_name, '')))
          = pg_catalog.lower(pg_catalog.btrim(params.expected_player_name))
     or pg_catalog.lower(coalesce(stats.player_name, '')) like '%borja%'
),
focus_stats_row as (
  select stats.*
  from stats_rows_for_focus stats
  cross join params
  order by
    (stats.jugador_id = params.expected_player_id) desc,
    (pg_catalog.lower(pg_catalog.btrim(coalesce(stats.player_name, '')))
      = pg_catalog.lower(pg_catalog.btrim(params.expected_player_name))) desc,
    stats.id
  limit 1
),
lineup_rows_for_focus as (
  select
    lineup.partido_id,
    lineup.scope,
    lineup.slot,
    lineup.jugador_id,
    lineup.player_name
  from public.partido_alineacion_slots lineup
  join focus_match match_row on match_row.id = lineup.partido_id
  cross join params
  where lineup.jugador_id = params.expected_player_id
     or lineup.jugador_id in (select player.id from players_by_signal player)
     or pg_catalog.lower(pg_catalog.btrim(coalesce(lineup.player_name, '')))
          = pg_catalog.lower(pg_catalog.btrim(params.expected_player_name))
     or pg_catalog.lower(coalesce(lineup.player_name, '')) like '%borja%'
),
exact_identity_stats as (
  select stats.*
  from public.partido_estadisticas_jugador stats
  join exact_matches match_row on match_row.id = stats.partido_id
  join public.jugadores player
    on player.id = (select params.expected_player_id from params)
  where stats.jugador_id = player.id
     or (
       stats.jugador_id is null
       and pg_catalog.lower(pg_catalog.btrim(stats.player_name))
         = pg_catalog.lower(pg_catalog.btrim(player.name))
     )
),
original_candidates as (
  select stats.id, stats.partido_id, stats.jugador_id, stats.player_name
  from public.partido_estadisticas_jugador stats
  join public.partidos match_row on match_row.id = stats.partido_id
  join public.jugadores player
    on player.id = (select params.expected_player_id from params)
  cross join params
  where match_row.date = params.expected_match_date
    and pg_catalog.lower(pg_catalog.btrim(match_row.opponent))
      = pg_catalog.lower(params.expected_opponent)
    and pg_catalog.btrim(coalesce(match_row.home_score::text, '')) ~ '^[0-9]+$'
    and pg_catalog.btrim(coalesce(match_row.away_score::text, '')) ~ '^[0-9]+$'
    and pg_catalog.lower(pg_catalog.btrim(coalesce(match_row.status, ''))) not in (
      'aplazado', 'postponed', 'suspendido', 'suspended',
      'cancelado', 'cancelled', 'canceled'
    )
    and stats.minutes is null
    and pg_catalog.lower(pg_catalog.btrim(coalesce(stats.role, ''))) = 'titular'
    and nullif(pg_catalog.btrim(coalesce(stats.replacement_name, '')), '') is null
    and (
      stats.jugador_id = player.id
      or (
        stats.jugador_id is null
        and pg_catalog.lower(pg_catalog.btrim(stats.player_name))
          = pg_catalog.lower(pg_catalog.btrim(player.name))
      )
    )
    and exists (
      select 1
      from public.partido_alineacion_slots lineup
      where lineup.partido_id = stats.partido_id
        and lineup.scope = 'stats'
        and (
          lineup.jugador_id = player.id
          or (
            lineup.jugador_id is null
            and pg_catalog.lower(pg_catalog.btrim(lineup.player_name))
              = pg_catalog.lower(pg_catalog.btrim(player.name))
          )
        )
    )
),
substitution_events_for_focus as (
  select
    stats.id as source_stats_row_id,
    stats.partido_id,
    stats.minutes as minute,
    stats.jugador_id as player_out_id,
    stats.player_name as player_out_name,
    (
      select incoming.id
      from public.jugadores incoming
      where pg_catalog.lower(pg_catalog.btrim(incoming.name))
        = pg_catalog.lower(pg_catalog.btrim(stats.replacement_name))
      order by incoming.id
      limit 1
    ) as player_in_id,
    stats.replacement_name as player_in_name,
    case
      when stats.jugador_id = params.expected_player_id
        or stats.jugador_id in (select player.id from players_by_signal player)
        or pg_catalog.lower(pg_catalog.btrim(coalesce(stats.player_name, '')))
             = pg_catalog.lower(pg_catalog.btrim(params.expected_player_name))
        then 'sale'
      when pg_catalog.lower(pg_catalog.btrim(coalesce(stats.replacement_name, '')))
             = pg_catalog.lower(pg_catalog.btrim(params.expected_player_name))
        or exists (
          select 1
          from players_by_signal player
          where pg_catalog.lower(pg_catalog.btrim(coalesce(stats.replacement_name, '')))
            = pg_catalog.lower(pg_catalog.btrim(coalesce(player.name, '')))
        )
        then 'entra'
    end as borja_direction
  from public.partido_estadisticas_jugador stats
  join focus_match match_row on match_row.id = stats.partido_id
  cross join params
  where nullif(pg_catalog.btrim(coalesce(stats.replacement_name, '')), '') is not null
    and (
      stats.jugador_id = params.expected_player_id
      or stats.jugador_id in (select player.id from players_by_signal player)
      or pg_catalog.lower(pg_catalog.btrim(coalesce(stats.player_name, '')))
           = pg_catalog.lower(pg_catalog.btrim(params.expected_player_name))
      or pg_catalog.lower(pg_catalog.btrim(coalesce(stats.replacement_name, '')))
           = pg_catalog.lower(pg_catalog.btrim(params.expected_player_name))
      or exists (
        select 1
        from players_by_signal player
        where pg_catalog.lower(pg_catalog.btrim(coalesce(stats.replacement_name, '')))
          = pg_catalog.lower(pg_catalog.btrim(coalesce(player.name, '')))
      )
    )
),
checks as (
  select
    exists (select 1 from matches_by_signal match_row where match_row.date_matches) as match_date_matches,
    exists (select 1 from matches_by_signal match_row where match_row.opponent_matches) as opponent_matches,
    exists (select 1 from exact_matches) as match_found,
    (select pg_catalog.count(*) from exact_matches) = 1 as match_is_unambiguous,
    exists (
      select 1 from public.jugadores player cross join params
      where player.id = params.expected_player_id
    ) as player_found,
    exists (
      select 1 from public.jugadores player cross join params
      where player.id = params.expected_player_id
        and pg_catalog.lower(pg_catalog.btrim(coalesce(player.name, '')))
          = pg_catalog.lower(pg_catalog.btrim(params.expected_player_name))
    ) as expected_uuid_has_expected_name,
    exists (
      select 1 from public.jugadores player cross join params
      where pg_catalog.lower(pg_catalog.btrim(coalesce(player.name, '')))
        = pg_catalog.lower(pg_catalog.btrim(params.expected_player_name))
    ) as player_found_by_name,
    exists (
      select 1
      from public.partido_estadisticas_jugador stats
      join exact_matches match_row on match_row.id = stats.partido_id
      cross join params
      where stats.jugador_id = params.expected_player_id
         or pg_catalog.lower(pg_catalog.btrim(coalesce(stats.player_name, '')))
              = pg_catalog.lower(pg_catalog.btrim(params.expected_player_name))
    ) as stats_row_found,
    exists (select 1 from exact_identity_stats) as stats_identity_matches,
    exists (
      select 1 from exact_identity_stats stats
      where pg_catalog.lower(pg_catalog.btrim(coalesce(stats.role, ''))) = 'titular'
    ) as role_is_titular,
    exists (select 1 from exact_identity_stats stats where stats.minutes is null) as minutes_is_null,
    exists (
      select 1 from exact_identity_stats stats
      where nullif(pg_catalog.btrim(coalesce(stats.replacement_name, '')), '') is null
    ) as replacement_name_is_blank,
    exists (
      select 1
      from exact_matches match_row
      where pg_catalog.btrim(coalesce(match_row.home_score::text, '')) ~ '^[0-9]+$'
        and pg_catalog.btrim(coalesce(match_row.away_score::text, '')) ~ '^[0-9]+$'
    ) as match_score_known,
    exists (
      select 1
      from exact_matches match_row
      where pg_catalog.lower(pg_catalog.btrim(coalesce(match_row.status, ''))) not in (
        'aplazado', 'postponed', 'suspendido', 'suspended',
        'cancelado', 'cancelled', 'canceled'
      )
    ) as match_status_allowed,
    exists (
      select 1
      from public.partido_alineacion_slots lineup
      join exact_matches match_row on match_row.id = lineup.partido_id
      join public.jugadores player
        on player.id = (select params.expected_player_id from params)
      where lineup.jugador_id = player.id
         or (
           lineup.jugador_id is null
           and pg_catalog.lower(pg_catalog.btrim(lineup.player_name))
             = pg_catalog.lower(pg_catalog.btrim(player.name))
         )
    ) as in_any_lineup_scope,
    exists (
      select 1
      from public.partido_alineacion_slots lineup
      join exact_matches match_row on match_row.id = lineup.partido_id
      join public.jugadores player
        on player.id = (select params.expected_player_id from params)
      where lineup.scope = 'stats'
        and (
          lineup.jugador_id = player.id
          or (
            lineup.jugador_id is null
            and pg_catalog.lower(pg_catalog.btrim(lineup.player_name))
              = pg_catalog.lower(pg_catalog.btrim(player.name))
          )
        )
    ) as in_stats_lineup,
    exists (
      select 1 from substitution_events_for_focus event_row
      where event_row.borja_direction = 'sale'
    ) as has_exit_event,
    exists (
      select 1 from substitution_events_for_focus event_row
      where event_row.borja_direction = 'entra'
    ) as has_entry_event,
    (select pg_catalog.count(*)::integer from original_candidates) as candidate_count,
    (select pg_catalog.count(*) from original_candidates) = 1 as candidate_is_unambiguous
)
select
  checks.*,
  90::integer as backfill_assumed_duration,
  false as duration_90_verified_from_database,
  pg_catalog.array_remove(array[
    case when not checks.match_date_matches then 'match_date_matches' end,
    case when not checks.opponent_matches then 'opponent_matches' end,
    case when not checks.match_found then 'match_found' end,
    case when not checks.match_is_unambiguous then 'match_is_unambiguous' end,
    case when not checks.player_found then 'player_found' end,
    case when not checks.stats_row_found then 'stats_row_found' end,
    case when not checks.stats_identity_matches then 'stats_identity_matches' end,
    case when not checks.role_is_titular then 'role_is_titular' end,
    case when not checks.minutes_is_null then 'minutes_is_null' end,
    case when not checks.replacement_name_is_blank then 'replacement_name_is_blank' end,
    case when not checks.match_score_known then 'match_score_known' end,
    case when not checks.match_status_allowed then 'match_status_allowed' end,
    case when not checks.in_stats_lineup then 'in_stats_lineup' end,
    case when not checks.candidate_is_unambiguous then 'candidate_is_unambiguous' end
  ]::text[], null) as failed_preconditions,
  (select match_row.id from focus_match match_row) as partido_id,
  (select match_row.date from focus_match match_row) as actual_date,
  (select match_row.opponent from focus_match match_row) as actual_opponent,
  (select match_row.home_score from focus_match match_row) as actual_home_score,
  (select match_row.away_score from focus_match match_row) as actual_away_score,
  (select match_row.status from focus_match match_row) as actual_status,
  (select match_row.stats_system from focus_match match_row) as actual_stats_system,
  (select player.id from focus_player player) as canonical_jugador_id,
  (select player.name from focus_player player) as canonical_player_name,
  (select stats.jugador_id from focus_stats_row stats) as stats_jugador_id,
  (select stats.player_name from focus_stats_row stats) as stats_player_name,
  (select stats.role from focus_stats_row stats) as actual_role,
  (select stats.minutes from focus_stats_row stats) as actual_minutes,
  (select stats.replacement_name from focus_stats_row stats) as actual_replacement_name,
  coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', player.id,
        'name', player.name,
        'id_matches', player.id_matches,
        'name_matches', player.name_matches
      ) order by player.id_matches desc, player.name_matches desc, player.id
    )
    from players_by_signal player
  ), '[]'::jsonb) as possible_players,
  coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', match_row.id,
        'date', match_row.date,
        'opponent', match_row.opponent,
        'home_score', match_row.home_score,
        'away_score', match_row.away_score,
        'status', match_row.status,
        'stats_system', match_row.stats_system,
        'date_matches', match_row.date_matches,
        'opponent_matches', match_row.opponent_matches
      ) order by
        (match_row.date_matches and match_row.opponent_matches) desc,
        match_row.date desc nulls last,
        match_row.id
    )
    from matches_by_signal match_row
  ), '[]'::jsonb) as possible_matches,
  coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', stats.id,
        'partido_id', stats.partido_id,
        'jugador_id', stats.jugador_id,
        'player_name', stats.player_name,
        'role', stats.role,
        'minutes', stats.minutes,
        'minutes_is_null', stats.minutes is null,
        'replacement_name', stats.replacement_name
      ) order by stats.id
    )
    from stats_rows_for_focus stats
  ), '[]'::jsonb) as stats_rows_found,
  coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'scope', lineup.scope,
        'slot', lineup.slot,
        'jugador_id', lineup.jugador_id,
        'player_name', lineup.player_name
      ) order by lineup.scope, lineup.slot
    )
    from lineup_rows_for_focus lineup
  ), '[]'::jsonb) as lineup_rows_found,
  coalesce((
    select pg_catalog.jsonb_agg(scope_row.scope order by scope_row.scope)
    from (
      select distinct lineup.scope
      from public.partido_alineacion_slots lineup
      join focus_match match_row on match_row.id = lineup.partido_id
    ) scope_row
  ), '[]'::jsonb) as all_lineup_scopes_for_match,
  coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'source_table', 'partido_estadisticas_jugador',
        'source_stats_row_id', event_row.source_stats_row_id,
        'direction', event_row.borja_direction,
        'minute', event_row.minute,
        'player_out_id', event_row.player_out_id,
        'player_out_name', event_row.player_out_name,
        'player_in_id', event_row.player_in_id,
        'player_in_name', event_row.player_in_name
      ) order by event_row.minute, event_row.source_stats_row_id
    )
    from substitution_events_for_focus event_row
  ), '[]'::jsonb) as substitution_events_found,
  coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'snapshot_id', snapshot_row.id,
        'minute', snapshot_row.minute,
        'period', snapshot_row.period,
        'system', snapshot_row.system,
        'reason', snapshot_row.reason,
        'is_complete', snapshot_row.is_complete,
        'source_system_event_id', snapshot_row.source_system_event_id,
        'slot', snapshot_slot.slot,
        'jugador_id', snapshot_slot.jugador_id,
        'player_name_snapshot', snapshot_slot.player_name_snapshot
      ) order by snapshot_row.minute, snapshot_slot.slot
    )
    from public.partido_snapshots_tacticos snapshot_row
    join public.partido_snapshot_tactico_slots snapshot_slot
      on snapshot_slot.snapshot_id = snapshot_row.id
    join focus_match match_row on match_row.id = snapshot_row.partido_id
    cross join params
    where snapshot_slot.jugador_id = params.expected_player_id
       or snapshot_slot.jugador_id in (select player.id from players_by_signal player)
       or pg_catalog.lower(pg_catalog.btrim(coalesce(snapshot_slot.player_name_snapshot, '')))
            = pg_catalog.lower(pg_catalog.btrim(params.expected_player_name))
       or pg_catalog.lower(coalesce(snapshot_slot.player_name_snapshot, '')) like '%borja%'
  ), '[]'::jsonb) as tactical_snapshot_rows_found,
  coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', quick_event.id,
        'jugador_id', quick_event.jugador_id,
        'equipo', quick_event.equipo,
        'tipo_evento', quick_event.tipo_evento,
        'minuto', quick_event.minuto
      ) order by quick_event.minuto, quick_event.id
    )
    from public.match_quick_events quick_event
    join focus_match match_row on match_row.id = quick_event.partido_id
    cross join params
    where quick_event.jugador_id = params.expected_player_id
       or quick_event.jugador_id in (select player.id from players_by_signal player)
  ), '[]'::jsonb) as quick_timeline_rows_found,
  coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', system_event.id,
        'minute', system_event.minute,
        'period', system_event.period,
        'from_system', system_event.from_system,
        'to_system', system_event.to_system,
        'note', system_event.note
      ) order by system_event.minute, system_event.id
    )
    from public.partido_eventos_sistema system_event
    join focus_match match_row on match_row.id = system_event.partido_id
  ), '[]'::jsonb) as system_timeline_rows_found
from checks;
