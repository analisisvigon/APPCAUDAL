-- Solo lectura. Rellena partido_id y, si los conoces, los dos UUID.
-- No insertar, actualizar, borrar ni ejecutar RPC desde esta consulta.
with params as (
  select
    null::uuid as partido_id,
    null::uuid as palacio_jugador_id,
    null::uuid as davo_jugador_id,
    'Daniel Palacio'::text as palacio_name,
    'Davo'::text as davo_name
), target_events as (
  select
    event.id as event_id,
    event.partido_id,
    match_row.date as match_date,
    match_row.opponent,
    event.minute,
    event.event_order,
    event.outgoing_jugador_id,
    outgoing.name as outgoing_roster_name,
    event.outgoing_name_snapshot,
    event.incoming_jugador_id,
    incoming.name as incoming_roster_name,
    event.incoming_name_snapshot,
    event.reason,
    event.created_at,
    case
      when event.incoming_jugador_id = params.palacio_jugador_id
        or event.outgoing_jugador_id = params.palacio_jugador_id
        or event.incoming_name_snapshot ilike '%' || params.palacio_name || '%'
        or event.outgoing_name_snapshot ilike '%' || params.palacio_name || '%'
        then 'PALACIO'
      else 'COMPARADOR'
    end as target_player
  from public.partido_eventos_sustitucion event
  join public.partidos match_row on match_row.id = event.partido_id
  left join public.jugadores outgoing on outgoing.id = event.outgoing_jugador_id
  left join public.jugadores incoming on incoming.id = event.incoming_jugador_id
  cross join params
  where (params.partido_id is null or event.partido_id = params.partido_id)
    and (
      event.incoming_jugador_id = params.palacio_jugador_id
      or event.outgoing_jugador_id = params.palacio_jugador_id
      or event.incoming_jugador_id = params.davo_jugador_id
      or event.outgoing_jugador_id = params.davo_jugador_id
      or event.incoming_name_snapshot ilike '%' || params.palacio_name || '%'
      or event.outgoing_name_snapshot ilike '%' || params.palacio_name || '%'
      or event.incoming_name_snapshot ilike '%' || params.davo_name || '%'
      or event.outgoing_name_snapshot ilike '%' || params.davo_name || '%'
    )
), nearby_snapshots as (
  select
    event.event_id,
    snapshot.id as snapshot_id,
    snapshot.minute as snapshot_minute,
    snapshot.system,
    snapshot.is_complete,
    snapshot.reason as snapshot_reason
  from target_events event
  join public.partido_snapshots_tacticos snapshot
    on snapshot.partido_id = event.partido_id
   and snapshot.minute between greatest(0, event.minute - 1) and least(130, event.minute + 1)
), event_snapshot_rows as (
  select * from nearby_snapshots
  union all
  select event.event_id, null::uuid, null::smallint, null::text, null::boolean, 'NO SNAPSHOT +/- 1 MIN'::text
  from target_events event
  where not exists (
    select 1 from nearby_snapshots snapshot where snapshot.event_id = event.event_id
  )
)
select
  event.partido_id,
  event.match_date,
  event.opponent,
  event.target_player,
  event.event_id,
  event.minute as event_minute,
  event.event_order,
  event.outgoing_jugador_id,
  event.outgoing_roster_name,
  event.outgoing_name_snapshot,
  event.incoming_jugador_id,
  event.incoming_roster_name,
  event.incoming_name_snapshot,
  event.reason,
  event.created_at,
  snapshot.snapshot_id,
  snapshot.snapshot_minute,
  snapshot.system,
  snapshot.is_complete,
  snapshot.snapshot_reason,
  slot.slot,
  slot.jugador_id as slot_jugador_id,
  slot.player_name_snapshot,
  roster.name as slot_roster_name,
  case
    when snapshot.system = '4-2-3-1' then (array['POR','LD','DFC derecho','DFC izquierdo','LI','Pivote derecho','Pivote izquierdo','Extremo derecho','Mediapunta','Extremo izquierdo','Delantero centro'])[slot.slot + 1]
    when snapshot.system = '4-3-3' then (array['POR','LD','DFC derecho','DFC izquierdo','LI','Pivote','Interior derecho','Interior izquierdo','Extremo derecho','Delantero centro','Extremo izquierdo'])[slot.slot + 1]
    when snapshot.system = '4-4-2' then (array['POR','LD','DFC derecho','DFC izquierdo','LI','Extremo derecho','Interior derecho','Interior izquierdo','Extremo izquierdo','Delantero centro','Delantero centro'])[slot.slot + 1]
    when snapshot.system = '5-3-2' then (array['POR','Carrilero derecho','DFC derecho','DFC central','DFC izquierdo','Carrilero izquierdo','Interior derecho','Mediocentro','Interior izquierdo','Delantero centro','Delantero centro'])[slot.slot + 1]
    when snapshot.system = '5-4-1' then (array['POR','Carrilero izquierdo','Central izquierdo','Central','Central derecho','Carrilero derecho','Extremo izquierdo','Mediocentro','Mediocentro','Extremo derecho','Delantero centro'])[slot.slot + 1]
    else null
  end as derived_position
from target_events event
join event_snapshot_rows snapshot on snapshot.event_id = event.event_id
left join public.partido_snapshot_tactico_slots slot on slot.snapshot_id = snapshot.snapshot_id
left join public.jugadores roster on roster.id = slot.jugador_id
order by event.minute, event.event_order, snapshot.snapshot_minute, slot.slot;
