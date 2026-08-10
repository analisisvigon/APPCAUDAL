import assert from 'node:assert/strict';
import { createSetPieceThumbnailLayers, findCrowdedSetPieceParticipants, sortSetPieceElementsForRender } from './setPieceRenderLayout.js';
import { getSetPieceGeometrySnapshot, optimizeSetPieceElementsForPrint } from './setPieceProfessional.js';

const complex = [
  { id: 'own-1', type: 'player', x: 50, y: 20, label: '9' },
  { id: 'arrow-1', type: 'arrow', x1: 10, y1: 60, x2: 50, y2: 20 },
  { id: 'zone-1', type: 'zone', x: 35, y: 8, width: 28, height: 20 },
  { id: 'rival-1', type: 'opponent', x: 52.5, y: 21, label: '4' },
  { id: 'ball-1', type: 'ball', x: 48, y: 23 },
  { id: 'block-1', type: 'block', x: 47, y: 19 },
  { id: 'text-1', type: 'text', x: 72, y: 12, label: 'SEGUNDO PALO' },
];
const geometryBefore = getSetPieceGeometrySnapshot(complex);
const ordered = sortSetPieceElementsForRender(complex);

assert.deepEqual(ordered.map((element) => element.type), ['zone', 'arrow', 'block', 'ball', 'opponent', 'player', 'text']);
assert.deepEqual(getSetPieceGeometrySnapshot(complex), geometryBefore, 'ordenar capas no modifica la geometría ni el array fuente');
assert.equal(ordered[ordered.length - 2].id, 'own-1', 'el jugador propio queda por encima de rival, balón, bloqueo y flecha');
assert.deepEqual(findCrowdedSetPieceParticipants(complex).map(({ leftId, rightId }) => [leftId, rightId]), [['own-1', 'rival-1']], 'la proximidad se detecta sin mover participantes');
assert.equal(findCrowdedSetPieceParticipants(complex, 2).length, 0, 'el umbral es explícito y controlado');
assert.deepEqual(createSetPieceThumbnailLayers({ zones: true, texts: true, chronology: true }), { zones: true, texts: false, chronology: false, dorsals: true, abbreviations: false, roles: false }, 'la miniatura conserva estructura y dorsal, pero elimina texto secundario');

const denseParticipants = [
  ...Array.from({ length: 10 }, (_, index) => ({ id: `own-${index + 1}`, type: 'player', x: 34 + (index % 5) * 6, y: 13 + Math.floor(index / 5) * 7, label: String(index + 1), name: `PROPIO ${index + 1}` })),
  ...Array.from({ length: 10 }, (_, index) => ({ id: `away-${index + 1}`, type: 'opponent', x: 36.5 + (index % 5) * 6, y: 15.5 + Math.floor(index / 5) * 7, label: String(index + 1), name: `RIVAL ${index + 1}` })),
];
const denseDiagram = [
  ...denseParticipants,
  { id: 'dense-ball', type: 'ball', x: 14, y: 58 },
  ...Array.from({ length: 6 }, (_, index) => ({ id: `dense-arrow-${index + 1}`, type: index === 4 ? 'curved_arrow' : index === 5 ? 'dashed_arrow' : 'arrow', x1: 12 + index * 5, y1: 60 - index * 2, x2: 38 + index * 5, y2: 18 + index, controlX: 30 + index * 5, controlY: 28 })),
  { id: 'dense-block-1', type: 'block', x: 43, y: 17, width: 7 },
  { id: 'dense-block-2', type: 'block', x: 55, y: 24, width: 7 },
  { id: 'dense-zone', type: 'zone', x: 28, y: 7, width: 40, height: 25, label: 'ZONA DE REMATE' },
];
const denseGeometry = getSetPieceGeometrySnapshot(denseDiagram);
const densePrint = optimizeSetPieceElementsForPrint(denseDiagram);
assert.equal(denseParticipants.filter((element) => element.type === 'player').length, 10);
assert.equal(denseParticipants.filter((element) => element.type === 'opponent').length, 10);
assert.deepEqual(getSetPieceGeometrySnapshot(densePrint), denseGeometry, 'editor, miniatura, preview y PDF conservan x/y y todos los trazados del caso denso');
assert.equal(densePrint.filter((element) => ['player', 'opponent'].includes(element.type)).every((element) => Number.isFinite(element.printLabelX) && Number.isFinite(element.printLabelY)), true, 'los 20 participantes reciben un offset de etiqueta de impresión');
assert.equal(sortSetPieceElementsForRender(densePrint).findIndex((element) => element.type === 'arrow') < sortSetPieceElementsForRender(densePrint).findIndex((element) => element.type === 'player'), true, 'las seis flechas quedan por debajo de los jugadores');

console.log('Set-piece render layout tests passed.');
