import assert from 'node:assert/strict';
import { createDiagramHistory, duplicateDiagramElement, moveDiagramHistory, pushDiagramHistory } from './diagramEditorState.js';
import { deleteSetPieceElement } from './setPieceEditorInteractions.js';
import {
  adaptLegacyTrainingBoardElement,
  createTrainingTaskBoardElement,
  drawTrainingTaskBoardElement,
  getTrainingBoardElementLayer,
  moveTrainingBoardElement,
  resizeTrainingBoardZone,
  placeTrainingTaskBoardElement,
  rotateTrainingBoardElement,
  sortTrainingBoardElements,
  TRAINING_BOARD_PALETTE,
  TRAINING_BOARD_TEAM_OPTIONS,
} from './trainingTaskBoardElements.js';
import { createTrainingTaskEditorSceneV1, readTrainingTaskEditorPayload } from './trainingTaskEditorPayload.js';

let sequence = 0;
const id = () => `training-${++sequence}`;
const tools = ['team-1', 'team-2', 'team-3', 'neutral', 'goalkeeper', 'coach', 'ball', 'cone', 'pole', 'mannequin', 'hoop', 'goal', 'mini_goal', 'arrow', 'curved_arrow', 'dashed_arrow', 'line', 'dashed_line', 'zone', 'text'];
const elements = tools.map((tool) => createTrainingTaskBoardElement(tool, id));
assert.equal(new Set(elements.map((element) => element.id)).size, tools.length, 'cada objeto recibe id estable unico');

const participants = elements.slice(0, 6);
assert.deepEqual(participants.slice(0, 3).map((entry) => entry.teamKey), ['team-1', 'team-2', 'team-3']);
assert.deepEqual(participants.slice(0, 3).map((entry) => entry.colorKey), ['blue', 'red', 'yellow']);
assert.deepEqual(participants.slice(3).map((entry) => entry.role), ['neutral', 'goalkeeper', 'coach']);
assert.equal(participants[4].teamKey, 'team-1', 'portero combina rol y equipo');
assert.equal(TRAINING_BOARD_TEAM_OPTIONS.length, 3);
assert.deepEqual(Object.keys(TRAINING_BOARD_PALETTE), ['blue', 'red', 'yellow', 'green', 'orange', 'purple', 'white', 'black']);

const materialTypes = elements.slice(6, 13).map((entry) => entry.type);
assert.deepEqual(materialTypes, ['ball', 'cone', 'pole', 'mannequin', 'hoop', 'goal', 'mini_goal']);
for (const material of elements.slice(6, 13)) {
  const copy = duplicateDiagramElement(material, id);
  assert.notEqual(copy.id, material.id);
  assert.equal(copy.x, Math.min(100, material.x + 4));
}

assert.deepEqual(elements.slice(13, 18).map((entry) => entry.type), ['arrow', 'curved_arrow', 'dashed_arrow', 'line', 'dashed_line']);
assert.ok(elements.slice(13, 18).every((entry) => entry.colorKey === 'blue'));
const duplicatedLine = duplicateDiagramElement(elements[16], id);
assert.equal(duplicatedLine.x1, elements[16].x1 + 4);
assert.equal(duplicatedLine.x2, elements[16].x2 + 4);
assert.equal(elements[18].label, '', 'una zona no impone label');
assert.equal(elements[18].opacity, 0.18);
assert.equal(elements[18].borderStyle, 'solid');
assert.ok(Number(elements[18].width) > 0 && Number(elements[18].height) > 0, 'zona preparada para resize');
assert.deepEqual(resizeTrainingBoardZone({ x: 90, y: 65, width: 8, height: 6 }, 20, 20), { width: 10, height: 7 }, 'resize no sale del terreno');
assert.deepEqual(resizeTrainingBoardZone({ x: 20, y: 20, width: 8, height: 6 }, -20, -20), { width: 4, height: 4 }, 'resize conserva un tamano minimo');

const placedPlayers = [
  placeTrainingTaskBoardElement('team-1', { x: 12, y: 18 }, id),
  placeTrainingTaskBoardElement('team-1', { x: 26, y: 31 }, id),
];
assert.deepEqual(placedPlayers.map(({ x, y }) => ({ x, y })), [{ x: 12, y: 18 }, { x: 26, y: 31 }], 'la herramienta activa coloca multiples participantes en cada coordenada pulsada');
assert.notEqual(placedPlayers[0].id, placedPlayers[1].id);
const placedCones = [10, 20, 30].map((x) => placeTrainingTaskBoardElement('cone', { x, y: 50 }, id));
assert.deepEqual(placedCones.map((cone) => cone.x), [10, 20, 30], 'la colocacion multiple funciona tambien para conos');
const drawnZone = drawTrainingTaskBoardElement('zone', { x: 70, y: 50 }, { x: 30, y: 20 }, id);
assert.deepEqual({ x: drawnZone.x, y: drawnZone.y, width: drawnZone.width, height: drawnZone.height }, { x: 30, y: 20, width: 40, height: 30 }, 'la zona se dibuja por arrastre en cualquier direccion');
const drawnArrow = drawTrainingTaskBoardElement('arrow', { x: 9, y: 11 }, { x: 41, y: 35 }, id);
assert.deepEqual({ x1: drawnArrow.x1, y1: drawnArrow.y1, x2: drawnArrow.x2, y2: drawnArrow.y2 }, { x1: 9, y1: 11, x2: 41, y2: 35 });

