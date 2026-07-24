import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasInitialPositionOverlap } from './defensiveBlockPositions.js';
import { getSetPieceInitialPositions } from './setPiecePositions.js';
import {
  getBallPositionKey,
  getDefaultSetPieceBallPosition,
  getSetPieceZonePoints,
} from './setPieceZones.js';

const buildFormationSlots = (system) => {
  const lines = system.split('-').map(Number);
  const slots = [{ slot: 0, role: 'Portero', x: 50, y: 89 }];
  lines.forEach((lineSize, lineIndex) => {
    const margin = lineSize >= 5 ? 12 : lineSize === 4 ? 17 : lineSize === 3 ? 25 : lineSize === 2 ? 39 : 50;
    Array.from({ length: lineSize }, (_, playerIndex) => (
      lineSize === 1 ? 50 : margin + ((100 - margin * 2) * playerIndex) / (lineSize - 1)
    )).forEach((x) => slots.push({ slot: slots.length, x, y: 75 - lineIndex * 25 }));
  });
  return slots;
};

const rivalSlots = buildFormationSlots('4-4-2');
const caudalSlots = buildFormationSlots('4-3-3');
const buildPreset = (setPieceType, setPieceAction, ballStartPosition) => getSetPieceInitialPositions({
  setPieceType,
  setPieceAction,
  ballStartPosition,
  rivalFormationSlots: rivalSlots,
  caudalFormationSlots: caudalSlots,
});

const offensiveCornerZones = getSetPieceZonePoints('offensive_set_piece', 'corner');
const defensiveCornerZones = getSetPieceZonePoints('defensive_set_piece', 'corner');
assert.equal(offensiveCornerZones.length, 2, 'Córner ofrece únicamente dos esquinas');
assert.ok(offensiveCornerZones.every(({ position }) => [5, 95].includes(position.x) && position.y === 95));
assert.ok(defensiveCornerZones.every(({ position }) => [5, 95].includes(position.x) && position.y === 5));

const wideZones = getSetPieceZonePoints('offensive_set_piece', 'wide_free_kick');
assert.equal(wideZones.length, 10, 'Falta lateral ofrece cinco puntos por banda');
assert.ok(wideZones.every(({ position }) => [7, 93].includes(position.x)), 'Falta lateral no activa el centro');

const centralZones = getSetPieceZonePoints('offensive_set_piece', 'central_free_kick');
assert.equal(centralZones.length, 4, 'Falta frontal ofrece cuatro profundidades y orientaciones');
assert.ok(centralZones.every(({ position }) => position.x >= 38 && position.x <= 62), 'Falta frontal no activa las bandas');

const throwInZones = getSetPieceZonePoints('offensive_set_piece', 'throw_in');
assert.equal(throwInZones.length, 10, 'Saque de banda ofrece puntos en toda la longitud de ambas bandas');
assert.ok(throwInZones.every(({ position }) => [5, 95].includes(position.x)));
assert.deepEqual(
  getDefaultSetPieceBallPosition('offensive_set_piece', 'corner'),
  { x: 5, y: 95 }
);
assert.equal(new Set(throwInZones.map(({ position }) => position.y)).size, 5, 'Saque de banda distingue campo propio, medio y último tercio');

const allContexts = [
  ['offensive_set_piece', 'corner', offensiveCornerZones],
  ['offensive_set_piece', 'wide_free_kick', wideZones],
  ['offensive_set_piece', 'central_free_kick', centralZones],
  ['offensive_set_piece', 'throw_in', throwInZones],
  ['defensive_set_piece', 'corner', defensiveCornerZones],
  ['defensive_set_piece', 'wide_free_kick', getSetPieceZonePoints('defensive_set_piece', 'wide_free_kick')],
  ['defensive_set_piece', 'central_free_kick', getSetPieceZonePoints('defensive_set_piece', 'central_free_kick')],
  ['defensive_set_piece', 'throw_in', getSetPieceZonePoints('defensive_set_piece', 'throw_in')],
];
allContexts.forEach(([setPieceType, setPieceAction, zones]) => zones.forEach(({ position }) => {
  const preset = buildPreset(setPieceType, setPieceAction, position);
  assert.equal(Object.keys(preset).length, 22, `${setPieceType}:${setPieceAction}:${getBallPositionKey(position)} genera 22 jugadores`);
  assert.equal(hasInitialPositionOverlap(preset), false, `${setPieceType}:${setPieceAction}:${getBallPositionKey(position)} evita solapamientos`);
}));

