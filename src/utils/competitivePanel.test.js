import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildOfficialPlayerTotals,
  compareHabitualPlayerEvidence,
  getHabitualOfficialSystem,
  getOfficialCaptainPlayerId,
  getOfficialPlayedMatches,
} from './competitivePanel.js';

const now = new Date(2026, 7, 10, 12, 0, 0);
const catalog = [
  { key: 'league', competitionType: 'official' },
  { key: 'copa_rfef', competitionType: 'official' },
  { key: 'playoff', competitionType: 'official' },
  { key: 'friendly', competitionType: 'friendly' },
];
const players = [
  { id: 'a', name: 'Jugador A', position: 'Defensa' },
  { id: 'b', name: 'Jugador B', position: 'Defensa' },
  { id: 'gk-a', name: 'Portero A', position: 'Portero' },
  { id: 'gk-b', name: 'Portero B', position: 'Portero' },
];
const playedMatch = ({
  id,
  competitionKey = 'league',
  date = '2026-08-01',
  status = 'Finalizado',
  system = '4-2-3-1',
  lineup = [],
  stats = {},
  goals = [],
  captainPlayerId = null,
} = {}) => ({
  id,
  competitionKey,
  date,
  status,
  statsSystemRaw: system,
  statsLineup: lineup,
  statsPlayerData: stats,
  statsGoalEvents: goals,
  captainPlayerId,
  isHome: true,
  homeScore: 0,
  awayScore: 0,
});

const friendliesOnly = [1, 2, 3].map((index) => playedMatch({ id: `f${index}`, competitionKey: 'friendly' }));
assert.deepEqual(getOfficialPlayedMatches(friendliesOnly, catalog, now), [], 'A: tres amistosos no generan datos competitivos');

const league = playedMatch({ id: 'l1' });
assert.deepEqual(getOfficialPlayedMatches([...friendliesOnly, league], catalog, now).map(({ id }) => id), ['l1'], 'B: solo participa Liga');

const copa = playedMatch({ id: 'c1', competitionKey: 'copa_rfef', date: '2026-08-02' });
const secondLeague = playedMatch({ id: 'l2', date: '2026-08-03' });
assert.deepEqual(
  getOfficialPlayedMatches([...friendliesOnly.slice(0, 2), league, secondLeague, copa], catalog, now).map(({ id }) => id),
  ['l1', 'l2', 'c1'],
  'C: Liga y Copa RFEF cuentan; amistosos no'
);

const futureLeague = playedMatch({ id: 'future', date: '2026-08-20' });
assert.equal(getOfficialPlayedMatches([futureLeague], catalog, now).length, 0, 'D: un oficial futuro no cuenta');
const postponedLeague = playedMatch({ id: 'postponed', status: 'Aplazado' });
assert.equal(getOfficialPlayedMatches([postponedLeague], catalog, now).length, 0, 'E: un oficial aplazado no cuenta');

const startsMatches = [
  ...[1, 2, 3].map((index) => playedMatch({ id: `friendly-start-${index}`, competitionKey: 'friendly', lineup: ['Jugador A'] })),
  playedMatch({ id: 'official-start-1', lineup: ['Jugador A', 'Jugador B'], stats: { 'Jugador A': { minutes: 90 }, 'Jugador B': { minutes: 90 } } }),
  playedMatch({ id: 'official-start-2', date: '2026-08-02', lineup: ['', 'Jugador B'], stats: { 'Jugador B': { minutes: 90 } } }),
];
const officialStarts = getOfficialPlayedMatches(startsMatches, catalog, now);
const startTotals = buildOfficialPlayerTotals(officialStarts, players);
const habitualOrder = startTotals.rows.filter((row) => row.starts).sort(compareHabitualPlayerEvidence);
assert.deepEqual(habitualOrder.map((row) => [row.player.name, row.starts]), [['Jugador B', 2], ['Jugador A', 1]], 'F: mandan titularidades oficiales');
assert.equal(compareHabitualPlayerEvidence(
  { starts: 2, minutes: 170, latestStartKey: '2026-08-01', name: 'A' },
  { starts: 2, minutes: 180, latestStartKey: '2026-07-01', name: 'B' }
) > 0, true, 'en empate de titularidades mandan los minutos oficiales');
assert.equal(compareHabitualPlayerEvidence(
  { starts: 2, minutes: 180, latestStartKey: '2026-08-01', name: 'A' },
  { starts: 2, minutes: 180, latestStartKey: '2026-08-02', name: 'B' }
) > 0, true, 'en nuevo empate manda la titularidad oficial más reciente');

