import { supabase } from '../lib/supabase.js';
import { getPlayerPositionUsage } from '../utils/playerPositionUsage.js';
import { buildTacticalMatchHistory, getHistoricalSubstitutionMinutes } from '../utils/tacticalSnapshots.js';

const PLAYER_ID = 'f7f5aaeb-e82b-4e6b-8920-694bc32cb6c7';
const runId = new URLSearchParams(window.location.search).get('run') || '';
const rows = (value) => Array.isArray(value) ? value : [];
const groupBy = (items, key) => rows(items).reduce((groups, item) => {
  groups[item[key]] = [...(groups[item[key]] || []), item];
  return groups;
}, {});
const postResult = async (result) => {
  document.querySelector('#audit').textContent = JSON.stringify(result, null, 2);
  await fetch(`http://127.0.0.1:9236/audit?run=${encodeURIComponent(runId)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(result),
  });
};

const run = async () => {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) throw new Error('La sesión de localhost:5173 no está autenticada.');

  const [playerResponse, playerStatsResponse] = await Promise.all([
    supabase.from('jugadores').select('id,name,shirt_name').eq('id', PLAYER_ID).single(),
    supabase.from('partido_estadisticas_jugador').select('*').eq('jugador_id', PLAYER_ID),
  ]);
  if (playerResponse.error) throw playerResponse.error;
  if (playerStatsResponse.error) throw playerStatsResponse.error;
  const player = playerResponse.data;
  const playerStatsRows = rows(playerStatsResponse.data);
  const matchIds = [...new Set(playerStatsRows.map((row) => row.partido_id).filter(Boolean))];
  if (!matchIds.length) throw new Error('El jugador auditado no tiene partidos asociados.');

  const [matchesResponse, allStatsResponse, lineupResponse, systemsResponse, snapshotsResponse] = await Promise.all([
    supabase.from('partidos').select('*').in('id', matchIds),
    supabase.from('partido_estadisticas_jugador').select('*').in('partido_id', matchIds),
    supabase.from('partido_alineacion_slots').select('*').in('partido_id', matchIds).eq('scope', 'stats').order('slot'),
    supabase.from('partido_eventos_sistema').select('*').in('partido_id', matchIds).order('minute'),
    supabase.from('partido_snapshots_tacticos').select('*').in('partido_id', matchIds).order('minute'),
  ]);
  for (const response of [matchesResponse, allStatsResponse, lineupResponse, systemsResponse, snapshotsResponse]) {
    if (response.error) throw response.error;
  }
  const snapshotRows = rows(snapshotsResponse.data);
  const snapshotSlotsResponse = snapshotRows.length
    ? await supabase.from('partido_snapshot_tactico_slots').select('*').in('snapshot_id', snapshotRows.map((snapshot) => snapshot.id)).order('slot')
    : { data: [], error: null };
  if (snapshotSlotsResponse.error) throw snapshotSlotsResponse.error;

  const allStatsByMatchRows = groupBy(allStatsResponse.data, 'partido_id');
  const lineupByMatch = groupBy(lineupResponse.data, 'partido_id');
  const systemsByMatch = groupBy(systemsResponse.data, 'partido_id');
  const snapshotsByMatch = groupBy(snapshotRows, 'partido_id');
  const slotsBySnapshot = groupBy(snapshotSlotsResponse.data, 'snapshot_id');
  const targetMatches = rows(matchesResponse.data).filter((match) => match.competition_key === 'copa_rfef');

  const buildRows = (enableInference) => targetMatches.flatMap((match) => {
    const playerRow = playerStatsRows.find((row) => row.partido_id === match.id);
    if (!playerRow || Number(playerRow.minutes || 0) <= 0) return [];
    const matchStats = Object.fromEntries(rows(allStatsByMatchRows[match.id]).map((stat) => [stat.player_name, {
      role: stat.role || 'Suplente', minutes: stat.minutes ?? '', replacementName: stat.replacement_name || '', jugadorId: stat.jugador_id || '',
    }]));
    const initialSlots = rows(lineupByMatch[match.id]).map((slot) => ({
      slot: Number(slot.slot), playerId: slot.jugador_id || '', playerName: slot.player_name || '',
    }));
    const systemEvents = rows(systemsByMatch[match.id]);
    const snapshots = rows(snapshotsByMatch[match.id]).map((snapshot) => ({
      ...snapshot,
      slots: rows(slotsBySnapshot[snapshot.id]).map((slot) => ({
        slot: Number(slot.slot), playerId: slot.jugador_id || '', playerNameSnapshot: slot.player_name_snapshot || '',
        position: slot.position || slot.tactical_position || '',
      })),
    }));
    const duration = Math.max(90, ...rows(allStatsByMatchRows[match.id]).map((stat) => Number(stat.minutes) || 0));
    const initialSystem = match.stats_system || '4-4-2';
    const history = buildTacticalMatchHistory({
      matchId: match.id, duration, initialSystem, initialSlots, snapshots, systemEvents,
      substitutionMinutes: getHistoricalSubstitutionMinutes(matchStats),
      playerStats: enableInference ? matchStats : {},
    });
    const caudalGoals = Number(match.goals_for ?? (match.is_home ? match.home_score : match.away_score));
    const rivalGoals = Number(match.goals_against ?? (match.is_home ? match.away_score : match.home_score));
    return [{
      matchId: match.id, minutes: Number(playerRow.minutes || 0), role: playerRow.role || '', duration,
      initialSystem, initialSlots, intervals: history.intervals, playerStats: matchStats, systemEvents, snapshots,
      matchMetadata: {
        opponent: match.opponent || '', date: match.date || '', competition: match.competition_key || '',
        venue: match.is_home ? 'Local' : 'Visitante', result: `${caudalGoals}-${rivalGoals}`,
      },
    }];
  });

  const baseline = getPlayerPositionUsage({ playerId: player.id, playerName: player.name, matchRows: buildRows(false) });
  const current = getPlayerPositionUsage({ playerId: player.id, playerName: player.name, matchRows: buildRows(true) });
  const affectedMatchIds = new Set([
    ...baseline.unknownAudit.map((item) => item.matchId),
    ...current.reconstructionAudit.map((item) => item.matchId),
    ...current.unknownAudit.map((item) => item.matchId),
  ]);
  const evidence = buildRows(false).filter((row) => affectedMatchIds.has(row.matchId)).map((row) => ({
    matchId: row.matchId,
    metadata: row.matchMetadata,
    initialSystem: row.initialSystem,
    initialDisposition: row.initialSlots.map((slot) => ({ slot: slot.slot, playerId: slot.playerId, playerName: slot.playerName })),
    playerStats: Object.entries(row.playerStats).map(([name, stat]) => ({
      playerName: name, playerId: stat.jugadorId, role: stat.role, minutes: Number(stat.minutes || 0), replacementName: stat.replacementName,
    })),
    systemEvents: row.systemEvents.map((event) => ({
      id: event.id, minute: Number(event.minute), fromSystem: event.from_system || event.fromSystem || '', toSystem: event.to_system || event.toSystem || '',
    })),
    persistedSnapshots: row.snapshots.map((snapshot) => ({
      id: snapshot.id, minute: Number(snapshot.minute), system: snapshot.system || '', reason: snapshot.reason || '',
      isComplete: Boolean(snapshot.is_complete ?? snapshot.isComplete),
      slots: snapshot.slots.map((slot) => ({ slot: slot.slot, playerId: slot.playerId, playerName: slot.playerNameSnapshot, position: slot.position })),
    })),
  }));

  await postResult({
    scope: { playerId: player.id, playerName: player.name, competition: 'copa_rfef' },
    baseline: {
      totals: { minutes: baseline.totalMinutes, identified: baseline.identifiedMinutes, unknown: baseline.unidentifiedMinutes },
      positions: baseline.positions,
      unknownSegments: baseline.unknownAudit,
    },
    current: {
      totals: { minutes: current.totalMinutes, identified: current.identifiedMinutes, unknown: current.unidentifiedMinutes },
      positions: current.positions,
      reconstructedSegments: current.reconstructionAudit,
      unknownSegments: current.unknownAudit,
    },
    evidence,
  });
};

run().catch((error) => postResult({ error: error?.message || String(error) }).catch(() => undefined));
