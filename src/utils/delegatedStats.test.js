import assert from 'node:assert/strict';
import {
  DELEGATED_PANEL_PLAYER_STAT_FIELDS,
  DELEGATED_PANEL_STAT_FIELDS,
  aggregateDelegatedSides,
  aggregateDelegatedStats,
  buildDelegatedContextComparison,
  buildDelegatedDataReadings,
  buildDelegatedEvolution,
  buildDelegatedEvolutionComparison,
  buildDelegatedHalfComparison,
  buildDelegatedMatchSampleComparison,
  buildDelegatedOfficialGoalEvents,
  buildDelegatedOfficialPlayerProduction,
  buildDelegatedOfficialTeamScore,
  buildDelegatedPlayerRows,
  buildDelegatedRankings,
  buildDelegatedStatsDataset,
  buildDelegatedTeamProfile,
  buildDelegatedTemporalDistribution,
  buildDelegatedTemporalMatrix,
  calculateDelegatedMovingAverage,
  calculateDelegatedDerivedStats,
  calculateDelegatedPerMatch,
  calculateDelegatedPer90,
  filterDelegatedValidatedMatches,
  formatDelegatedNumber,
  getDelegatedMatchResult,
  getDelegatedMatchVenue,
} from './delegatedStats.js';

assert.deepEqual(DELEGATED_PANEL_STAT_FIELDS.some((field) => ['dribbles', 'recoveries'].includes(field.key)), false, 'el panel colectivo excluye regates y recuperaciones');
assert.deepEqual(DELEGATED_PANEL_PLAYER_STAT_FIELDS.some((field) => ['dribbles', 'recoveries'].includes(field.key)), false, 'el panel individual excluye regates y recuperaciones');

const playerA = { id: '11111111-1111-4111-8111-111111111111', name: 'Jugador A' };
const playerB = { id: '22222222-2222-4222-8222-222222222222', name: 'Jugador B' };
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
  goals: 0, assists: 0, goalContributions: 0, shots: 5, shotsOnTarget: 2, dribbles: 0, crosses: 3, turnovers: 5,
  steals: 2, recoveries: 4, corners: 0, foulsCommitted: 0, foulsReceived: 0,
}, 'un gol rápido deriva tiro y TAP, pero no duplica el gol oficial del jugador');
assert.equal(playerRow.minutes, 90);
assert.equal(playerRow.derived.shotAccuracy, 40);
assert.equal(playerRow.derived.shotEffectiveness, 0);
assert.deepEqual(playerRow.per90, {
  goals: 0, assists: 0, goalContributions: 0, shots: 5, shotsOnTarget: 2, crosses: 3, turnovers: 5,
  steals: 2, foulsCommitted: 0, foulsReceived: 0,
}, 'el Por90 presentado conserva las métricas activas y omite regates y recuperaciones');
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

