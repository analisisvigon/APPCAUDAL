import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildTacticalEvidenceEngine,
  getPlayerTacticalEvidence,
  selectTacticalEvidenceForQuestion,
} from './tacticalEvidenceEngine.js';
import {
  buildConfirmedTacticalEvidenceReport,
  buildTacticalEvidenceCenter,
  filterConfirmedTacticalEvidenceContexts,
  humanizeTacticalConnection,
} from './tacticalEvidenceCenter.js';

const player = (id, boardKey, name, specificPosition) => ({
  playerId: id,
  boardKey,
  name,
  specificPosition,
  meaningful: true,
  roles: [],
});

const makeContext = (id, phase = 'offensive') => ({
  playId: id,
  playName: `Jugada ${id}`,
  phase,
  phaseLabel: phase === 'transition' ? 'Transiciones' : 'Fase ofensiva',
  rivalTeamId: 'team-rival',
  rivalSystem: '4-3-3',
  caudalSystem: '4-4-2',
  playStyleLabel: 'Juego combinativo',
  sourceTemplateId: null,
  manualDescription: '',
  playerPositions: {
    'rival:1': { x: 10, y: 25 },
    'rival:2': { x: 18, y: 48 },
    'rival:3': { x: 42, y: 40 },
  },
  involvedPlayers: [
    player('central', 'rival:1', 'Central derecho', 'Central derecho'),
    player('lateral', 'rival:2', 'Lateral derecho', 'Lateral derecho'),
    player('medio', 'rival:3', 'Mediocentro', 'Mediocentro'),
  ],
  arrows: [
    { id: `pass-${id}`, type: 'pass', start: { x: 10, y: 25 }, end: { x: 18, y: 48 } },
    { id: `move-${id}`, type: 'movement', start: { x: 18, y: 48 }, end: { x: 8, y: 66 } },
  ],
  connections: [],
  sources: [{ type: 'tactical_play', id, label: `Jugada ${id}` }],
});

const contexts = [makeContext('p1'), makeContext('p2'), makeContext('p3')];
const report = buildTacticalEvidenceEngine(contexts);

assert.equal(report.playCount, 3, 'procesa las jugadas guardadas una sola vez');
assert.equal(report.connections[0].count, 3, 'agrega flechas de pase repetidas');
assert.equal(report.connections[0].label, 'Central derecho → Lateral derecho');
assert.equal(report.zones.broad.find((row) => row.label === 'Derecha').percentage, 100, 'la izquierda visual del rival es su derecha táctica');
assert.equal(report.movements.find((row) => row.label === 'Ruptura').count, 3, 'clasifica una ruptura solo por avance geométrico demostrable');
assert.equal(report.movements.find((row) => row.label === 'Amplitud').count, 3, 'clasifica amplitud al acabar en banda con desplazamiento lateral');
assert.ok(report.risks.some((risk) => /derecha/.test(risk.conclusion)), 'solo crea riesgo lateral con muestra y umbral suficientes');
assert.match(report.planRecommendations['Con balón'].conclusion, /derecha|conexión/i, 'el plan consume el informe derivado');
assert.equal(report.contextRows[0].rivalTeamId, 'team-rival', 'conserva el contexto real sin duplicarlo');
assert.equal(report.contextRows[0].participants.length, 3, 'registra participantes identificables de la jugada');

const lateral = getPlayerTacticalEvidence(report, 'lateral');
assert.equal(lateral.playCount, 3);
assert.equal(lateral.connectionsReceived, 3);
assert.equal(lateral.connectionsCreated, 0);
assert.ok(lateral.movementTypes.some((row) => row.label === 'Ruptura'));
assert.equal(lateral.connections[0].contexts.length, 3, 'cada conexión conserva sus contextos reales de jugada');
assert.ok(lateral.connections[0].contexts.every((context) => context.phase === 'offensive'), 'la fase llega al clasificador individual');

const empty = buildTacticalEvidenceEngine([]);
const noEvidence = selectTacticalEvidenceForQuestion(empty, '¿Cómo progresa el rival?');
assert.match(noEvidence.conclusion, /Información insuficiente/);
assert.equal(noEvidence.sources.length, 0);
assert.match(empty.planRecommendations.ABP.conclusion, /Información insuficiente/);

const staticOnly = buildTacticalEvidenceEngine([{
  ...makeContext('static'),
  arrows: [],
  involvedPlayers: makeContext('static').involvedPlayers.map((row) => ({ ...row, meaningful: false })),
}]);
assert.equal(staticOnly.connections.length, 0, 'no inventa conexiones desde posiciones estáticas');
assert.equal(staticOnly.movements.length, 0, 'no inventa movimientos desde posiciones estáticas');
assert.equal(staticOnly.players.length, 0, 'no atribuye participación por mera presencia');

