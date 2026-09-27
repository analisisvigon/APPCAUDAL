-- Solo lectura: inventario de slots de snapshots sin identidad canónica.
-- Incluye partidos registrados en public.partidos; no repara ni propone escrituras.
with missing_slots as (
  select
    match_row.id as partido_id,
    match_row.date as match_date,
    match_row.opponent,
    snapshot.id as snapshot_id,
    snapshot.minute,
    snapshot.system,
    snapshot.is_complete,
    slot.slot,
    slot.jugador_id,
    slot.player_name_snapshot
  from public.partidos match_row
  join public.partido_snapshots_tacticos snapshot on snapshot.partido_id = match_row.id
  join public.partido_snapshot_tactico_slots slot on slot.snapshot_id = snapshot.id
  where slot.jugador_id is null
    and nullif(pg_catalog.btrim(slot.player_name_snapshot), '') is not null
), roster_candidates as (
  select
    missing_slots.*,
    candidate.candidate_ids,
    candidate.candidate_count
  from missing_slots
  left join lateral (
    select
      pg_catalog.array_agg(roster.id order by roster.id) as candidate_ids,
      pg_catalog.count(*)::integer as candidate_count
    from public.jugadores roster
    where pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(roster.name), '[[:space:]]+', ' ', 'g'))
      = pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(missing_slots.player_name_snapshot), '[[:space:]]+', ' ', 'g'))
  ) candidate on true
)
select
  partido_id,
  match_date,
  opponent,
  snapshot_id,
  minute,
  system,
  is_complete,
  slot,
  jugador_id,
  player_name_snapshot,
  coalesce(candidate_ids, array[]::uuid[]) as exact_normalized_name_candidate_ids,
  coalesce(candidate_count, 0) as exact_normalized_name_candidate_count
from roster_candidates
order by match_date desc nulls last, opponent, minute, slot;