const officialProductionMatches = Array.from({ length: 10 }, (_, index) => ({
  ...match(
    `official-${index + 1}`,
    `2026-04-${String(index + 1).padStart(2, '0')}`,
    index < 5 ? 'league' : 'cup',
    index < 2 ? [baseEvent('gol')] : [baseEvent('tiro')],
    90,
  ),
  goalsFor: index < 5 ? 1 : 0,
  goalsAgainst: index === 0 ? 1 : 0,
  isHome: index % 2 === 0,
  statsPlayerData: {
    'Jugador A': { jugadorId: playerA.id, minutes: 90 },
    'Jugador B': { jugadorId: playerB.id, minutes: 90 },
  },
  statsGoalEvents: index < 5 ? [{
    id: `official-goal-${index + 1}`,
    type: 'Gol a favor',
    minute: String(10 + index * 10),
    scorerId: index < 2 ? playerA.id : playerB.id,
    scorer: index < 2 ? playerA.name : playerB.name,
    assistantId: index < 2 ? playerB.id : playerA.id,
    assistant: index < 2 ? playerB.name : playerA.name,
  }] : [],
}));
const officialDataset = buildDelegatedStatsDataset({ matches: officialProductionMatches });
const officialRows = buildDelegatedPlayerRows({
  events: officialDataset.events,
  matches: officialDataset.validatedMatches,
  players: [playerA, playerB],
});
const officialPlayerA = officialRows.find((row) => row.playerId === playerA.id);
assert.equal(officialPlayerA.stats.goals, 2, 'G usa exclusivamente partido_eventos_gol y no suma los dos goles rápidos');
assert.equal(officialPlayerA.stats.assists, 3, 'A usa la asistencia oficial vinculada al UUID');
assert.equal(officialPlayerA.stats.goalContributions, 5, 'G+A se deriva de producción oficial');
assert.equal(officialPlayerA.matchesPlayed, 10);
assert.equal(officialPlayerA.minutes, 900);
assert.equal(officialPlayerA.average.goals, 0.2);
assert.equal(officialPlayerA.average.assists, 0.3);
assert.equal(officialPlayerA.average.goalContributions, 0.5);
assert.equal(officialPlayerA.per90.goals, 0.2);
assert.equal(officialPlayerA.per90.assists, 0.3);
assert.equal(officialPlayerA.per90.goalContributions, 0.5);
const officialScore = buildDelegatedOfficialTeamScore(officialProductionMatches);
assert.deepEqual(officialScore.totals, { caudal: 5, rival: 1 }, 'el marcador de equipo procede del resultado oficial');
assert.equal(officialScore.average.caudal, 0.5);
assert.equal(officialScore.average.rival, 0.1);
assert.equal(buildDelegatedOfficialGoalEvents(officialProductionMatches, { period: '0-15' }).length, 1, 'el filtro temporal también limita goles oficiales');
assert.equal(buildDelegatedOfficialGoalEvents(officialProductionMatches, { eventType: 'robo' }).length, 0, 'un filtro de otra acción no mezcla goles oficiales');
const leagueOfficialDataset = buildDelegatedStatsDataset({ matches: officialProductionMatches, filters: { competitionKey: 'league' } });
const leagueOfficialA = buildDelegatedPlayerRows({ events: leagueOfficialDataset.events, matches: leagueOfficialDataset.validatedMatches, players: [playerA, playerB] }).find((row) => row.playerId === playerA.id);
assert.deepEqual([leagueOfficialA.stats.goals, leagueOfficialA.stats.assists], [2, 3], 'los goles oficiales respetan la muestra de partidos filtrada');
const officialProductionForFilters = (filters) => {
  const filteredDataset = buildDelegatedStatsDataset({ matches: officialProductionMatches, filters });
  return buildDelegatedPlayerRows({ events: filteredDataset.events, matches: filteredDataset.validatedMatches, players: [playerA, playerB] }).find((row) => row.playerId === playerA.id);
};
assert.deepEqual([officialProductionForFilters({ matchId: 'official-1' }).stats.goals, officialProductionForFilters({ matchId: 'official-1' }).stats.assists], [1, 0], 'el partido limita la producción oficial');
assert.deepEqual([officialProductionForFilters({ venue: 'home' }).stats.goals, officialProductionForFilters({ venue: 'home' }).stats.assists], [1, 2], 'local/visitante limita la producción oficial');
assert.deepEqual([officialProductionForFilters({ result: 'win' }).stats.goals, officialProductionForFilters({ result: 'win' }).stats.assists], [1, 3], 'el resultado limita la producción oficial');
const productionByUuid = buildDelegatedOfficialPlayerProduction({ matches: officialProductionMatches, players: [playerA, playerB] });
assert.equal(productionByUuid.byPlayer.get(playerA.id).goalContributions, 5);

const missingOfficialDenominatorMatch = {
  ...officialProductionMatches[0],
  id: 'official-missing-denominator',
  statsGoalEvents: [{ id: 'missing-denominator-goal', type: 'Gol a favor', scorerId: playerA.id, scorer: playerA.name }],
  statsPlayerData: {},
};
const [missingOfficialDenominatorRow] = buildDelegatedPlayerRows({
  events: buildDelegatedStatsDataset({ matches: [missingOfficialDenominatorMatch] }).events,
  matches: [missingOfficialDenominatorMatch],
  players: [playerA],
});
assert.equal(missingOfficialDenominatorRow.stats.goals, 1, 'el total oficial sigue visible aunque falte PJ/minutos');
assert.equal(missingOfficialDenominatorRow.average, null, 'sin PJ fiable no calcula media por partido');
assert.equal(missingOfficialDenominatorRow.per90, null, 'sin minutos fiables no calcula por90');

