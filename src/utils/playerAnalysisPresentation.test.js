import assert from 'node:assert/strict';
import {
  PLAYER_ANALYSIS_PARTIAL_NOTE,
  buildCompetitionMinutesRows,
  buildPlayerAnalysisConnections,
  buildPlayerAnalysisOverviewPresentation,
  buildPlayerProductionCategories,
  buildPlayerProductionZones,
  filterPlayerProductionActions,
  formatPlayerAnalysisDate,
  getPlayerAnalysisVideoActions,
  getPlayerHistoryOutcomePresentation,
  getPlayerZoneMapGridClass,
  resolvePlayerHistoryVideoUrls,
  shouldShowPlayerCompetitionMinutes,
} from './playerAnalysisPresentation.js';

const overview = buildPlayerAnalysisOverviewPresentation({
  matchRecords: 8, matchesPlayed: 7, minutes: 462, minutesPerMatch: 66,
  possibleMinutes: 720, starts: 6, goals: 2, assists: 3,
  goalsCoverage: 'PARTIAL', assistsCoverage: 'COMPLETE',
  goalContributionsCoverage: 'PARTIAL', participationPercentage: 64.17,
});
assert.equal(overview.hasData, true);
assert.equal(overview.minutesPerMatch, 66);
assert.equal(overview.participation, 64.17);
assert.equal(overview.goalsPartial, true);
assert.equal(overview.assistsPartial, false);
assert.equal(overview.contributionsPartial, true);
assert.equal(buildPlayerAnalysisOverviewPresentation({ matchesPlayed: 0, minutes: 0 }).minutesPerMatch, 0, 'No divide por cero.');

assert.equal(shouldShowPlayerCompetitionMinutes('season'), true);
assert.equal(shouldShowPlayerCompetitionMinutes('all'), true);
for (const concreteScope of ['league', 'copa_rfef', 'playoff', 'friendly']) {
  assert.equal(shouldShowPlayerCompetitionMinutes(concreteScope), false, `${concreteScope} oculta el reparto.`);
}

const competitionDistributionSource = {
  enabled: true,
  scopeMinutes: [
    { key: 'league', minutes: 300 },
    { key: 'copa_rfef', minutes: 100 },
    { key: 'playoff', minutes: 0 },
    { key: 'friendly', minutes: 50 },
  ],
  historyRows: [
    { competitionKey: 'league', competitionName: 'Liga Segunda Federación', competitionLogoUrl: 'https://assets.example/league.png', minutes: 180 },
    { competitionKey: 'league', competitionName: 'Liga Segunda Federación', competitionLogoUrl: 'https://assets.example/league.png', minutes: 120 },
    { competitionKey: 'copa_rfef', competitionName: 'Copa RFEF', competitionLogoUrl: 'https://assets.example/cup.png', minutes: 100 },
    { competitionKey: 'friendly', competitionName: 'Amistosos', competitionLogoUrl: 'http://unsafe.example/friendly.png', minutes: 50 },
    { competitionKey: 'torneo_real', competitionName: 'Torneo Real', competitionLogoUrl: 'https://assets.example/tournament.png', minutes: 25 },
  ],
};
const competitionDistribution = buildCompetitionMinutesRows(competitionDistributionSource, 475);
assert.deepEqual(competitionDistribution.rows.map(({ key, name, logoUrl, minutes }) => ({ key, name, logoUrl, minutes })), [
  { key: 'league', name: 'Liga Segunda Federación', logoUrl: 'https://assets.example/league.png', minutes: 300 },
  { key: 'copa_rfef', name: 'Copa RFEF', logoUrl: 'https://assets.example/cup.png', minutes: 100 },
  { key: 'friendly', name: 'Amistosos', logoUrl: '', minutes: 50 },
  { key: 'torneo_real', name: 'Torneo Real', logoUrl: 'https://assets.example/tournament.png', minutes: 25 },
]);
assert.deepEqual(competitionDistribution.rows.map((row) => row.percentage), [63.2, 21.1, 10.5, 5.3]);
assert.equal(competitionDistribution.percentageTotal, 100.1, 'El redondeo puede separar la suma una décima del 100 %.');
assert.equal(competitionDistribution.accountedMinutes, 475);
assert.equal(competitionDistribution.reconciles, true);
assert.equal(competitionDistribution.rows.some((row) => row.key === 'playoff'), false, 'Las competiciones con cero minutos no aparecen.');

const seasonWithoutFriendly = buildCompetitionMinutesRows({
  ...competitionDistributionSource,
  historyRows: competitionDistributionSource.historyRows.filter((row) => row.competitionKey !== 'friendly' && row.competitionKey !== 'torneo_real'),
}, 400);
assert.deepEqual(seasonWithoutFriendly.rows.map((row) => row.key), ['league', 'copa_rfef'], 'El historial del ámbito season impide incluir amistosos al 100 %.');
assert.equal(seasonWithoutFriendly.percentageTotal, 100);

const singleCompetition = buildCompetitionMinutesRows({
  enabled: true,
  scopeMinutes: [{ key: 'copa_rfef', minutes: 347 }],
  historyRows: [{ competitionKey: 'copa_rfef', competitionName: 'Copa RFEF', minutes: 347 }],
}, 347);
assert.deepEqual(singleCompetition.rows.map((row) => [row.name, row.minutes, row.percentage]), [
  ['Copa RFEF', 347, 100],
], 'Una sola competición con minutos se muestra al 100 %.');

