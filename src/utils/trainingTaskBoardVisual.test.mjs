import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const canvas = await readFile(new URL('../components/training/TrainingTaskDiagramCanvas.jsx', import.meta.url), 'utf8');
const editor = await readFile(new URL('../components/training/TrainingTaskBoardEditor.jsx', import.meta.url), 'utf8');
const toolbar = await readFile(new URL('../components/training/TrainingTaskBoardToolbar.jsx', import.meta.url), 'utf8');
const elements = await readFile(new URL('./trainingTaskBoardElements.js', import.meta.url), 'utf8');

assert.match(canvas, /fill="#176b3a"/, 'terreno con cesped propio');
assert.match(canvas, /pitchType === 'blank'/);
assert.match(canvas, /pitchType === 'half'/);
for (const type of ['cone', 'pole', 'mannequin', 'hoop', 'goal', 'mini_goal']) assert.match(canvas, new RegExp(`type === '${type}'|includes\\(type\\)`));
assert.match(canvas, /fillOpacity/);
assert.match(canvas, /sortTrainingBoardElements/);
assert.match(canvas, /onPointerMove=\{move\}/, 'el renderer conserva Pointer Events');
assert.match(canvas, /drag\.mode === 'resize'/, 'zonas redimensionables');
assert.doesNotMatch(editor, /SetPieceDiagramCanvas|SetPieceDiagramToolbar/, 'Tareas no usa renderer ni toolbar visual ABP');
assert.doesNotMatch(canvas, /training_library|ABP|dossier|cronolog/i);
assert.match(editor, /Propiedades del elemento seleccionado/);
assert.match(toolbar, /TRAINING_BOARD_TOOL_GROUPS/);
assert.match(elements, /label: 'Participantes'/);
assert.match(elements, /label: 'Material'/);
assert.match(elements, /label: 'Dibujo'/);

console.log('training task board visual contract tests passed');
