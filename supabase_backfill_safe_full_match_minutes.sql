-- Backfill general, transaccional e idempotente para titulares historicos SAFE.
-- No ejecutado. Solo modifica partido_estadisticas_jugador.minutes.

begin;

do $backfill$
declare
  safe_count integer;
  updated_count integer;
begin
  with
  runtime as (
    select (pg_catalog.now() at time zone 'Europe/Madrid')::date as madrid_today
  ),
  raw_candidates as (
    select
      stats.id as stats_row_id,
      stats.partido_id,
      stats.jugador_id,
      stats.player_name,
      player.name as canonical_player_name,
      pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(stats.player_name, '')), '[[:space:]]+', ' ', 'g')) as player_name_key,
      pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(player.name, '')), '[[:space:]]+', ' ', 'g')) as canonical_name_key,
      match_row.date as match_date,
      match_row.home_score,
      match_row.away_score,
      match_row.status as match_status
    from public.partido_estadisticas_jugador stats
    join public.partidos match_row on match_row.id = stats.partido_id
    join public.jugadores player on player.id = stats.jugador_id
    where pg_catalog.lower(pg_catalog.btrim(coalesce(stats.role, ''))) = 'titular'
      and nullif(pg_catalog.btrim(stats.minutes::text), '') is null
      and nullif(pg_catalog.btrim(coalesce(stats.replacement_name, '')), '') is null
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
      end as computed_duration
    from candidate_matches candidate_match
    left join stats_match_metrics stats_metric on stats_metric.partido_id = candidate_match.partido_id
    left join snapshot_match_metrics snapshot_metric on snapshot_metric.partido_id = candidate_match.partido_id
    left join system_event_metrics system_metric on system_metric.partido_id = candidate_match.partido_id
  ),
  safe_candidates as (
    select candidate.stats_row_id, duration_metric.computed_duration
    from raw_candidates candidate
    join duration_metrics duration_metric on duration_metric.partido_id = candidate.partido_id
    cross join runtime
    where candidate.match_date is not null
      and candidate.match_date < runtime.madrid_today
      and pg_catalog.btrim(coalesce(candidate.home_score::text, '')) ~ '^[0-9]+$'
      and pg_catalog.btrim(coalesce(candidate.away_score::text, '')) ~ '^[0-9]+$'
      and pg_catalog.lower(pg_catalog.btrim(coalesce(candidate.match_status, ''))) not in (
        'aplazado', 'postponed', 'suspendido', 'suspended',
        'cancelado', 'cancelled', 'canceled'
      )
      and candidate.jugador_id is not null
      and candidate.player_name_key = candidate.canonical_name_key
      and (
        select pg_catalog.count(*)
        from public.jugadores player_peer
        where pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(player_peer.name, '')), '[[:space:]]+', ' ', 'g'))
          = candidate.canonical_name_key
      ) = 1
      and (
        select pg_catalog.count(*)
        from public.partido_estadisticas_jugador stats_peer
        where stats_peer.partido_id = candidate.partido_id
          and (
            stats_peer.jugador_id = candidate.jugador_id
            or pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(stats_peer.player_name, '')), '[[:space:]]+', ' ', 'g'))
                 = candidate.player_name_key
          )
      ) = 1
      and (
        select pg_catalog.count(*)
        from public.partido_alineacion_slots lineup
        where lineup.partido_id = candidate.partido_id
          and lineup.scope = 'stats'
          and lineup.jugador_id = candidate.jugador_id
      ) = 1
      and not exists (
        select 1
        from public.partido_alineacion_slots lineup
        where lineup.partido_id = candidate.partido_id
          and lineup.scope = 'stats'
          and lineup.jugador_id is null
          and pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(lineup.player_name, '')), '[[:space:]]+', ' ', 'g'))
            in (candidate.player_name_key, candidate.canonical_name_key)
      )
      and not exists (
        select 1
        from public.partido_estadisticas_jugador outgoing
        where outgoing.partido_id = candidate.partido_id
          and outgoing.id <> candidate.stats_row_id
          and nullif(pg_catalog.btrim(coalesce(outgoing.replacement_name, '')), '') is not null
          and pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(outgoing.replacement_name), '[[:space:]]+', ' ', 'g'))
            in (candidate.player_name_key, candidate.canonical_name_key)
      )
      and duration_metric.computed_duration is not null
      and duration_metric.invalid_minutes_count = 0
      and duration_metric.invalid_complete_snapshot_count = 0
      and duration_metric.invalid_system_event_minute_count = 0
      and not exists (
        select 1
        from public.partido_snapshots_tacticos snapshot_row
        where snapshot_row.partido_id = candidate.partido_id
          and snapshot_row.is_complete
          and not exists (
            select 1
            from public.partido_snapshot_tactico_slots snapshot_slot
            where snapshot_slot.snapshot_id = snapshot_row.id
              and snapshot_slot.jugador_id = candidate.jugador_id
          )
      )
      and not exists (
        select 1
        from public.partido_snapshot_tactico_slots snapshot_slot
        join public.partido_snapshots_tacticos snapshot_row on snapshot_row.id = snapshot_slot.snapshot_id
        where snapshot_row.partido_id = candidate.partido_id
          and snapshot_slot.jugador_id is null
          and pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(snapshot_slot.player_name_snapshot, '')), '[[:space:]]+', ' ', 'g'))
            in (candidate.player_name_key, candidate.canonical_name_key)
      )
      and not exists (
        select 1
        from (
          select snapshot_row.id
          from public.partido_snapshots_tacticos snapshot_row
          join public.partido_snapshot_tactico_slots snapshot_slot on snapshot_slot.snapshot_id = snapshot_row.id
          where snapshot_row.partido_id = candidate.partido_id
            and snapshot_slot.jugador_id = candidate.jugador_id
          group by snapshot_row.id
          having pg_catalog.count(*) <> 1
        ) duplicated_snapshot
      )
  ),
  updated_rows as (
    update public.partido_estadisticas_jugador stats
    set minutes = safe_candidate.computed_duration::text
    from safe_candidates safe_candidate
    where stats.id = safe_candidate.stats_row_id
      and pg_catalog.lower(pg_catalog.btrim(coalesce(stats.role, ''))) = 'titular'
      and nullif(pg_catalog.btrim(stats.minutes::text), '') is null
      and nullif(pg_catalog.btrim(coalesce(stats.replacement_name, '')), '') is null
    returning stats.id
  )
  select
    (select pg_catalog.count(*)::integer from safe_candidates),
    (select pg_catalog.count(*)::integer from updated_rows)
  into safe_count, updated_count;

  if updated_count <> safe_count then
    raise exception 'Backfill abortado: SAFE=% pero actualizadas=%', safe_count, updated_count;
  end if;

  raise notice 'Backfill completado: % filas SAFE actualizadas', updated_count;
end
$backfill$;

commit;