const goalMatches = [
  playedMatch({
    id: 'friendly-goals',
    competitionKey: 'friendly',
    goals: Array.from({ length: 5 }, (_, index) => ({ id: `fg${index}`, type: 'Gol a favor', scorerId: 'a', scorer: 'Jugador A' })),
  }),
  playedMatch({ id: 'official-goal-a', goals: [{ type: 'Gol a favor', scorerId: 'a', scorer: 'Jugador A', assistant: null, assistantId: null }] }),
  playedMatch({
    id: 'official-goals-b',
    date: '2026-08-02',
    goals: [
      { type: 'Gol a favor', scorerId: 'b', scorer: 'Jugador B', assistantId: 'a', assistant: 'Jugador A' },
      { type: 'Gol a favor', scorerId: 'b', scorer: 'Jugador B', assistant: null, assistantId: null },
    ],
  }),
];
const goalTotals = buildOfficialPlayerTotals(getOfficialPlayedMatches(goalMatches, catalog, now), players);
assert.equal(goalTotals.topScorer?.player.name, 'Jugador B', 'G: dos goles oficiales superan cinco amistosos');
assert.equal(goalTotals.topAssistant?.player.name, 'Jugador A', 'solo una asistencia real oficial suma');
assert.equal(goalTotals.topAssistant?.assists, 1, 'null no suma asistencia');

const goalkeeperMatches = [
  playedMatch({ id: 'friendly-gk', competitionKey: 'friendly', stats: { 'Portero A': { minutes: 270 } } }),
  playedMatch({ id: 'official-gk-1', stats: { 'Portero A': { minutes: 90 }, 'Portero B': { minutes: 90 } } }),
  playedMatch({ id: 'official-gk-2', date: '2026-08-02', stats: { 'Portero B': { minutes: 90 } } }),
];
const goalkeeperTotals = buildOfficialPlayerTotals(getOfficialPlayedMatches(goalkeeperMatches, catalog, now), players);
const mainGoalkeeper = goalkeeperTotals.rows.filter((row) => row.player.position === 'Portero').sort((a, b) => b.minutes - a.minutes)[0];
assert.equal(mainGoalkeeper.player.name, 'Portero B', 'H: el portero principal depende solo de minutos oficiales');

const systemMatches = [
  ...Array.from({ length: 4 }, (_, index) => playedMatch({ id: `friendly-system-${index}`, competitionKey: 'friendly', system: '4-4-2' })),
  playedMatch({ id: 'system-1', system: '4-2-3-1', date: '2026-08-01' }),
  playedMatch({ id: 'system-2', system: '4-2-3-1', date: '2026-08-02' }),
  playedMatch({ id: 'system-3', system: '4-4-2', date: '2026-08-03' }),
];
const officialSystems = getOfficialPlayedMatches(systemMatches, catalog, now);
assert.equal(getHabitualOfficialSystem(officialSystems).system, '4-2-3-1', 'I: el sistema habitual excluye cuatro 4-4-2 amistosos');
assert.equal(getHabitualOfficialSystem([
  playedMatch({ id: 'tie-old', system: '4-4-2', date: '2026-08-01' }),
  playedMatch({ id: 'tie-new', system: '4-3-3', date: '2026-08-02' }),
]).system, '4-3-3', 'en empate gana el sistema del oficial más reciente');

assert.equal(getOfficialCaptainPlayerId([
  playedMatch({ id: 'captain-a', captainPlayerId: 'a', date: '2026-08-01' }),
  playedMatch({ id: 'captain-b1', captainPlayerId: 'b', date: '2026-08-02' }),
  playedMatch({ id: 'captain-b2', captainPlayerId: 'b', date: '2026-08-03' }),
]), 'b', 'el capitán exige referencias reales y prioriza la más repetida');
assert.equal(getOfficialCaptainPlayerId([playedMatch({ id: 'no-captain' })]), null, 'sin capitán almacenado no se inventa');

const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
assert.ok(appSource.includes('const officialPlayedMatches = useMemo('), 'Once y tarjetas comparten una única colección oficial jugada');
assert.ok(appSource.includes('getGroupRankings(officialPlayedMatches, { statsOnly: true })'), 'el once usa alineaciones reales de Estadísticas y no el once PRE');
assert.ok(appSource.includes("typeof playerOrRole === 'object' ? getPlayerPositionLabel(playerOrRole)"), 'la asignación habitual prioriza la posición específica normalizada');
assert.ok(appSource.includes('loadCompetitivePanelEvidence().catch('), 'Plantilla carga minutos y slots sin depender de visitar otro módulo');
assert.ok(appSource.includes('Once habitual') && appSource.includes('Basado en partidos oficiales'), 'la interfaz comunica el nuevo contrato');
assert.ok(appSource.includes('Datos oficiales insuficientes'), 'un once parcial no se presenta como consolidado');
assert.equal(appSource.includes('Sistema más usado: {rosterDashboard.mostUsedSystem}'), false, 'se retira el texto y fallback anteriores');
assert.equal(appSource.includes('Disponibilidad semanal</p>'), false, 'se elimina el bloque duplicado');
assert.ok(appSource.includes("['U23', 'Sub-23', squadSummary.sub23"), 'Sub-23 se conserva en el resumen superior');

console.log('competitivePanel tests passed');