const duplicatedName = { id: '44444444-4444-4444-8444-444444444444', name: playerA.name };
const ambiguousNameMatch = {
  ...officialProductionMatches[0],
  statsGoalEvents: [{ id: 'ambiguous-name', type: 'Gol a favor', scorer: playerA.name }],
};
assert.equal(buildDelegatedOfficialPlayerProduction({ matches: [ambiguousNameMatch], players: [playerA, duplicatedName] }).byPlayer.size, 0, 'el fallback nominal no acepta coincidencias ambiguas');

const individualMatchId = 'individual-x';
const individualSeason = Array.from({ length: 10 }, (_, index) => {
  const id = index === 4 ? individualMatchId : `individual-${index + 1}`;
  const quickEvents = index === 4
    ? [
      baseEvent('gol'),
      baseEvent('tiro_puerta'),
      baseEvent('tiro'),
      ...Array.from({ length: 4 }, () => baseEvent('robo')),
      baseEvent('falta_recibida', { playerId: '33333333-3333-4333-8333-333333333333', jugadorId: '33333333-3333-4333-8333-333333333333' }),
    ]
    : [baseEvent('tiro')];
  return {
    ...match(id, `2026-05-${String(index + 1).padStart(2, '0')}`, 'league', quickEvents, index === 4 ? 70 : 90),
    round: index + 1,
    isHome: index % 2 === 0,
    goalsFor: index === 4 ? 2 : 0,
    goalsAgainst: 0,
    statsPlayerData: {
      'Jugador A': { jugadorId: playerA.id, minutes: index === 4 ? 70 : 90, role: 'Titular' },
      'Jugador B': { jugadorId: playerB.id, minutes: index === 4 ? 20 : 0, role: 'Suplente' },
    },
    statsGoalEvents: index === 4 ? [
      { id: 'individual-goal-a', type: 'Gol a favor', minute: '15', scorerId: playerA.id, scorer: playerA.name, assistantId: playerB.id, assistant: playerB.name },
      { id: 'individual-assist-a', type: 'Gol a favor', minute: '50', scorerId: playerB.id, scorer: playerB.name, assistantId: playerA.id, assistant: playerA.name },
    ] : [],
  };
});
const individualDataset = buildDelegatedStatsDataset({ matches: individualSeason, filters: { matchId: individualMatchId } });
const individualPlayerRows = buildDelegatedPlayerRows({ events: individualDataset.events, matches: individualDataset.validatedMatches, players: [playerA, playerB, { id: '33333333-3333-4333-8333-333333333333', name: 'Jugador C' }], filters: { matchId: individualMatchId } });
const individualPlayerA = individualPlayerRows.find((row) => row.playerId === playerA.id);
assert.deepEqual({
  minutes: individualPlayerA.minutes,
  goals: individualPlayerA.stats.goals,
  assists: individualPlayerA.stats.assists,
  goalContributions: individualPlayerA.stats.goalContributions,
  shots: individualPlayerA.stats.shots,
  shotsOnTarget: individualPlayerA.stats.shotsOnTarget,
  steals: individualPlayerA.stats.steals,
}, { minutes: 70, goals: 1, assists: 1, goalContributions: 2, shots: 3, shotsOnTarget: 2, steals: 4 }, 'el partido individual no mezcla acumulados de temporada ni duplica el gol rápido');
assert.equal(individualPlayerRows.some((row) => row.playerId === '33333333-3333-4333-8333-333333333333'), false, 'un jugador con evento inconsistente pero sin minutos POST no aparece en el partido');
const restoredSeasonDataset = buildDelegatedStatsDataset({ matches: individualSeason });
const restoredSeasonA = buildDelegatedPlayerRows({ events: restoredSeasonDataset.events, matches: restoredSeasonDataset.validatedMatches, players: [playerA, playerB] }).find((row) => row.playerId === playerA.id);
assert.equal(restoredSeasonA.matchesPlayed, 10, 'volver a Todos los partidos recupera los 10 PJ');
assert.equal(restoredSeasonA.stats.shots, 12, 'volver a Todos los partidos recupera los acumulados delegados');
assert.deepEqual([restoredSeasonA.stats.goals, restoredSeasonA.stats.assists], [1, 1], 'volver a Todos los partidos recupera la producción oficial de temporada');
const matchComparison = buildDelegatedMatchSampleComparison({ matches: individualSeason, filters: { matchId: individualMatchId, team: 'caudal', scope: 'season' }, players: [playerA, playerB] });
assert.equal(matchComparison.sufficient, true);
assert.equal(matchComparison.rows.some((row) => ['dribbles', 'recoveries'].includes(row.key)), false, 'la comparativa del partido omite las dos métricas retiradas');
assert.deepEqual([matchComparison.rows.find((row) => row.key === 'shots').selected, matchComparison.rows.find((row) => row.key === 'shots').average], [3, 1.2], 'partido seleccionado compara su total con la media de los 10 partidos');
assert.deepEqual([matchComparison.rows.find((row) => row.key === 'goals').selected, matchComparison.rows.find((row) => row.key === 'goals').average], [2, 0.2], 'la comparación colectiva utiliza goles oficiales');
const playerMatchComparison = buildDelegatedMatchSampleComparison({ matches: individualSeason, filters: { matchId: individualMatchId, playerId: playerA.id, team: 'caudal', scope: 'season' }, players: [playerA, playerB] });
assert.deepEqual([playerMatchComparison.rows.find((row) => row.key === 'goals').selected, playerMatchComparison.rows.find((row) => row.key === 'goals').average], [1, 0.1], 'la comparación individual mantiene la autoría oficial del partido y de la temporada');
assert.deepEqual([playerMatchComparison.rows.find((row) => row.key === 'assists').selected, playerMatchComparison.rows.find((row) => row.key === 'assists').average], [1, 0.1]);

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
const officialTeamEvolution = buildDelegatedEvolution({ matches: officialProductionMatches, metric: 'goals' });
assert.deepEqual(officialTeamEvolution.map((row) => row.value), [1, 1, 1, 1, 1, 0, 0, 0, 0, 0], 'la evolución de goles de equipo usa el resultado oficial');
const officialPlayerEvolution = buildDelegatedEvolution({
  matches: officialProductionMatches,
  filters: { playerId: playerA.id, team: 'caudal' },
  metric: 'goals',
  players: [playerA, playerB],
});
assert.deepEqual(officialPlayerEvolution.map((row) => row.value), [1, 1, 0, 0, 0, 0, 0, 0, 0, 0], 'la evolución individual de goles usa autoría oficial, no quickEvents');

