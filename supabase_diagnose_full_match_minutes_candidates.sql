-- Diagnostico global, estrictamente de solo lectura, de titulares historicos
-- con minutos no registrados. Los eventos rapidos son solo evidencia.

with
-- SAFE_CLASSIFICATION_BEGIN
runtime as (
  select (pg_catalog.now() at time zone 'Europe/Madrid')::date as madrid_today
),
raw_candidates as (
  select
    stats.id as stats_row_id,
    stats.partido_id,
    match_row.date as match_date,
    match_row.opponent,
    match_row.home_score,
    match_row.away_score,
    match_row.status as match_status,
    match_row.stats_system,
    stats.jugador_id,
    stats.player_name,
    player.name as canonical_player_name,
    stats.role,
    stats.minutes,
    stats.replacement_name,
    pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(stats.player_name, '')), '[[:space:]]+', ' ', 'g')) as player_name_key,
    pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(player.name, '')), '[[:space:]]+', ' ', 'g')) as canonical_name_key
  from public.partido_estadisticas_jugador stats
  join public.partidos match_row on match_row.id = stats.partido_id
  left join public.jugadores player on player.id = stats.jugador_id
  where pg_catalog.lower(pg_catalog.btrim(coalesce(stats.role, ''))) = 'titular'
    and nullif(pg_catalog.btrim(stats.minutes::text), '') is null
),
candidate_matches as (
  select distinct candidate.partido_id
  from raw_candidates candidate
),
normalized_match_stats as (
  select
    stats.*,
    nullif(pg_catalog.btrim(stats.minutes::text), '') as minutes_text,
    case
      when pg_catalog.btrim(coalesce(stats.minutes::text, '')) ~ '^[0-9]{1,3}$' then
        case
          when pg_catalog.btrim(stats.minutes::text)::integer between 0 and 130
            then pg_catalog.btrim(stats.minutes::text)::integer
          else null
        end
      else null
    end as parsed_minutes
  from public.partido_estadisticas_jugador stats
  join candidate_matches candidate_match on candidate_match.partido_id = stats.partido_id
),
stats_match_metrics as (
  select
    stats.partido_id,
    (pg_catalog.count(*) filter (
      where stats.minutes_text is not null and stats.parsed_minutes is null
    ))::integer as invalid_minutes_count,
    pg_catalog.max(stats.parsed_minutes) filter (
      where stats.parsed_minutes > 0
    ) as max_recorded_minutes,
    pg_catalog.max(stats.parsed_minutes) filter (
      where stats.parsed_minutes > 90
        and pg_catalog.lower(pg_catalog.btrim(coalesce(stats.role, ''))) = 'titular'
        and nullif(pg_catalog.btrim(coalesce(stats.replacement_name, '')), '') is null
        and stats.jugador_id is not null
        and exists (
          select 1
          from public.partido_alineacion_slots lineup
          where lineup.partido_id = stats.partido_id
            and lineup.scope = 'stats'
            and lineup.jugador_id = stats.jugador_id
        )
    ) as extended_duration_anchor
  from normalized_match_stats stats
  group by stats.partido_id
),
snapshot_match_metrics as (
  select
    candidate_match.partido_id,
    pg_catalog.max(snapshot_row.minute::integer) as max_snapshot_minute,
    (pg_catalog.count(*) filter (
      where snapshot_row.id is not null
        and snapshot_row.is_complete
        and (
          (select pg_catalog.count(*) from public.partido_snapshot_tactico_slots slot_row where slot_row.snapshot_id = snapshot_row.id) <> 11
          or (select pg_catalog.count(distinct coalesce(
                slot_row.jugador_id::text,
                'name:' || pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(slot_row.player_name_snapshot, '')), '[[:space:]]+', ' ', 'g'))
              )) from public.partido_snapshot_tactico_slots slot_row where slot_row.snapshot_id = snapshot_row.id) <> 11
        )
    ))::integer as invalid_complete_snapshot_count
  from candidate_matches candidate_match
  left join public.partido_snapshots_tacticos snapshot_row
    on snapshot_row.partido_id = candidate_match.partido_id
  group by candidate_match.partido_id
),
system_event_metrics as (
  select
    candidate_match.partido_id,
    pg_catalog.max(
      case
        when pg_catalog.btrim(coalesce(system_event.minute, '')) ~ '^[0-9]{1,3}$' then
          case
            when pg_catalog.btrim(system_event.minute)::integer between 0 and 130
              then pg_catalog.btrim(system_event.minute)::integer
            else null
          end
        else null
      end
    ) as max_system_event_minute,
    (pg_catalog.count(system_event.id) filter (
      where nullif(pg_catalog.btrim(coalesce(system_event.minute, '')), '') is not null
        and not case
          when pg_catalog.btrim(system_event.minute) ~ '^[0-9]{1,3}$'
            then pg_catalog.btrim(system_event.minute)::integer between 0 and 130
          else false
        end
    ))::integer as invalid_system_event_minute_count
  from candidate_matches candidate_match
  left join public.partido_eventos_sistema system_event
    on system_event.partido_id = candidate_match.partido_id
  group by candidate_match.partido_id
),
duration_metrics as (
  select
    candidate_match.partido_id,
    coalesce(stats_metric.invalid_minutes_count, 0) as invalid_minutes_count,
    coalesce(snapshot_metric.invalid_complete_snapshot_count, 0) as invalid_complete_snapshot_count,
    coalesce(system_metric.invalid_system_event_minute_count, 0) as invalid_system_event_minute_count,
    stats_metric.max_recorded_minutes,
    snapshot_metric.max_snapshot_minute,
    system_metric.max_system_event_minute,
    stats_metric.extended_duration_anchor,
    greatest(
      90,
      coalesce(stats_metric.max_recorded_minutes, 0),
      coalesce(snapshot_metric.max_snapshot_minute, 0),
      coalesce(system_metric.max_system_event_minute, 0)
    ) as max_observed_minute,
    case
      when coalesce(stats_metric.invalid_minutes_count, 0) <> 0
        or coalesce(snapshot_metric.invalid_complete_snapshot_count, 0) <> 0
        or coalesce(system_metric.invalid_system_event_minute_count, 0) <> 0
        then null
      when greatest(
        90,
        coalesce(stats_metric.max_recorded_minutes, 0),
        coalesce(snapshot_metric.max_snapshot_minute, 0),
        coalesce(system_metric.max_system_event_minute, 0)
      ) = 90 then 90
      when stats_metric.extended_duration_anchor = greatest(
        coalesce(stats_metric.max_recorded_minutes, 0),
        coalesce(snapshot_metric.max_snapshot_minute, 0),
        coalesce(system_metric.max_system_event_minute, 0)
      ) then stats_metric.extended_duration_anchor
      else null
    end as computed_duration,
    case
      when coalesce(stats_metric.invalid_minutes_count, 0) <> 0
        or coalesce(snapshot_metric.invalid_complete_snapshot_count, 0) <> 0
        or coalesce(system_metric.invalid_system_event_minute_count, 0) <> 0
        then 'not_computable'
      when greatest(
        90,
        coalesce(stats_metric.max_recorded_minutes, 0),
        coalesce(snapshot_metric.max_snapshot_minute, 0),
        coalesce(system_metric.max_system_event_minute, 0)
      ) = 90 then 'canonical_standard_90'
      when stats_metric.extended_duration_anchor = greatest(
        coalesce(stats_metric.max_recorded_minutes, 0),
        coalesce(snapshot_metric.max_snapshot_minute, 0),
        coalesce(system_metric.max_system_event_minute, 0)
      ) then 'confirmed_extended_full_match'
      else 'not_computable'
    end as duration_source
  from candidate_matches candidate_match
  left join stats_match_metrics stats_metric on stats_metric.partido_id = candidate_match.partido_id
  left join snapshot_match_metrics snapshot_metric on snapshot_metric.partido_id = candidate_match.partido_id
  left join system_event_metrics system_metric on system_metric.partido_id = candidate_match.partido_id
),
candidate_evidence as (
  select
    candidate.*,
    runtime.madrid_today,
    duration_metric.invalid_minutes_count,
    duration_metric.invalid_complete_snapshot_count,
    duration_metric.invalid_system_event_minute_count,
    duration_metric.max_recorded_minutes,
    duration_metric.max_snapshot_minute,
    duration_metric.max_system_event_minute,
    duration_metric.max_observed_minute,
    duration_metric.computed_duration,
    duration_metric.duration_source,
    (candidate.match_date is not null and candidate.match_date < runtime.madrid_today) as is_historical_match,
    (
      pg_catalog.btrim(coalesce(candidate.home_score::text, '')) ~ '^[0-9]+$'
      and pg_catalog.btrim(coalesce(candidate.away_score::text, '')) ~ '^[0-9]+$'
    ) as match_score_known,
    pg_catalog.lower(pg_catalog.btrim(coalesce(candidate.match_status, ''))) not in (
      'aplazado', 'postponed', 'suspendido', 'suspended',
      'cancelado', 'cancelled', 'canceled'
    ) as match_status_allowed,
    (candidate.jugador_id is not null and candidate.canonical_player_name is not null) as canonical_player_found,
    (
      candidate.canonical_player_name is not null
      and candidate.player_name_key = candidate.canonical_name_key
    ) as player_name_matches_canonical,
    (
      select pg_catalog.count(*)::integer
      from public.jugadores player_peer
      where pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(player_peer.name, '')), '[[:space:]]+', ' ', 'g'))
        = candidate.canonical_name_key
    ) as canonical_name_count,
    (
      select pg_catalog.count(*)::integer
      from public.partido_estadisticas_jugador stats_peer
      where stats_peer.partido_id = candidate.partido_id
        and (
          (candidate.jugador_id is not null and stats_peer.jugador_id = candidate.jugador_id)
          or pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(stats_peer.player_name, '')), '[[:space:]]+', ' ', 'g'))
               = candidate.player_name_key
        )
    ) as stats_identity_row_count,
    (
      select pg_catalog.count(*)::integer
      from public.partido_alineacion_slots lineup
      where lineup.partido_id = candidate.partido_id
        and lineup.scope = 'stats'
        and candidate.jugador_id is not null
        and lineup.jugador_id = candidate.jugador_id
    ) as stats_lineup_exact_count,
    (
      select pg_catalog.count(*)::integer
      from public.partido_alineacion_slots lineup
      where lineup.partido_id = candidate.partido_id
        and lineup.scope = 'stats'
        and lineup.jugador_id is null
        and pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(lineup.player_name, '')), '[[:space:]]+', ' ', 'g'))
          in (candidate.player_name_key, candidate.canonical_name_key)
    ) as stats_lineup_legacy_count,
    coalesce((
      select pg_catalog.array_agg(distinct lineup.scope::text order by lineup.scope::text)
      from public.partido_alineacion_slots lineup
      where lineup.partido_id = candidate.partido_id
        and (
          (candidate.jugador_id is not null and lineup.jugador_id = candidate.jugador_id)
          or (
            lineup.jugador_id is null
            and pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(lineup.player_name, '')), '[[:space:]]+', ' ', 'g'))
              in (candidate.player_name_key, candidate.canonical_name_key)
          )
        )
    ), array[]::text[]) as real_lineup_scopes,
    nullif(pg_catalog.btrim(coalesce(candidate.replacement_name, '')), '') is not null as has_exit_event,
    exists (
      select 1
      from public.partido_estadisticas_jugador outgoing
      where outgoing.partido_id = candidate.partido_id
        and outgoing.id <> candidate.stats_row_id
        and nullif(pg_catalog.btrim(coalesce(outgoing.replacement_name, '')), '') is not null
        and pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(outgoing.replacement_name), '[[:space:]]+', ' ', 'g'))
          in (candidate.player_name_key, candidate.canonical_name_key)
    ) as has_entry_event,
    (
      select pg_catalog.count(*)::integer
      from public.partido_snapshots_tacticos snapshot_row
      where snapshot_row.partido_id = candidate.partido_id
        and snapshot_row.is_complete
        and not exists (
          select 1
          from public.partido_snapshot_tactico_slots snapshot_slot
          where snapshot_slot.snapshot_id = snapshot_row.id
            and (
              (candidate.jugador_id is not null and snapshot_slot.jugador_id = candidate.jugador_id)
              or (
                snapshot_slot.jugador_id is null
                and pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(snapshot_slot.player_name_snapshot, '')), '[[:space:]]+', ' ', 'g'))
                  in (candidate.player_name_key, candidate.canonical_name_key)
              )
            )
        )
    ) as complete_snapshot_absence_count,
    (
      select pg_catalog.count(*)::integer
      from public.partido_snapshot_tactico_slots snapshot_slot
      join public.partido_snapshots_tacticos snapshot_row on snapshot_row.id = snapshot_slot.snapshot_id
      where snapshot_row.partido_id = candidate.partido_id
        and snapshot_slot.jugador_id is null
        and pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(snapshot_slot.player_name_snapshot, '')), '[[:space:]]+', ' ', 'g'))
          in (candidate.player_name_key, candidate.canonical_name_key)
    ) as snapshot_legacy_identity_count,
    (
      select pg_catalog.count(*)::integer
      from (
        select snapshot_row.id
        from public.partido_snapshots_tacticos snapshot_row
        join public.partido_snapshot_tactico_slots snapshot_slot on snapshot_slot.snapshot_id = snapshot_row.id
        where snapshot_row.partido_id = candidate.partido_id
          and (
            (candidate.jugador_id is not null and snapshot_slot.jugador_id = candidate.jugador_id)
            or (
              snapshot_slot.jugador_id is null
              and pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(snapshot_slot.player_name_snapshot, '')), '[[:space:]]+', ' ', 'g'))
                in (candidate.player_name_key, candidate.canonical_name_key)
            )
          )
        group by snapshot_row.id
        having pg_catalog.count(*) <> 1
      ) duplicated_snapshot
    ) as snapshot_duplicate_identity_count,
    (
      select pg_catalog.max(snapshot_row.minute::integer)
      from public.partido_snapshots_tacticos snapshot_row
      join public.partido_snapshot_tactico_slots snapshot_slot on snapshot_slot.snapshot_id = snapshot_row.id
      where snapshot_row.partido_id = candidate.partido_id
        and (
          (candidate.jugador_id is not null and snapshot_slot.jugador_id = candidate.jugador_id)
          or (
            snapshot_slot.jugador_id is null
            and pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(snapshot_slot.player_name_snapshot, '')), '[[:space:]]+', ' ', 'g'))
              in (candidate.player_name_key, candidate.canonical_name_key)
          )
        )
    ) as last_snapshot_minute,
    (
      select quick_event.minuto
      from public.match_quick_events quick_event
      where quick_event.partido_id = candidate.partido_id
        and candidate.jugador_id is not null
        and quick_event.jugador_id = candidate.jugador_id
      order by quick_event.minuto desc, quick_event.id desc
      limit 1
    ) as last_quick_event_minute,
    (
      select quick_event.tipo_evento
      from public.match_quick_events quick_event
      where quick_event.partido_id = candidate.partido_id
        and candidate.jugador_id is not null
        and quick_event.jugador_id = candidate.jugador_id
      order by quick_event.minuto desc, quick_event.id desc
      limit 1
    ) as last_quick_event_type
  from raw_candidates candidate
  join duration_metrics duration_metric on duration_metric.partido_id = candidate.partido_id
  cross join runtime
),
evaluated as (
  select
    evidence.*,
    (evidence.computed_duration is not null) as duration_computable,
    (
      evidence.complete_snapshot_absence_count = 0
      and evidence.snapshot_duplicate_identity_count = 0
      and evidence.invalid_complete_snapshot_count = 0
      and evidence.snapshot_legacy_identity_count = 0
    ) as snapshots_consistent,
    (
      evidence.is_historical_match
      and evidence.match_score_known
      and evidence.match_status_allowed
    ) as match_played_proven,
    pg_catalog.array_remove(array[
      case when not evidence.is_historical_match then 'MATCH_NOT_HISTORICAL' end,
      case when not evidence.match_score_known then 'MATCH_SCORE_UNKNOWN' end,
      case when not evidence.match_status_allowed then 'MATCH_SPECIAL_STATUS' end,
      case when not evidence.canonical_player_found then 'CANONICAL_PLAYER_NOT_FOUND' end,
      case when not evidence.player_name_matches_canonical then 'PLAYER_NAME_MISMATCH' end,
      case when evidence.canonical_name_count <> 1 then 'PLAYER_NAME_NOT_UNIQUE' end,
      case when evidence.stats_identity_row_count <> 1 then 'STATS_IDENTITY_NOT_UNIQUE' end,
      case when evidence.stats_lineup_exact_count = 0 then 'NOT_IN_STATS_XI' end,
      case when evidence.stats_lineup_exact_count > 1 then 'MULTIPLE_STATS_XI_SLOTS' end,
      case when evidence.stats_lineup_legacy_count <> 0 then 'LEGACY_STATS_XI_IDENTITY' end,
      case when evidence.has_exit_event then 'EXIT_EVENT_FOUND' end,
      case when evidence.has_entry_event then 'ENTRY_EVENT_FOUND' end,
      case when evidence.invalid_minutes_count <> 0 then 'INVALID_MATCH_MINUTES' end,
      case when evidence.invalid_system_event_minute_count <> 0 then 'INVALID_SYSTEM_EVENT_MINUTE' end,
      case when evidence.computed_duration is null then 'DURATION_NOT_COMPUTABLE' end,
      case when evidence.invalid_complete_snapshot_count <> 0 then 'INVALID_COMPLETE_SNAPSHOT' end,
      case when evidence.complete_snapshot_absence_count <> 0 then 'SNAPSHOT_CONTRADICTS_PRESENCE' end,
      case when evidence.snapshot_duplicate_identity_count <> 0 then 'DUPLICATE_PLAYER_IN_SNAPSHOT' end,
      case when evidence.snapshot_legacy_identity_count <> 0 then 'LEGACY_SNAPSHOT_IDENTITY' end
    ]::text[], null) as failed_preconditions
  from candidate_evidence evidence
),
classified as (
  select
    evaluated.*,
    case
      when not evaluated.is_historical_match
        or not evaluated.match_status_allowed
        or evaluated.has_exit_event
        or evaluated.has_entry_event
        then 'REJECTED'
      when not evaluated.match_played_proven
        or not evaluated.canonical_player_found
        or not evaluated.player_name_matches_canonical
        or evaluated.canonical_name_count <> 1
        or evaluated.stats_identity_row_count <> 1
        or evaluated.stats_lineup_exact_count <> 1
        or evaluated.stats_lineup_legacy_count <> 0
        or not evaluated.duration_computable
        or not evaluated.snapshots_consistent
        or evaluated.invalid_minutes_count <> 0
        or evaluated.invalid_system_event_minute_count <> 0
        then 'AMBIGUOUS'
      else 'SAFE'
    end as candidate_status
  from evaluated
)
-- SAFE_CLASSIFICATION_END
select
  (pg_catalog.count(*) over ())::integer as total_candidates,
  (pg_catalog.count(*) filter (where candidate.candidate_status = 'SAFE') over ())::integer as safe_candidates,
  (pg_catalog.count(*) filter (where candidate.candidate_status = 'AMBIGUOUS') over ())::integer as ambiguous_candidates,
  (pg_catalog.count(*) filter (where candidate.candidate_status = 'REJECTED') over ())::integer as rejected_candidates,
  candidate.partido_id,
  candidate.match_date as fecha,
  candidate.opponent as rival,
  candidate.jugador_id,
  candidate.player_name,
  candidate.canonical_player_name,
  candidate.role,
  candidate.minutes as current_minutes,
  candidate.stats_system as sistema,
  candidate.stats_lineup_exact_count = 1 as in_stats_xi,
  candidate.real_lineup_scopes as actual_lineup_scopes,
  candidate.replacement_name,
  candidate.has_exit_event,
  candidate.has_entry_event,
  candidate.last_snapshot_minute,
  candidate.last_quick_event_minute,
  candidate.last_quick_event_type,
  candidate.home_score,
  candidate.away_score,
  candidate.match_score_known,
  candidate.match_status,
  candidate.match_played_proven,
  candidate.duration_computable,
  candidate.duration_source,
  candidate.max_recorded_minutes,
  candidate.max_snapshot_minute,
  candidate.max_system_event_minute,
  candidate.candidate_status,
  candidate.failed_preconditions,
  case when candidate.candidate_status = 'SAFE' then candidate.computed_duration end as proposed_minutes
from classified candidate
order by candidate.match_date, candidate.opponent, candidate.player_name, candidate.stats_row_id;
