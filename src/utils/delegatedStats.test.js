import assert from 'node:assert/strict';
import {
  aggregateDelegatedStats,
  buildDelegatedEvolution,
  buildDelegatedPlayerRows,
  buildDelegatedStatsDataset,
  buildDelegatedTemporalDistribution,
  calculateDelegatedDerivedStats,
  calculateDelegatedPer90,
} from './delegatedStats.js';

const playerA = { id: '11111111-1111-4111-8111-111111111111', name: 'Jugador A' };
const baseEvent = (type, overrides = {}) => ({
  id: crypto.randomUUID(),
  tipoEvento: type,
  equipo: 'caudal',
  playerId: playerA.id,
  jugadorId: playerA.id,
  minute: '10',
  reviewed: true,
  ...overrides,
});
const match = (id, date, competitionKey, events, minutes = 90, status = 'Validado') => ({
  id,
  date,
  opponent: `Rival ${id}`,
  competitionKey,
  delegatedDataStatus: status,
  quickEvents: events.map((event) => ({ ...event, partidoId: id })),
  statsPlayerData: { 'Jugador A': { jugadorId: playerA.id, minutes } },
});

assert.deepEqual(aggregateDelegatedStats([baseEvent('gol')]), {
  goals: 1, shots: 1, shotsOnTarget: 1, dribbles: 0, crosses: 0, turnovers: 0,
  steals: 0, recoveries: 0, corners: 0, foulsCommitted: 0, foulsReceived: 0,
}, 'Caso A: un gol deriva una vez en tiro y TAP');
assert.deepEqual(aggregateDelegatedStats([baseEvent('tiro_puerta')]).shotsOnTarget, 1, 'Caso B: TAP suma TAP');
assert.deepEqual(aggregateDelegatedStats([baseEvent('tiro_puerta')]).shots, 1, 'Caso B: TAP deriva un tiro');
assert.deepEqual(aggregateDelegatedStats([baseEvent('tiro')]).shotsOnTarget, 0, 'Caso C: tiro normal no deriva TAP');
assert.deepEqual(aggregateDelegatedStats([baseEvent('tiro')]).shots, 1);
assert.deepEqual(aggregateDelegatedStats([baseEvent('gol'), baseEvent('tiro_puerta'), baseEvent('tiro')]), {
  goals: 1, shots: 3, shotsOnTarget: 2, dribbles: 0, crosses: 0, turnovers: 0,
  steals: 0, recoveries: 0, corners: 0, foulsCommitted: 0, foulsReceived: 0,
}, 'Caso D: tres eventos reales diferentes se cuentan según su contrato');

const mixedMatch = match('m1', '2026-08-12', 'league', [
  baseEvent('tiro'),
  baseEvent('robo', { reviewed: false }),
  baseEvent('tiro', { equipo: 'rival', playerId: null, jugadorId: null, minute: '20' }),
  baseEvent('corner', { playerId: null, jugadorId: null, minute: '31' }),
]);
const discardedMatch = match('discarded', '2026-08-11', 'league', [baseEvent('gol')], 90, 'Descartado');
const validatedDataset = buildDelegatedStatsDataset({ matches: [mixedMatch, discardedMatch] });
assert.equal(validatedDataset.events.length, 3, 'Casos E/F: excluye reviewed=false y partidos descartados');
assert.equal(validatedDataset.events.some((event) => event.equipo === 'rival'), true, 'Caso G: rival sin jugador entra en colectivo');
assert.equal(validatedDataset.events.some((event) => event.tipoEvento === 'corner'), true, 'Caso H: córner colectivo sin jugador entra');

const playerEvents = [
  baseEvent('gol'),
  ...Array.from({ length: 3 }, () => baseEvent('tiro')),
  baseEvent('tiro_puerta'),
  ...Array.from({ length: 4 }, () => baseEvent('recuperacion')),
  ...Array.from({ length: 2 }, () => baseEvent('robo')),
  ...Array.from({ length: 5 }, () => baseEvent('perdida')),
  ...Array.from({ length: 3 }, () => baseEvent('centro')),
];
const playerMatch = match('player-match', '2026-08-13', 'league', playerEvents);
const [playerRow] = buildDelegatedPlayerRows({
  events: buildDelegatedStatsDataset({ matches: [playerMatch] }).events,
  matches: [playerMatch],
  players: [playerA],
});
assert.deepEqual(playerRow.stats, {
  goals: 1, shots: 5, shotsOnTarget: 2, dribbles: 0, crosses: 3, turnovers: 5,
  steals: 2, recoveries: 4, corners: 0, foulsCommitted: 0, foulsReceived: 0,
});
assert.equal(playerRow.minutes, 90);
assert.equal(playerRow.derived.shotAccuracy, 40);
assert.equal(playerRow.derived.shotEffectiveness, 20);
assert.deepEqual(playerRow.per90, {
  goals: 1, shots: 5, shotsOnTarget: 2, dribbles: 0, crosses: 3, turnovers: 5,
  steals: 2, recoveries: 4, foulsCommitted: 0, foulsReceived: 0,
}, 'con 90 minutos, por90 coincide con los totales individuales');
assert.equal(calculateDelegatedPer90(playerRow.stats, null), null, 'sin minutos fiables no inventa por90');
assert.equal(calculateDelegatedDerivedStats({ shots: 0, shotsOnTarget: 0 }).shotAccuracy, null, 'sin tiros muestra sin dato, no 0%');
const unknownMinutesMatch = match('unknown-minutes', '2026-08-14', 'league', [baseEvent('tiro')], '');
const [unknownMinutesRow] = buildDelegatedPlayerRows({
  events: buildDelegatedStatsDataset({ matches: [unknownMinutesMatch] }).events,
  matches: [unknownMinutesMatch],
  players: [playerA],
});
assert.equal(unknownMinutesRow.minutes, null, 'los minutos vacíos se muestran como no disponibles');
assert.equal(unknownMinutesRow.per90, null, 'los minutos vacíos no producen por90');

