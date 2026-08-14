import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  applyHistoricalStatsLineupProposal,
  buildAutomaticStatsLineup,
  buildHistoricalStatsLineupProposal,
  buildStatsLineupHistoryDataset,
  getEligibleStatsLineupHistoryMatches,
} from './statsLineupHistory.js';
import { buildMatchSquadSnapshot, validateMatchSquadSnapshot } from './statsSquadSnapshot.js';

const ids = Array.from({ length: 13 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
const roster = ids.map((id, index) => ({ id, name: `Jugador ${index + 1}`, availabilityStatus: 'available', activeInSquad: true }));
const matches = [
  { id: 'm1', date: '2026-08-01', time: '18:00', status: 'Jugado', competitionKey: 'league', statsSystemRaw: '4-2-3-1' },
  { id: 'm2', date: '2026-08-05', time: '18:00', status: 'Jugado', competitionKey: 'league', statsSystemRaw: '4-2-3-1' },
  { id: 'friendly', date: '2026-08-06', status: 'Jugado', competitionKey: 'friendly', statsSystemRaw: '4-2-3-1' },
  { id: 'future', date: '2026-08-30', status: 'Previa', competitionKey: 'league', statsSystemRaw: '4-2-3-1' },
  { id: 'current', date: '2026-08-20', status: 'Previa', competitionKey: 'league', statsSystemRaw: '4-2-3-1' },
];
const slotRows = matches.flatMap((match) => match.id === 'current' ? [] : ids.slice(0, 11).map((jugadorId, slot) => ({
  partido_id: match.id,
  scope: 'stats',
  slot,
  jugador_id: jugadorId,
  player_name: `Nombre histórico ${slot + 1}`,
})));
slotRows.push({ partido_id: 'm1', scope: 'pre_caudal', slot: 0, jugador_id: ids[12], player_name: 'PRE ignorado' });
const statsRows = ['m1', 'm2'].flatMap((partidoId) => ids.slice(0, 11).map((jugadorId, index) => ({ partido_id: partidoId, jugador_id: jugadorId, minutes: 90 - index })));
const dataset = buildStatsLineupHistoryDataset({ matches, slotRows, statsRows });
const eligible = getEligibleStatsLineupHistoryMatches({ matches: dataset, currentMatch: matches.at(-1), now: new Date('2026-08-20T12:00:00') });
assert.deepEqual(eligible.map((match) => match.id), ['m2', 'm1'], 'solo usa partidos oficiales jugados anteriores y ordena por fecha');
assert.equal(eligible.some((match) => match.statsHistorySlots.some((slot) => slot.playerName === 'PRE ignorado')), false, 'PRE nunca entra en el histórico');

const automatic = buildAutomaticStatsLineup({ historyMatches: eligible, system: '4-2-3-1', rosterPlayers: roster });
assert.deepEqual(automatic.lineup, roster.slice(0, 11).map((player) => player.name), 'A: 4-2-3-1 con histórico suficiente produce el XI por slots');
assert.equal(new Set(automatic.slots.map((slot) => slot.jugadorId)).size, automatic.slots.length, 'B: ningún UUID se duplica');

const duplicatedUsage = structuredClone(eligible);
duplicatedUsage[0].statsHistorySlots[1].jugadorId = ids[0];
const noDuplicate = buildAutomaticStatsLineup({ historyMatches: duplicatedUsage, system: '4-2-3-1', rosterPlayers: roster });
assert.equal(noDuplicate.lineup.filter((name) => name === roster[0].name).length, 1, 'B: el más usado en dos slots solo ocupa uno');

const unavailableRoster = roster.map((player, index) => index === 0
  ? { ...player, availabilityStatus: 'injured' }
  : index === 1 ? { ...player, availabilityStatus: 'suspended', suspensionMatchesRemaining: 1 } : player);
const unavailableAuto = buildAutomaticStatsLineup({ historyMatches: eligible, system: '4-2-3-1', rosterPlayers: unavailableRoster });
assert.equal(unavailableAuto.lineup.includes(roster[0].name), false, 'C: lesionado nunca es titular automático');
assert.equal(unavailableAuto.lineup.includes(roster[1].name), false, 'D: sancionado nunca es titular automático');
assert.equal(unavailableAuto.lineup[0], '', 'E: sin candidato fiable el slot queda vacío');

const sameSystem = buildHistoricalStatsLineupProposal({ historicalMatch: eligible[0], currentSystem: '4-2-3-1', rosterPlayers: roster });
assert.equal(sameSystem.requiresSystemChange, false);
assert.deepEqual(sameSystem.lineup, roster.slice(0, 11).map((player) => player.name), 'F: mismo sistema replica slots por UUID');

const differentMatch = { ...eligible[0], statsSystemRaw: '4-3-3' };
const differentSystem = buildHistoricalStatsLineupProposal({ historicalMatch: differentMatch, currentSystem: '4-2-3-1', rosterPlayers: roster });
assert.equal(differentSystem.requiresSystemChange, true, 'G: sistema diferente requiere confirmación');
const current = { system: '4-2-3-1', lineup: Array(11).fill('Actual') };
assert.deepEqual(applyHistoricalStatsLineupProposal(current, differentSystem), current, 'I: cancelar no cambia nada');
assert.deepEqual(applyHistoricalStatsLineupProposal(current, differentSystem, { acceptSystemChange: true }), { system: '4-3-3', lineup: differentSystem.lineup }, 'H: aceptar cambia sistema y XI');

const retiredRoster = roster.slice(1);
const retired = buildHistoricalStatsLineupProposal({ historicalMatch: eligible[0], currentSystem: '4-2-3-1', rosterPlayers: retiredRoster });
assert.equal(retired.lineup[0], '', 'J: jugador fuera de plantilla deja el slot vacío');
assert.ok(retired.missing.length);
const noUuidMatch = structuredClone(eligible[0]);
noUuidMatch.statsHistorySlots[0].jugadorId = '';
noUuidMatch.statsHistorySlots[0].playerName = roster[0].name;
const noUuid = buildHistoricalStatsLineupProposal({ historicalMatch: noUuidMatch, currentSystem: '4-2-3-1', rosterPlayers: roster });
assert.equal(noUuid.lineup[0], '', 'K: sin UUID no existe fallback por nombre');

const firstApply = applyHistoricalStatsLineupProposal(current, sameSystem);
const doubleApply = applyHistoricalStatsLineupProposal(firstApply, sameSystem);
assert.deepEqual(doubleApply, firstApply, 'L: doble aplicación es idempotente');
const snapshot = buildMatchSquadSnapshot({
  matchId: ids[12],
  system: firstApply.system,
  lineup: firstApply.lineup,
  rosterPlayers: roster,
  calledPlayers: roster.slice(0, 11),
});
assert.doesNotThrow(() => validateMatchSquadSnapshot(snapshot), 'M: la propuesta produce un snapshot H2 válido');
assert.deepEqual(statsRows, ['m1', 'm2'].flatMap((partidoId) => ids.slice(0, 11).map((jugadorId, index) => ({ partido_id: partidoId, jugador_id: jugadorId, minutes: 90 - index }))), 'N: el cálculo no modifica estadísticas históricas');

const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const autoHandler = appSource.slice(appSource.indexOf('const autoPlaceStatsStarters'), appSource.indexOf('const updateStatsPlayerData'));
assert.ok(autoHandler.includes('buildAutomaticStatsLineup') && autoHandler.includes('stageStatsLineupProposal'), 'AUTO prepara el XI con histórico y estado local');
assert.equal(autoHandler.includes('persistStatsSquadSnapshot'), false, 'AUTO no guarda inmediatamente');
assert.ok(appSource.includes(".eq('scope', 'stats')") && appSource.includes("select('partido_id,scope,slot,jugador_id,player_name')"), 'el histórico lee exclusivamente slots stats con UUID');
assert.ok(appSource.includes("supabase.rpc('save_match_squad_lineup_atomic', snapshot)") && appSource.includes('saveStatsLineupProposal'), 'Guardar XI conserva H2 como única escritura oficial');
assert.ok(appSource.includes('Cargar alineación anterior') && appSource.includes('Cargar sistema + alineación'), 'la interfaz ofrece carga histórica y confirmación de sistema');
assert.equal(autoHandler.includes('preCaudal'), false, 'PRE no participa en AUTO');

console.log('statsLineupHistory tests passed');