const movableTools = ['team-1', 'team-2', 'team-3', 'neutral', 'goalkeeper', 'coach', 'ball', 'cone', 'pole', 'mannequin', 'hoop', 'goal', 'mini_goal', 'text', 'zone'];
for (const tool of movableTools) {
  const original = createTrainingTaskBoardElement(tool, id);
  const moved = moveTrainingBoardElement(original, 7, -3);
  assert.equal(moved.x, original.x + 7, `${tool} se desplaza en x`);
  assert.equal(moved.y, original.y - 3, `${tool} se desplaza en y`);
  assert.equal(moved.rotation, original.rotation, `${tool} conserva rotacion durante drag`);
}
const movedCurve = moveTrainingBoardElement(elements[14], 5, 6);
assert.deepEqual({ x1: movedCurve.x1, y1: movedCurve.y1, controlX: movedCurve.controlX, controlY: movedCurve.controlY }, { x1: elements[14].x1 + 5, y1: elements[14].y1 + 6, controlX: elements[14].controlX + 5, controlY: elements[14].controlY + 6 }, 'mover curva conserva toda su geometria');

const goal = createTrainingTaskBoardElement('goal', id);
const rotations = [goal];
for (let index = 0; index < 4; index += 1) rotations.push(rotateTrainingBoardElement(rotations.at(-1)));
assert.deepEqual(rotations.map((entry) => entry.rotation), [0, 90, 180, 270, 0], 'rotacion rapida recorre las cuatro orientaciones');

let dragHistory = createDiagramHistory([goal]);
const movedGoal = moveTrainingBoardElement(goal, 12, 4);
dragHistory = pushDiagramHistory(dragHistory, [movedGoal]);
assert.equal(dragHistory.entries.length, 2, 'un drag completo crea un unico checkpoint');
const undoneGoal = moveDiagramHistory(dragHistory, 'undo');
assert.deepEqual(undoneGoal.elements[0], goal, 'undo restaura exactamente el origen del drag');
const redoneGoal = moveDiagramHistory(undoneGoal.history, 'redo');
assert.deepEqual(redoneGoal.elements[0], movedGoal, 'redo restaura exactamente el destino del drag');
let rotationHistory = createDiagramHistory([goal]);
rotationHistory = pushDiagramHistory(rotationHistory, [rotateTrainingBoardElement(goal)]);
assert.equal(moveDiagramHistory(rotationHistory, 'undo').elements[0].rotation, 0);
assert.equal(moveDiagramHistory(moveDiagramHistory(rotationHistory, 'undo').history, 'redo').elements[0].rotation, 90);

const ordered = sortTrainingBoardElements([elements[0], elements[6], elements[13], elements[19], elements[18]]);
assert.deepEqual(ordered.map(getTrainingBoardElementLayer), [1, 2, 3, 4, 5], 'z-order: zona, trazado, material, participante, texto');
for (const element of elements) {
  assert.equal(deleteSetPieceElement(elements, element.id).some((entry) => entry.id === element.id), false, `${element.type} se puede borrar`);
}

const legacyPlayer = { id: 'legacy-player', type: 'player', x: 20, y: 30, label: '7' };
const legacyOpponent = { id: 'legacy-opponent', type: 'opponent', x: 60, y: 30, label: '4' };
assert.deepEqual({ ...adaptLegacyTrainingBoardElement(legacyPlayer), id: undefined }, { ...legacyPlayer, id: undefined, type: 'participant', role: 'player', teamKey: 'team-1', colorKey: 'blue' });
assert.equal(adaptLegacyTrainingBoardElement(legacyOpponent).colorKey, 'red');

for (const pitchType of ['full', 'half', 'blank']) {
  const scene = createTrainingTaskEditorSceneV1({ pitchType, elements });
  assert.equal(readTrainingTaskEditorPayload(scene).kind, 'v1', `${pitchType} persiste en V1`);
  assert.deepEqual(readTrainingTaskEditorPayload(scene).scene, scene, `${pitchType} hace round-trip`);
}

console.log('training task board element tests passed');