const filtered = buildDelegatedStatsDataset({
  matches: [mixedMatch],
  filters: { team: 'rival', playerId: '', eventType: 'tiro', period: '16-30' },
});
assert.equal(filtered.events.length, 1, 'los filtros de equipo, evento y tramo comparten dataset');
assert.equal(buildDelegatedStatsDataset({ matches: [mixedMatch], filters: { playerId: playerA.id } }).events.length, 1, 'el filtro de jugador excluye rival y córner colectivo');
assert.equal(buildDelegatedStatsDataset({ matches: [mixedMatch], filters: { team: 'todos' } }).events.length, 3);
assert.equal(buildDelegatedStatsDataset({ matches: [mixedMatch], filters: { team: 'caudal' } }).events.length, 2);
assert.equal(buildDelegatedStatsDataset({ matches: [mixedMatch], filters: { team: 'rival' } }).events.length, 1);
assert.equal(buildDelegatedStatsDataset({ matches: [mixedMatch], filters: { matchId: 'missing' } }).events.length, 0, 'el filtro de partido comparte la misma fuente');

const temporal = buildDelegatedTemporalDistribution(validatedDataset.events, 'shots');
assert.equal(temporal.rows.find((row) => row.period === '0-15').caudal, 1);
assert.equal(temporal.rows.find((row) => row.period === '16-30').rival, 1);
assert.equal(temporal.hasRival, true);
assert.equal(buildDelegatedPlayerRows({ events: [baseEvent('corner', { playerId: null, jugadorId: null })], players: [playerA] })[0], undefined, 'el córner colectivo no se asigna a un jugador');
const addedTime = buildDelegatedTemporalDistribution([
  baseEvent('tiro', { minute: '15' }),
  baseEvent('tiro', { minute: '16' }),
  baseEvent('tiro', { minute: '91' }),
], 'shots');
assert.equal(addedTime.rows.find((row) => row.period === '0-15').caudal, 1);
assert.equal(addedTime.rows.find((row) => row.period === '16-30').caudal, 1);
assert.equal(addedTime.rows.find((row) => row.period === '76-90+').caudal, 1, 'el añadido posterior al 90 entra en el último tramo');

const evolutionMatches = Array.from({ length: 12 }, (_, index) => match(
  `e${index + 1}`,
  `2026-${String(index + 1).padStart(2, '0')}-01`,
  index % 2 ? 'cup' : 'league',
  [baseEvent(index % 3 ? 'tiro' : 'gol')],
  45 + index,
));
const lastFive = buildDelegatedEvolution({ matches: evolutionMatches, scope: '5', metric: 'shots' });
assert.deepEqual(lastFive.map((row) => row.matchId), ['e8', 'e9', 'e10', 'e11', 'e12'], 'evolución últimos 5 en orden cronológico');
assert.equal(buildDelegatedEvolution({ matches: evolutionMatches, scope: '10' }).length, 10);
assert.equal(buildDelegatedEvolution({ matches: evolutionMatches, scope: 'season', competitionKey: 'league' }).length, 6);
const per90Evolution = buildDelegatedEvolution({
  matches: evolutionMatches,
  filters: { playerId: playerA.id, team: 'caudal' },
  scope: 'season',
  competitionKey: 'league',
  metric: 'shots',
  mode: 'per90',
  players: [playerA],
});
assert.ok(per90Evolution.every((row) => row.value != null && row.normalized), 'evolución individual por90 usa minutos reales');
const firstLeagueEvolution = per90Evolution[0];
assert.equal(firstLeagueEvolution.value, Number(((firstLeagueEvolution.caudalValue / firstLeagueEvolution.minutes) * 90).toFixed(2)));

console.log('delegatedStats tests passed');
