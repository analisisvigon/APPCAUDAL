import assert from 'node:assert/strict';
import {
  createDiagramElement,
  createDiagramHistory,
  duplicateDiagramElement,
  moveDiagramHistory,
  pushDiagramHistory,
} from './diagramEditorState.js';

let id = 0;
const createId = () => `element-${++id}`;
const player = createDiagramElement('player', createId);
const opponent = createDiagramElement('opponent', createId);
const ball = createDiagramElement('ball', createId);
const straight = createDiagramElement('arrow', createId);
const curved = createDiagramElement('curved_arrow', createId);
const dashed = createDiagramElement('dashed_arrow', createId);
const zone = createDiagramElement('zone', createId);
const text = createDiagramElement('text', createId);

assert.deepEqual([player.type, opponent.type, ball.type, straight.type, curved.type, dashed.type, zone.type, text.type], [
  'player', 'opponent', 'ball', 'arrow', 'curved_arrow', 'dashed_arrow', 'zone', 'text',
]);
assert.equal(new Set([player, opponent, ball, straight, curved, dashed, zone, text].map((element) => element.id)).size, 8);
assert.ok(Number.isFinite(curved.controlX) && Number.isFinite(curved.controlY), 'la flecha curva nace con control editable');

const duplicatedCurve = duplicateDiagramElement(curved, createId);
assert.notEqual(duplicatedCurve.id, curved.id);
assert.equal(duplicatedCurve.controlX, curved.controlX + 4);
duplicatedCurve.controlX = 99;
assert.notEqual(curved.controlX, 99, 'el duplicado no comparte referencias mutables');

let history = createDiagramHistory([]);
history = pushDiagramHistory(history, [player]);
history = pushDiagramHistory(history, [player, ball]);
const undo = moveDiagramHistory(history, 'undo');
assert.deepEqual(undo.elements.map((element) => element.id), [player.id]);
const redo = moveDiagramHistory(undo.history, 'redo');
assert.deepEqual(redo.elements.map((element) => element.id), [player.id, ball.id]);

console.log('diagram editor state tests passed');