const pendingCenter = buildTacticalEvidenceCenter({ report, validations: {}, manualEvidences: [] });
assert.equal(pendingCenter.confirmedCount, 0, 'ninguna evidencia alimenta consumidores sin confirmación del staff');
assert.ok(pendingCenter.pendingItems.every((item) => item.playCount >= 2), 'solo las repeticiones trazables llegan a pendientes de validación');
const repeatedConnection = pendingCenter.items.find((item) => item.type === 'connection');
assert.ok(repeatedConnection.canConfirm, 'una conexión presente en tres jugadas distintas puede confirmarse');

const confirmedCenter = buildTacticalEvidenceCenter({
  report,
  validations: {
    [repeatedConnection.id]: {
      status: 'confirmed',
      updatedAt: '2026-08-02T12:00:00.000Z',
      updatedBy: 'Analista',
      history: [{ status: 'confirmed', at: '2026-08-02T12:00:00.000Z', by: 'Analista' }],
    },
  },
});
assert.equal(confirmedCenter.confirmedCount, 1);
assert.deepEqual(confirmedCenter.confirmedPlayIds.sort(), ['p1', 'p2', 'p3']);
assert.equal(filterConfirmedTacticalEvidenceContexts(report, confirmedCenter).length, 3, 'los consumidores reciben solo jugadas respaldadas por evidencias confirmadas');
assert.equal(confirmedCenter.confirmedItems[0].usedIn.rival, true);
assert.equal(confirmedCenter.confirmedItems[0].usedIn.plan, true);
assert.equal(confirmedCenter.confirmedItems[0].usedIn.players, true);
const confirmedReport = buildConfirmedTacticalEvidenceReport(report, confirmedCenter);
assert.equal(confirmedReport.connections.length, 1, 'conserva la relación confirmada');
assert.equal(confirmedReport.movements.length, 0, 'no arrastra movimientos no confirmados desde las mismas jugadas');
assert.equal(confirmedReport.patterns.length, 0, 'no arrastra patrones no confirmados desde las mismas jugadas');
assert.equal(confirmedReport.zones.total, 0, 'no convierte zonas no confirmadas en conclusiones laterales');

const onePlayReport = buildTacticalEvidenceEngine([makeContext('single')]);
const onePlayCenter = buildTacticalEvidenceCenter({ report: onePlayReport });
const isolatedConnection = onePlayCenter.items.find((item) => item.type === 'connection');
const forcedSingleConfirmation = buildTacticalEvidenceCenter({
  report: onePlayReport,
  validations: { [isolatedConnection.id]: { status: 'confirmed' } },
});
assert.equal(forcedSingleConfirmation.confirmedCount, 0, 'una única jugada nunca se convierte en patrón aunque exista un estado legacy incorrecto');
assert.equal(forcedSingleConfirmation.signalItems.some((item) => item.id === isolatedConnection.id), true);
assert.equal(filterConfirmedTacticalEvidenceContexts(onePlayReport, forcedSingleConfirmation).length, 0);

assert.equal(humanizeTacticalConnection({ label: 'right_centre_back → left_back' }), 'Central derecho conecta habitualmente con Lateral izquierdo');

const componentSource = fs.readFileSync(new URL('../components/tactical/TacticalEvidencePanel.jsx', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
assert.match(componentSource, /Centro de validación táctica/);
assert.match(componentSource, /Evidencias pendientes de validar/);
assert.match(componentSource, /Patrones confirmados/);
assert.match(componentSource, /Señales detectadas/);
assert.match(componentSource, /Cobertura del análisis/);
assert.match(componentSource, /Relaciones detectadas/);
assert.doesNotMatch(componentSource, />\s*right_centre_back\s*</, 'la interfaz no imprime códigos posicionales internos');
assert.match(appSource, /buildConfirmedTacticalEvidenceReport\(tacticalEvidenceReport, tacticalEvidenceCenter\)/, 'Rival, Jugadores y Plan parten exclusivamente del subconjunto confirmado');
assert.match(appSource, /tacticalEvidenceValidationsV1: nextValidations/, 'la validación se persiste en el análisis PRE compartido del partido');
assert.match(appSource, /plays: confirmedCollectiveAssistantPlays/);
assert.match(appSource, /tacticalEvidenceReport: confirmedTacticalEvidenceReport/);

console.log('tacticalEvidenceEngine tests: ok');
