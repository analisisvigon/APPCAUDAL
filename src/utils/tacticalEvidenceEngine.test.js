import assert from 'node:assert/strict';

import {
  buildTacticalEvidenceEngine,
  getPlayerTacticalEvidence,
  selectTacticalEvidenceForQuestion,
} from './tacticalEvidenceEngine.js';

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

console.log('tacticalEvidenceEngine tests: ok');
