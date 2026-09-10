-- Backfill puntual y no ejecutado: Borja Rodríguez vs Salamanca CF UDS, 09/09/2026.
-- La duración canónica de este partido normal es 90. El bloque aborta si la
-- identidad deportiva, el partido finalizado o la participación no son únicos.

begin;

do $backfill$
declare
  candidate_count integer;
  updated_count integer;
begin
  select pg_catalog.count(*)::integer
  into candidate_count
  from public.partido_estadisticas_jugador stats
  join public.partidos match_row
    on match_row.id = stats.partido_id
  join public.jugadores player
    on player.id = '2e0146e9-e9fc-45ad-b055-edc138a85f7e'::uuid
  where match_row.date = date '2026-09-09'
    and pg_catalog.lower(pg_catalog.btrim(match_row.opponent)) = pg_catalog.lower('Salamanca CF UDS')
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
        and pg_catalog.lower(pg_catalog.btrim(stats.player_name)) = pg_catalog.lower(pg_catalog.btrim(player.name))
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
            and pg_catalog.lower(pg_catalog.btrim(lineup.player_name)) = pg_catalog.lower(pg_catalog.btrim(player.name))
          )
        )
    );

  if candidate_count <> 1 then
    raise exception 'Backfill abortado: se esperaba exactamente 1 participación inequívoca de Borja-Salamanca y se encontraron %', candidate_count;
  end if;

  update public.partido_estadisticas_jugador stats
  set minutes = '90'
  from public.partidos match_row, public.jugadores player
  where match_row.id = stats.partido_id
    and player.id = '2e0146e9-e9fc-45ad-b055-edc138a85f7e'::uuid
    and match_row.date = date '2026-09-09'
    and pg_catalog.lower(pg_catalog.btrim(match_row.opponent)) = pg_catalog.lower('Salamanca CF UDS')
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
        and pg_catalog.lower(pg_catalog.btrim(stats.player_name)) = pg_catalog.lower(pg_catalog.btrim(player.name))
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
            and pg_catalog.lower(pg_catalog.btrim(lineup.player_name)) = pg_catalog.lower(pg_catalog.btrim(player.name))
          )
        )
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Backfill abortado: se esperaba actualizar 1 fila y se actualizaron %', updated_count;
  end if;
end
$backfill$;

commit;
