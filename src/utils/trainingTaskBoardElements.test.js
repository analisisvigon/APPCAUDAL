import assert from 'node:assert/strict';
import { createDiagramHistory, duplicateDiagramElement, moveDiagramHistory, pushDiagramHistory } from './diagramEditorState.js';
import { deleteSetPieceElement } from './setPieceEditorInteractions.js';
import {
  adaptLegacyTrainingBoardElement,
  createTrainingTaskBoardElement,
  drawTrainingTaskBoardElement,
  getTrainingBoardElementLayer,
  getTrainingConditionalMaterial,
  moveTrainingBoardElement,
  resizeTrainingBoardZone,
  resizeTrainingBoardMaterial,
  placeTrainingTaskBoardElement,
  rotateTrainingBoardElement,
  sortTrainingBoardElements,
  TRAINING_BOARD_PALETTE,
  TRAINING_BOARD_TEAM_OPTIONS,
  TRAINING_CONDITIONAL_MATERIAL_CATEGORIES,
  TRAINING_CONDITIONAL_MATERIALS,
} from './trainingTaskBoardElements.js';
import { createTrainingTaskEditorSceneV1, readTrainingTaskEditorPayload } from './trainingTaskEditorPayload.js';

let sequence = 0;
const id = () => `training-${++sequence}`;
const tools = ['team-1', 'team-2', 'team-3', 'neutral', 'goalkeeper', 'coach', 'ball', 'cone', 'pole', 'mannequin', 'hoop', 'goal', 'mini_goal', 'arrow', 'curved_arrow', 'dashed_arrow', 'line', 'dashed_line', 'zone', 'text'];
const elements = tools.map((tool) => createTrainingTaskBoardElement(tool, id));
assert.equal(new Set(elements.map((element) => element.id)).size, tools.length, 'cada objeto recibe id estable unico');

assert.equal(TRAINING_CONDITIONAL_MATERIALS.length, 22, 'el catalogo contiene todos los materiales solicitados');
assert.deepEqual(TRAINING_CONDITIONAL_MATERIAL_CATEGORIES, [
  'FUERZA', 'EQUILIBRIO', 'COORDINACIÓN', 'PLIOMETRÍA', 'RESISTENCIA', 'TRABAJO EN SUELO', 'VELOCIDAD',
]);
assert.deepEqual(TRAINING_CONDITIONAL_MATERIALS.map((material) => material.name), [
  'Mancuerna', 'Kettlebell', 'Barra con discos', 'Disco de peso', 'Balón medicinal',
  'BOSU', 'Fitball', 'Plataforma de equilibrio',
  'Escalera de coordinación', 'Aros', 'Valla baja',
  'Cajón pliométrico', 'Step', 'Obstáculo bajo',
  'Banda elástica', 'Goma de resistencia', 'TRX',
  'Esterilla', 'Colchoneta', 'Rueda abdominal',
  'Trineo de arrastre', 'Paracaídas de resistencia',
]);
assert.ok(TRAINING_CONDITIONAL_MATERIALS.every((material) => (
  material.id && material.name && TRAINING_CONDITIONAL_MATERIAL_CATEGORIES.includes(material.category)
  && material.icon.shapes.length > 0 && material.geometry.width > 0 && material.geometry.height > 0
)), 'cada material tiene identidad, categoria, icono vectorial y geometria');
assert.equal(new Set(TRAINING_CONDITIONAL_MATERIALS.map((material) => material.id)).size, 22);
const conditionalElements = TRAINING_CONDITIONAL_MATERIALS.map((material) => (
  createTrainingTaskBoardElement(`conditional:${material.id}`, id)
));
assert.ok(conditionalElements.every((element) => element.type === 'conditional_material'));
assert.ok(conditionalElements.every((element) => getTrainingConditionalMaterial(element.materialKey)));
assert.equal(getTrainingBoardElementLayer(conditionalElements[0]), 3, 'el material se sitúa sobre el campo y bajo los participantes');
const conditionalScene = createTrainingTaskEditorSceneV1({ pitchType: 'full', elements: conditionalElements });
assert.deepEqual(readTrainingTaskEditorPayload(conditionalScene).scene.board.elements, conditionalElements, 'los 22 materiales hacen round-trip en V1');
for (const element of conditionalElements) {
  const placed = placeTrainingTaskBoardElement(`conditional:${element.materialKey}`, { x: 0, y: 0 }, id);
  assert.ok(placed.x >= placed.width / 2 && placed.y >= placed.height / 2, `${element.materialKey} no se recorta al colocarlo en el borde`);
  const moved = moveTrainingBoardElement(element, 3, -2);
  assert.deepEqual({ x: moved.x, y: moved.y }, { x: element.x + 3, y: element.y - 2 });
  const rotated = rotateTrainingBoardElement(element);
  assert.equal(rotated.rotation, 90);
  const resized = resizeTrainingBoardMaterial(element, { width: 100, height: 100 });
  assert.deepEqual({ width: resized.width, height: resized.height }, { width: 28, height: 24 });
  const copy = duplicateDiagramElement(element, id);
  assert.notEqual(copy.id, element.id);
  assert.equal(copy.materialKey, element.materialKey, 'duplicar conserva el material del catalogo');
  assert.equal(copy.x, element.x + 4);
  assert.equal(deleteSetPieceElement([element], element.id).length, 0, 'cualquier material condicional se puede borrar');
}
let conditionalHistory = createDiagramHistory([conditionalElements[0]]);
const movedConditional = moveTrainingBoardElement(conditionalElements[0], 5, 2);
conditionalHistory = pushDiagramHistory(conditionalHistory, [movedConditional]);
assert.deepEqual(moveDiagramHistory(conditionalHistory, 'undo').elements, [conditionalElements[0]], 'undo restaura el material movido');
assert.deepEqual(moveDiagramHistory(moveDiagramHistory(conditionalHistory, 'undo').history, 'redo').elements, [movedConditional], 'redo restaura su nueva posición');

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