assert.equal(calculateDelegatedPerMatch({ shots: 7 }, 2).shots, 3.5, 'la media por partido divide el total entre la muestra real');
const livePerMatch = calculateDelegatedPerMatch({
  goals: 1,
  shots: 10,
  shotsOnTarget: 4,
  crosses: 5,
  turnovers: 8,
  steals: 3,
  foulsCommitted: 2,
  foulsReceived: 7,
}, 3, [
  'goals',
  'shots',
  'shotsOnTarget',
  'crosses',
  'turnovers',
  'steals',
  'foulsCommitted',
  'foulsReceived',
].map((key) => ({ key })));
assert.deepEqual(livePerMatch, {
  goals: 0.33,
  shots: 3.33,
  shotsOnTarget: 1.33,
  crosses: 1.67,
  turnovers: 2.67,
  steals: 1,
  foulsCommitted: 0.67,
  foulsReceived: 2.33,
}, 'Registro en vivo divide cada total entre los partidos filtrados que sí tienen eventos');
assert.equal(formatDelegatedNumber(livePerMatch.shots, 'average'), '3,3', 'la media muestra un decimal y separador español cuando hace falta');
assert.equal(formatDelegatedNumber(livePerMatch.steals, 'average'), '1', 'la media entera no fuerza decimales');

