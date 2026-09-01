import assert from 'node:assert/strict';
import {
  PLAYER_ANALYSIS_PARTIAL_NOTE,
  buildPlayerAnalysisConnections,
  buildPlayerAnalysisOverviewPresentation,
  buildPlayerProductionCategories,
  buildPlayerProductionZones,
  filterPlayerProductionActions,
  formatPlayerAnalysisDate,
  getPlayerAnalysisVideoActions,
  getPlayerHistoryOutcomePresentation,
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
assert.equal(formatPlayerAnalysisDate('2026-08-16'), '16/08/2026');
assert.equal(formatPlayerAnalysisDate(''), 'Fecha no disponible');
assert.deepEqual(getPlayerHistoryOutcomePresentation('win'), {
  label: 'V', tone: 'bg-emerald-200/15 text-emerald-100',
});
assert.equal(PLAYER_ANALYSIS_PARTIAL_NOTE, 'Dato disponible parcialmente');

console.log('playerAnalysisPresentation: ratios, zonas, categorías, conexiones, vídeo e historial validados.');