const leftCorner = buildPreset('offensive_set_piece', 'corner', offensiveCornerZones[0].position);
const rightCorner = buildPreset('offensive_set_piece', 'corner', offensiveCornerZones[1].position);
assert.notDeepEqual(leftCorner, rightCorner, 'los córners izquierdo y derecho cargan presets invertidos');
assert.ok(leftCorner['rival:1'].x < rightCorner['rival:1'].x, 'el lanzador cambia de lado con el balón');

const nearWide = buildPreset('offensive_set_piece', 'wide_free_kick', wideZones[0].position);
const deepWide = buildPreset('offensive_set_piece', 'wide_free_kick', wideZones[8].position);
assert.notDeepEqual(nearWide, deepWide, 'la falta lateral adapta el preset a la distancia');

const earlyThrow = buildPreset('offensive_set_piece', 'throw_in', throwInZones[0].position);
const finalThirdThrow = buildPreset('offensive_set_piece', 'throw_in', throwInZones[8].position);
assert.notDeepEqual(earlyThrow, finalThirdThrow, 'el saque de banda cambia entre salida y último tercio');

const distance = (left, right) => Math.hypot(left.x - right.x, left.y - right.y);
const cornerBall = offensiveCornerZones[0].position;
const rivalOutfieldDistances = Array.from({ length: 10 }, (_, index) => (
  distance(leftCorner[`rival:${index + 1}`], cornerBall)
));
assert.equal(
  rivalOutfieldDistances.indexOf(Math.min(...rivalOutfieldDistances)),
  0,
  'el jugador rival más cercano queda configurado como lanzador en ABP ofensiva'
);

const defensiveCorner = buildPreset('defensive_set_piece', 'corner', defensiveCornerZones[0].position);
const defensiveBall = defensiveCornerZones[0].position;
const caudalOutfieldDistances = Array.from({ length: 10 }, (_, index) => (
  distance(defensiveCorner[`caudal:${index + 1}`], defensiveBall)
));
assert.equal(
  caudalOutfieldDistances.indexOf(Math.min(...caudalOutfieldDistances)),
  0,
  'el jugador del Caudal más cercano queda como lanzador en ABP defensiva'
);

const setPieceWorkspace = {
  version: 1,
  activeSetPieceType: 'offensive_set_piece',
  activeActionByType: { offensive_set_piece: 'corner', defensive_set_piece: 'corner' },
  activeBallPositionByContext: {
    'offensive_set_piece:corner': offensiveCornerZones[0].position,
  },
  activePlayIdByContext: {
    'offensive_set_piece:corner:5:95': 'set-piece-1',
  },
  plays: [{
    id: 'set-piece-1',
    phase: 'set_piece',
    setPieceType: 'offensive_set_piece',
    setPieceAction: 'corner',
    ballStartPosition: offensiveCornerZones[0].position,
    playerPositions: leftCorner,
    arrows: [{ id: 'arrow-1', type: 'pass', start: { x: 5, y: 95 }, end: { x: 45, y: 86 } }],
    description: 'Bloqueo al primer palo.',
  }],
};
const analysis = {
  defensivePhaseV1: { plays: [{ id: 'defensive-1' }] },
  offensivePhaseV1: { plays: [{ id: 'offensive-1' }] },
  transitionPhaseV1: { plays: [{ id: 'transition-1' }] },
  setPiecePhaseV1: setPieceWorkspace,
};
const reloaded = JSON.parse(JSON.stringify(analysis));
assert.deepEqual(reloaded.setPiecePhaseV1.plays[0].ballStartPosition, { x: 5, y: 95 });
assert.equal(reloaded.setPiecePhaseV1.plays[0].arrows[0].type, 'pass');
assert.equal(reloaded.defensivePhaseV1.plays[0].id, 'defensive-1');
assert.equal(reloaded.offensivePhaseV1.plays[0].id, 'offensive-1');
assert.equal(reloaded.transitionPhaseV1.plays[0].id, 'transition-1');

const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
assert.ok(appSource.includes('setPiecePhaseV1: normalizedWorkspace'), 'ABP persiste en un workspace independiente');
assert.ok(appSource.includes("console.error('[SET_PIECE_PHASE_SAVE]'"), 'el error de guardado ABP queda identificado');
assert.ok(appSource.includes('aria-label="Selector visual de la posición inicial del balón"'), 'el selector es un SVG interactivo accesible');
assert.ok(appSource.includes('onPointerDown={beginSetPieceBallDrag}'), 'el balón puede moverse con la herramienta actual');
assert.ok(appSource.includes('ballStartPosition: { ...targetBallStartPosition }'), 'las plantillas crean una copia independiente de la posición');
assert.equal(
  (appSource.match(/buildSetPieceInitialPlayerPositions\(/g) || []).length,
  2,
  'el preset ABP solo se calcula al crear y restablecer'
);

console.log('setPiecePositions tests passed');