const participationMatches = [
  {
    ...match('p1', '2026-01-01', 'league', [baseEvent('tiro')], 90),
    statsPlayerData: {
      'Jugador A': { jugadorId: playerA.id, minutes: 90 },
      'Jugador B': { jugadorId: playerB.id, minutes: 0, role: 'Suplente' },
    },
  },
  {
    ...match('p2', '2026-01-02', 'league', [baseEvent('robo')], 30),
    statsPlayerData: {
      'Jugador A': { jugadorId: playerA.id, minutes: 30, role: 'Suplente' },
      'Jugador B': { jugadorId: playerB.id, minutes: 20, role: 'Suplente' },
    },
  },
];
const participationDataset = buildDelegatedStatsDataset({ matches: participationMatches });
const participationRows = buildDelegatedPlayerRows({ events: participationDataset.events, matches: participationDataset.validatedMatches, players: [playerA, playerB] });
const participationA = participationRows.find((row) => row.playerId === playerA.id);
const participationB = participationRows.find((row) => row.playerId === playerB.id);
assert.equal(participationA.matchesPlayed, 2, 'PJ cuenta únicamente participaciones con minutos positivos');
assert.equal(participationA.minutes, 120);
assert.equal(participationB.matchesPlayed, 1, 'un suplente con minutos suma un PJ');
assert.equal(participationB.minutes, 20, 'los minutos del suplente proceden de POST');
assert.equal(participationB.stats.shots, 0, 'participar no inventa acciones del delegado');
assert.equal(participationA.average.shots, 0.5, 'la media individual usa PJ real, no partidos con Registro Delegado');
assert.equal(participationA.per90.shots, 0.75, 'por90 usa total / minutos fiables × 90');
const individualEvolution = buildDelegatedEvolution({
  matches: participationMatches,
  filters: { playerId: playerB.id, team: 'caudal' },
  scope: 'season',
  metric: 'shots',
  players: [playerB],
});
assert.equal(individualEvolution[0].value, null, 'la evolución individual no convierte una no participación en cero');
assert.equal(individualEvolution[1].value, 0, 'una participación real sin esa acción sí se representa como cero');

const playerC = { id: '33333333-3333-4333-8333-333333333333', name: 'Jugador C' };
assert.equal(buildDelegatedPlayerRows({ events: participationDataset.events, matches: participationDataset.validatedMatches, players: [playerC] }).length, 0, 'un jugador sin participación ni eventos no entra en la tabla');

const contexts = [
  { ...match('ctx-home-win', '2026-02-01', 'league', [baseEvent('tiro')]), isHome: true, homeScore: 2, awayScore: 0 },
  { ...match('ctx-away-draw', '2026-02-02', 'league', [baseEvent('tiro')]), isHome: false, homeScore: 1, awayScore: 1 },
  { ...match('ctx-home-loss', '2026-02-03', 'cup', [baseEvent('tiro')]), isHome: true, homeScore: 0, awayScore: 1 },
];
assert.equal(getDelegatedMatchVenue(contexts[0]), 'home');
assert.equal(getDelegatedMatchVenue(contexts[1]), 'away');
assert.equal(getDelegatedMatchResult(contexts[0]), 'win');
assert.equal(getDelegatedMatchResult(contexts[1]), 'draw');
assert.equal(getDelegatedMatchResult(contexts[2]), 'loss');
assert.deepEqual(filterDelegatedValidatedMatches(contexts, { venue: 'home' }).map((row) => row.id), ['ctx-home-win', 'ctx-home-loss'], 'filtro local/visitante');
assert.deepEqual(filterDelegatedValidatedMatches(contexts, { result: 'draw' }).map((row) => row.id), ['ctx-away-draw'], 'filtro victoria/empate/derrota');
assert.deepEqual(filterDelegatedValidatedMatches(contexts, { competitionKey: 'league' }).map((row) => row.id), ['ctx-home-win', 'ctx-away-draw'], 'filtro Liga/otras competiciones');
assert.equal(buildDelegatedContextComparison({ matches: contexts, dimension: 'venue' }).find((row) => row.key === 'home').matchCount, 2);
assert.equal(buildDelegatedContextComparison({ matches: contexts, dimension: 'result' }).find((row) => row.key === 'loss').matchCount, 1);
assert.equal(buildDelegatedContextComparison({ matches: contexts, dimension: 'competition' }).find((row) => row.key === 'league').matchCount, 2);
assert.equal(buildDelegatedContextComparison({ matches: contexts, filters: { competitionKey: 'league' }, dimension: 'venue' }).find((row) => row.key === 'home').matchCount, 1, 'las comparaciones respetan los demás filtros activos');

