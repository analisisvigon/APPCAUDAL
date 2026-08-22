import assert from 'node:assert/strict';
import {
  buildPlayerBodyPartSummary,
  buildPlayerConnectionRows,
  buildPlayerGoalTargetSummary,
  buildPlayerGoalTypeSummary,
  buildPlayerProductionAction,
  buildPlayerProductionInvariantReport,
  getPlayerInfluenceActions,
} from './playerProductionDetails.js';

const goals = [
  { id: 'g1', action: 'Gol', contact: 'Pie derecho', phase: 'ABP', subphase: 'Córner', goalZone: 'alto_derecha', assistant: 'Jairo' },
  { id: 'g2', action: 'Gol', contact: 'Pie izquierdo', phase: 'Transición', subphase: 'Tras robo', goalZone: '', assistant: 'Jairo' },
  { id: 'g3', action: 'Gol', contact: 'Cabeza', phase: 'ABP', subphase: 'Córner', goalZone: 'centro', assistant: '' },
  { id: 'g4', action: 'Gol', contact: '', phase: '', subphase: '', goalZone: '', assistant: '' },
];
const assists = [
  { id: 'a1', action: 'Asistencia', scorer: 'Óscar', assistZone: 'creacion_derecha' },
  { id: 'a2', action: 'Asistencia', scorer: 'Óscar', assistZone: '' },
];

assert.deepEqual(buildPlayerBodyPartSummary(goals), {
  values: [
    { label: 'Cabeza', count: 1 },
    { label: 'Pie derecho', count: 1 },
    { label: 'Pie izquierdo', count: 1 },
  ],
  known: 3,
  missing: 1,
  total: 4,
}, 'pie derecho, pie izquierdo y cabeza se cuentan desde contact sin inferencias');

assert.deepEqual(buildPlayerGoalTargetSummary(goals), {
  values: [{ label: 'alto_derecha', count: 1 }, { label: 'centro', count: 1 }],
  known: 2,
  missing: 2,
  total: 4,
}, 'la diana cuenta únicamente goalZone y separa los goles sin dato');

assert.deepEqual(buildPlayerGoalTypeSummary(goals), {
  phases: [{ label: 'ABP', count: 2 }, { label: 'Transición', count: 1 }],
  subphases: [{ label: 'Córner', count: 2 }, { label: 'Tras robo', count: 1 }],
  known: 3,
  missing: 1,
  total: 4,
});

assert.deepEqual(buildPlayerConnectionRows({ goalActions: goals, assistActions: assists, filter: 'Goles' }), [
  { name: 'Jairo', given: 0, received: 2, total: 2 },
], 'Goles sólo muestra quién asistió al jugador');
assert.deepEqual(buildPlayerConnectionRows({ goalActions: goals, assistActions: assists, filter: 'Asistencias' }), [
  { name: 'Óscar', given: 2, received: 0, total: 2 },
], 'Asistencias sólo muestra a quién asistió el jugador');
assert.equal(buildPlayerConnectionRows({ goalActions: goals, assistActions: assists, filter: 'Todos' }).length, 2);
assert.deepEqual(getPlayerInfluenceActions({ goalActions: goals, assistActions: assists, filter: 'Goles' }).map((row) => row.id), ['g1', 'g2', 'g3', 'g4']);
assert.deepEqual(getPlayerInfluenceActions({ goalActions: goals, assistActions: assists, filter: 'Asistencias' }).map((row) => row.id), ['a1', 'a2']);

const normalized = buildPlayerProductionAction({
  action: 'Gol', minute: 0, phase: 'ABP', contact: 'Cabeza', scorer: 'Jugador', assistant: null,
  shotZone: 'finalizacion_centro', goalZone: 'alto_centro', videoUrl: 'https://video.example/g1',
});
assert.equal(normalized.minute, '0', 'el minuto 0 no se trata como dato ausente');
assert.equal(normalized.contact, 'Cabeza');
assert.equal(normalized.assistant, '', 'un participante ausente permanece ausente');
assert.equal(normalized.videoUrl, 'https://video.example/g1');
assert.equal(buildPlayerProductionAction(assists[0]).assistZone, 'creacion_derecha', 'una asistencia con zona conserva el valor oficial');
assert.equal(buildPlayerProductionAction(assists[1]).assistZone, '', 'una asistencia sin zona permanece sin registrar');

const jairoInvariant = buildPlayerProductionInvariantReport({
  goals: [{ contact: 'Cabeza', phase: 'Juego directo', goalZone: 'alta_centro', assistant: 'Borja Rodríguez' }],
  assists: [],
  bodyParts: { known: 1 },
  goalTypes: { known: 1 },
  goalTarget: { known: 1, zones: [{ value: 'alta_centro', count: 1 }] },
  connections: [{ name: 'Borja Rodríguez', given: 0, received: 1 }],
});
assert.equal(jairoInvariant.valid, true);
assert.equal(jairoInvariant.targetCellTotal, 1, 'Jairo: Alta centro suma exactamente un gol');
assert.equal(buildPlayerProductionInvariantReport({ goals: [{}], goalTarget: { known: 1, zones: [{ value: 'alta_centro', count: 0 }] } }).valid, false, 'se bloquea la contradicción 1 con zona y diana 0');

console.log('playerProductionDetails tests passed');
