import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildStatsLineupRows,
  getStatsLineupInvariantReport,
  hydrateStatsLineup,
  moveStatsLineupPlayer,
  normalizeStatsLineup,
  removeStatsLineupPlayer,
} from './statsLineup.js';

const base = ['A', 'B', '', 'C'];
const emptyMove = moveStatsLineupPlayer({ lineup: base, playerName: 'A', targetSlot: 2 });
assert.deepEqual(emptyMove.lineup.slice(0, 4), ['', 'B', 'A', 'C'], 'A: titular a slot vacío deja libre el origen');

const swap = moveStatsLineupPlayer({ lineup: base, playerName: 'A', targetSlot: 1 });
assert.deepEqual(swap.lineup.slice(0, 4), ['B', 'A', '', 'C'], 'B: titular sobre titular intercambia A/B');
assert.equal(swap.demotedPlayerName, '', 'en un swap ambos siguen siendo titulares');

let chained = moveStatsLineupPlayer({ lineup: base, playerName: 'A', targetSlot: 1 }).lineup;
chained = moveStatsLineupPlayer({ lineup: chained, playerName: 'A', targetSlot: 3 }).lineup;
assert.equal(getStatsLineupInvariantReport(chained).valid, true, 'C: intercambios sucesivos no duplican jugadores');

const reserveDrop = moveStatsLineupPlayer({ lineup: base, playerName: 'SUPLENTE', targetSlot: 1 });
assert.equal(reserveDrop.lineup[1], 'SUPLENTE', 'D: suplente ocupa el slot titular');
assert.equal(reserveDrop.demotedPlayerName, 'B', 'D: el titular desplazado pasa a suplente');

const changedSystem = normalizeStatsLineup(['A', 'A', 'B', 'C']);
assert.equal(getStatsLineupInvariantReport(changedSystem).valid, true, 'E: la normalización previa al cambio de sistema elimina solapamientos');
assert.equal(changedSystem.filter(Boolean).length, 3);

const players = [{ id: 'id-a', name: 'A' }, { id: 'id-b', name: 'B' }, { id: 'id-c', name: 'C' }];
const storedRows = buildStatsLineupRows({ matchId: 'match-1', lineup: swap.lineup, players });
assert.deepEqual(hydrateStatsLineup(storedRows), swap.lineup, 'F: guardar y recargar conserva exactamente el intercambio');

const report = getStatsLineupInvariantReport(reserveDrop.lineup);
assert.equal(report.placedCount, report.uniquePlayerCount, 'G: el contador coincide con titulares realmente colocados');
assert.equal(removeStatsLineupPlayer(reserveDrop.lineup, 'SUPLENTE')[1], '', 'pasar a suplente libera el slot');
assert.deepEqual(normalizeStatsLineup(['A', 'A']), ['A', '', '', '', '', '', '', '', '', '', '']);

const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
assert.ok(appSource.includes('moveStatsLineupPlayer({'), 'el drop real usa la transición central con swap');
assert.ok(appSource.includes('persistStatsSquadSnapshot({') && appSource.includes('refreshStatsFromSupabase(currentMatchId, reason)'), 'los intercambios normales se persisten por H2 y se recargan');
assert.ok(appSource.includes('buildAutomaticStatsLineup({ historyMatches, system, rosterPlayers: players })'), 'la autocolocación reutiliza el histórico real por sistema y slot');
assert.ok(appSource.includes('stageStatsLineupProposal({') && appSource.includes('Propuesta local · pendiente de guardar'), 'AUTO y carga histórica preparan primero estado local');
assert.ok(appSource.includes('const starters = normalizeStatsLineup(selectedMatch?.statsLineup || []).filter(Boolean)'), 'el contador parte de titulares realmente colocados');
assert.ok(appSource.includes('refreshStatsFromSupabase(currentMatchId, reason)'), 'la persistencia termina releyendo Supabase');

console.log('statsLineup tests passed');
