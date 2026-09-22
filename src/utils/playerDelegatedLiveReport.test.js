import assert from 'node:assert/strict';
import {
  buildPlayerDelegatedLivePresentationInput,
  buildPlayerDelegatedLiveSummary,
  buildPlayerDelegatedSeasonExportSummary,
} from './playerDelegatedLiveReport.js';
import { buildPlayerAnalysisSeasonReport } from './playerAnalysisPresentation.js';
import { buildPlayerProfilePrintReport } from './playerProfilePrintReport.js';

const playerId = '11111111-1111-4111-8111-111111111111';
const player = { id: playerId, name: 'Jugador QA' };
const eventTypes = ['tiro', 'centro', 'tiro_puerta', 'perdida', 'robo', 'falta_realizada', 'gol'];
const matches = eventTypes.map((eventType, index) => ({
  id: `match-${index + 1}`,
  date: `2026-09-${String(index + 1).padStart(2, '0')}`,
  opponent: `Rival ${index + 1}`,
  isHome: index % 2 === 0,
  delegatedDataStatus: index % 2 === 0 ? 'Validado' : 'Sin revisar',
  eventType,
}));
const matchesById = Object.fromEntries(matches.map((match) => [match.id, match]));
const events = matches.map((match, index) => ({
  id: `event-${index + 1}`,
  partidoId: match.id,
  jugadorId: playerId,
  playerId,
  playerName: player.name,
  equipo: 'caudal',
  tipoEvento: match.eventType,
  minute: String(10 + index),
  reviewed: match.delegatedDataStatus === 'Validado',
}));

const allSeason = buildPlayerDelegatedLiveSummary({
  events,
  matchesById,
  player,
  players: [player],
  quickScope: 'Temporada completa',
  delegatedScope: 'Todos los registros',
});
const lastFive = buildPlayerDelegatedLiveSummary({
  events,
  matchesById,
  player,
  players: [player],
  quickScope: 'Últimos 5 partidos',
  delegatedScope: 'Todos los registros',
});
const validatedSeason = buildPlayerDelegatedLiveSummary({
  events,
  matchesById,
  player,
  players: [player],
  quickScope: 'Temporada completa',
  delegatedScope: 'Solo validados',
});
const exportSeason = buildPlayerDelegatedSeasonExportSummary({
  events,
  matchesById,
  player,
  players: [player],
  quickScope: 'Últimos 5 partidos',
  delegatedScope: 'Solo validados',
});

assert.equal(allSeason.matchesWithEvents, 7);
assert.equal(lastFive.matchesWithEvents, 5, 'Últimos 5 conserva un universo distinto en la ficha');
assert.equal(validatedSeason.matchesWithEvents, 4, 'Solo validados conserva únicamente los partidos validados');
assert.deepEqual(
  {
    matches: exportSeason.matchesWithEvents,
    totals: exportSeason.matchStats.map(({ matchId, eventCount }) => [matchId, eventCount]),
    perMatch: exportSeason.perMatch,
    accuracy: exportSeason.shotAccuracyPercentage,
  },
  {
    matches: allSeason.matchesWithEvents,
    totals: allSeason.matchStats.map(({ matchId, eventCount }) => [matchId, eventCount]),
    perMatch: allSeason.perMatch,
    accuracy: allSeason.shotAccuracyPercentage,
  },
  'el selector de exportación ignora los filtros visibles y fija Temporada completa + Todos los registros',
);
assert.notDeepEqual(exportSeason.perMatch, lastFive.perMatch);
assert.notDeepEqual(exportSeason.perMatch, validatedSeason.perMatch);

const seasonAnalysis = buildPlayerAnalysisSeasonReport({
  liveStats: buildPlayerDelegatedLivePresentationInput(exportSeason),
  matches: exportSeason.matchStats.map(({ match, ...stats }) => ({
    ...stats,
    opponent: match.opponent,
    isHome: match.isHome,
  })),
});
const pdfModel = buildPlayerProfilePrintReport({
  identity: { name: player.name, season: '2026/2027' },
  liveSeason: seasonAnalysis.live,
  seasonMaximums: seasonAnalysis.maximums,
});
const pdfMetrics = Object.fromEntries(pdfModel.liveSeason.metricGroups
  .flatMap((group) => group.metrics)
  .map((metric) => [metric.key, metric.value]));
const expectedMetrics = buildPlayerDelegatedLivePresentationInput(allSeason);

assert.equal(pdfModel.liveSeason.matchesWithEvents, allSeason.matchesWithEvents);
assert.equal(pdfModel.liveSeason.registryScope, 'all_records');
for (const key of [
  'goalsPerMatch', 'shotsPerMatch', 'shotsOnTargetPerMatch', 'shotAccuracyPercentage',
  'crossesPerMatch', 'turnoversPerMatch', 'stealsPerMatch',
  'foulsCommittedPerMatch', 'foulsReceivedPerMatch',
]) assert.equal(pdfMetrics[key], expectedMetrics[key], `el modelo PDF conserva ${key} sin recalcularlo`);
assert.deepEqual(
  pdfModel.seasonMaximums.map((maximum) => [maximum.metric.key, maximum.value, maximum.match.matchId]),
  seasonAnalysis.maximums.map((maximum) => [maximum.metric.key, maximum.value, maximum.match.matchId]),
  'Registro en vivo y Máximos comparten exactamente el mismo universo de partidos',
);

const zeroGoals = buildPlayerDelegatedLiveSummary({
  events: events.filter((event) => event.tipoEvento !== 'gol'),
  matchesById,
  player,
  players: [player],
});
assert.equal(zeroGoals.matchesWithEvents, 6);
assert.equal(zeroGoals.perMatch.goals, 0, 'cero con partidos con eventos es un dato, no ausencia');
const noEvents = buildPlayerDelegatedLiveSummary({ events: [], matchesById, player, players: [player] });
assert.equal(noEvents.matchesWithEvents, 0);
assert.equal(noEvents.perMatch, null, 'sin ningún evento no se inventa un promedio cero');

console.log('player delegated live report integration tests passed');