const allPeriods = ['1', '16', '31', '46', '61', '76', '94'].map((minute) => baseEvent('tiro', { minute }));
const periodDistribution = buildDelegatedTemporalDistribution(allPeriods, 'shots');
assert.deepEqual(periodDistribution.rows.map((row) => row.caudal), [1, 1, 1, 1, 1, 2], 'todos los tramos se calculan y >90 entra en 76-90+');
assert.equal(buildDelegatedTemporalMatrix(allPeriods, 1).rows.find((row) => row.key === 'shots').values.length, 6, 'la matriz contiene los seis tramos');
assert.equal(buildDelegatedTemporalMatrix(allPeriods, 1).rows.some((row) => ['dribbles', 'recoveries'].includes(row.key)), false, 'la matriz temporal no presenta regates ni recuperaciones');
const halves = buildDelegatedHalfComparison(allPeriods);
assert.equal(halves.rows.some((row) => ['dribbles', 'recoveries'].includes(row.key)), false, 'la comparación por partes no presenta regates ni recuperaciones');
assert.equal(halves.rows.find((row) => row.key === 'shots').first, 3, 'primera parte usa minutos <=45');
assert.equal(halves.rows.find((row) => row.key === 'shots').second, 4, 'segunda parte usa minutos >45');

assert.equal(buildDelegatedRankings([{ stats: { dribbles: 5, recoveries: 4 }, player: playerA }]).length, 0, 'los rankings no generan destacados de métricas retiradas');

assert.deepEqual(calculateDelegatedMovingAverage([1, 2, 3, 4, 5, 6], 5), [null, null, null, null, 3, 4], 'media móvil de cinco sin valores prematuros');
assert.deepEqual(calculateDelegatedMovingAverage([1, 2, null, 4, 5], 5), [null, null, null, null, null], 'la media móvil no rellena muestras incompletas');
const evolutionComparison = buildDelegatedEvolutionComparison([
  { value: 1 }, { value: 2 }, { value: 3 }, { value: 4 }, { value: 5 }, { value: 10 },
]);
assert.equal(evolutionComparison.sufficient, true);
assert.equal(evolutionComparison.recent, 4.8, 'temporada vs últimos 5 usa exactamente los cinco más recientes');
assert.equal(buildDelegatedEvolutionComparison([{ value: 1 }, { value: 2 }]).sufficient, false, 'muestra insuficiente queda explícita');
assert.deepEqual(lastFive.map((row) => row.movingAverage == null), [true, true, true, true, false], 'la evolución solo muestra media móvil al completar cinco partidos');

const noRivalSides = aggregateDelegatedSides([baseEvent('tiro')]);
assert.equal(noRivalSides.hasRival, false, 'rival sin muestra no se convierte en cero confirmado');
const rivalEvent = baseEvent('tiro', { equipo: 'rival', playerId: null, jugadorId: null });
const withRivalSides = aggregateDelegatedSides([baseEvent('tiro'), rivalEvent]);
assert.equal(withRivalSides.hasRival, true, 'rival con muestra conserva sus valores reales');
assert.equal(buildDelegatedTeamProfile({ events: [rivalEvent], sampleEvents: [rivalEvent], matchCount: 3, side: 'rival' }).totals.shots, 1);

const combined = buildDelegatedStatsDataset({
  matches: contexts,
  filters: { competitionKey: 'league', venue: 'away', result: 'draw', team: 'caudal', eventType: 'tiro', period: '0-15', scope: '10' },
});
assert.equal(combined.validatedMatches.length, 1, 'los filtros combinados afectan a la misma muestra de partidos');
assert.equal(combined.events.length, 1, 'los filtros combinados afectan también a los eventos');

const readingMatches = Array.from({ length: 6 }, (_, index) => ({
  ...match(`read-${index}`, `2026-03-${String(index + 1).padStart(2, '0')}`, 'league', [
    baseEvent('tiro', { minute: 60 }),
    baseEvent('tiro', { minute: 70 }),
    baseEvent('perdida', { minute: 65 }),
    ...(index < 3 ? [baseEvent('tiro_puerta', { minute: 75 })] : []),
  ]),
  isHome: index < 3,
  homeScore: index % 2 ? 1 : 2,
  awayScore: index % 2 ? 1 : 0,
}));
const readings = buildDelegatedDataReadings({ matches: readingMatches, filters: { scope: 'season', team: 'caudal' } });
assert.ok(readings.some((row) => row.source === 'TEMPORAL' && /segunda parte/.test(row.text)), 'las lecturas deterministas explican su base temporal');
assert.ok(readings.some((row) => /61-75/.test(row.text)), 'la lectura de tramo máximo usa datos reales');
assert.deepEqual(buildDelegatedDataReadings({ matches: readingMatches.slice(0, 4) }), [], 'con menos de cinco partidos no se generan lecturas');

console.log('delegatedStats tests passed');