const unclassifiedDistribution = buildCompetitionMinutesRows({
  enabled: true,
  scopeMinutes: [{ key: 'league', minutes: 90 }],
  historyRows: [
    { competitionKey: 'league', competitionName: 'Liga', minutes: 90 },
    { competitionKey: '', competitionName: '', minutes: 10 },
  ],
}, 100);
assert.equal(unclassifiedDistribution.unclassifiedMinutes, 10);
assert.equal(unclassifiedDistribution.reconciliationDelta, 10);
assert.equal(unclassifiedDistribution.reconciles, false, 'Los minutos sin competición no se esconden ni se inventan.');
assert.deepEqual(buildCompetitionMinutesRows({ enabled: true }, 0).rows, [], 'Cero minutos produce bloque vacío sin dividir por cero.');
assert.deepEqual(buildCompetitionMinutesRows({ enabled: false }, 200).rows, []);

const actions = [{
  actionType: 'goal', counterpartRole: 'assistant', counterpartName: 'Compañero A',
  shotZoneKey: 'finalizacion_centro', shotZoneName: 'Finalización centro',
  goalZoneKey: 'alta_centro', goalZoneName: 'Alta centro', phase: 'ABP',
  subphase: 'Córner', contact: 'Cabeza', videoAvailable: true, videoUrl: 'https://youtu.be/a',
}, {
  actionType: 'assist', counterpartRole: 'scorer', counterpartName: 'Compañero B',
  assistZoneKey: 'creacion_derecha', assistZoneName: 'Creación derecha',
  videoAvailable: false, videoUrl: '',
}, {
  actionType: 'goal', counterpartRole: '', counterpartName: '',
  shotZoneKey: '', goalZoneKey: '', phase: '', subphase: '', contact: '',
  videoAvailable: false, videoUrl: '',
}];

assert.equal(filterPlayerProductionActions(actions, 'Goles').length, 2);
assert.equal(filterPlayerProductionActions(actions, 'Asistencias').length, 1);
assert.equal(filterPlayerProductionActions(actions, 'Todos').length, 3);

const zones = buildPlayerProductionZones(actions);
assert.equal(zones.shots.find((zone) => zone.value === 'finalizacion_centro').count, 1);
assert.equal(zones.assists.find((zone) => zone.value === 'creacion_derecha').count, 1);
assert.equal(zones.goals.find((zone) => zone.value === 'alta_centro').count, 1);
assert.equal(zones.shots.reduce((total, zone) => total + zone.count, 0), 1, 'No se infieren zonas ausentes.');
assert.equal(getPlayerZoneMapGridClass(1), 'max-w-md', 'Un mapa conserva un ancho compacto.');
assert.equal(getPlayerZoneMapGridClass(2), 'max-w-4xl sm:grid-cols-2', 'Dos mapas usan dos columnas desde tablet.');
assert.equal(getPlayerZoneMapGridClass(3), 'sm:grid-cols-2 xl:grid-cols-3', 'Tres mapas alcanzan tres columnas en desktop.');

assert.deepEqual(buildPlayerProductionCategories(actions), {
  phases: [{ label: 'ABP', count: 1 }],
  subphases: [{ label: 'Córner', count: 1 }],
  contacts: [{ label: 'Cabeza', count: 1 }],
});
assert.deepEqual(buildPlayerAnalysisConnections(actions), [
  { name: 'Compañero A', given: 0, received: 1, total: 1 },
  { name: 'Compañero B', given: 1, received: 0, total: 1 },
]);
assert.equal(getPlayerAnalysisVideoActions(actions).length, 1);

const historyMatch = {
  matchDate: '2026-08-16', opponent: 'Rival seguro', competitionKey: 'league',
  competitionName: 'Liga', venue: 'home', hasAllowedVideo: true,
};
const matchingVideoAction = {
  ...historyMatch,
  actionType: 'assist', videoAvailable: true, videoUrl: 'https://www.youtube.com/watch?v=unico',
};
assert.deepEqual(
  resolvePlayerHistoryVideoUrls([historyMatch], [matchingVideoAction]),
  ['https://www.youtube.com/watch?v=unico'],
  'Un único vídeo de una relación inequívoca se puede enlazar desde Historial.',
);
assert.deepEqual(
  resolvePlayerHistoryVideoUrls([historyMatch], []),
  [null],
  'Sin acción cargada con URL no se inventa un enlace.',
);
assert.deepEqual(
  resolvePlayerHistoryVideoUrls([historyMatch], [
    matchingVideoAction,
    { ...matchingVideoAction, actionType: 'goal', videoUrl: 'https://youtu.be/segundo' },
  ]),
  [null],
  'Varios vídeos del mismo partido son ambiguos y no eligen una URL arbitraria.',
);
assert.deepEqual(
  resolvePlayerHistoryVideoUrls([historyMatch, { ...historyMatch }], [matchingVideoAction]),
  [null, null],
  'Dos filas de historial con la misma identidad impiden una asociación supuestamente inequívoca.',
);
assert.deepEqual(
  resolvePlayerHistoryVideoUrls([historyMatch], [{ ...matchingVideoAction, videoUrl: 'https://evil.example/video' }]),
  [null],
  'La resolución del Historial vuelve a validar la allowlist de vídeo.',
);
assert.equal(formatPlayerAnalysisDate('2026-08-16'), '16/08/2026');
assert.equal(formatPlayerAnalysisDate(''), 'Fecha no disponible');
assert.deepEqual(getPlayerHistoryOutcomePresentation('win'), {
  label: 'V', tone: 'bg-emerald-200/15 text-emerald-100',
});
assert.equal(PLAYER_ANALYSIS_PARTIAL_NOTE, 'Dato disponible parcialmente');

console.log('playerAnalysisPresentation: ratios, zonas, categorías, conexiones y vídeo inequívoco de historial validados.');
