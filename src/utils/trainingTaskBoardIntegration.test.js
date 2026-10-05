import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildTrainingTaskPayload,
  createTrainingTaskDraft,
  normalizeTrainingTask,
  prepareTrainingTaskEditorPayload,
  trainingTaskToDraft,
} from './trainingTasks.js';
import { createTrainingTaskEditorSceneV1 } from './trainingTaskEditorPayload.js';
import { duplicateTrainingTask, saveTrainingTask } from './trainingTaskStore.js';
import { saveTrainingTaskWithFile } from './trainingTaskFiles.js';

const context = { clubId: 'club-1', authorUserId: 'author-1' };
const validDraft = { ...createTrainingTaskDraft(), name: 'Posesión', objective: 'Conservar' };
assert.deepEqual(buildTrainingTaskPayload(validDraft, context).editor_payload, {}, 'crear sin tocar la pizarra persiste el contrato vacio');

const initialScene = createTrainingTaskEditorSceneV1({
  pitchType: 'full',
  elements: [{ id: 'player-1', type: 'player', x: 20, y: 30, label: '1' }],
});
const createPayload = buildTrainingTaskPayload({ ...validDraft, editorPayload: initialScene }, context);
assert.deepEqual(createPayload.editor_payload, initialScene, 'crear con pizarra persiste V1');

const storedRow = {
  id: 'task-1', club_id: 'club-1', author_user_id: 'author-1', name: 'Posesión', objective: 'Conservar',
  editor_payload: initialScene,
};
const task = normalizeTrainingTask(storedRow);
const draft = trainingTaskToDraft(task);
assert.deepEqual(draft.editorPayload, initialScene, 'editar reconstruye la escena guardada');
draft.name = 'Posesión editada';
assert.deepEqual(buildTrainingTaskPayload(draft, { ...context, existing: task }).editor_payload, initialScene, 'editar solo la ficha no destruye la escena');
draft.editorPayload.board.elements[0].x = 64;
assert.equal(task.editorPayload.board.elements[0].x, 20, 'draft y tarea original no comparten referencias');
assert.equal(storedRow.editor_payload.board.elements[0].x, 20, 'cancelar descarta el draft sin mutar la fila original');
assert.equal(buildTrainingTaskPayload(draft, { ...context, existing: task }).editor_payload.board.elements[0].x, 64, 'guardar una modificación de escena usa el nuevo estado');

const future = { schemaVersion: 2, scenes: [{ id: 'future-scene' }] };
const futureTask = normalizeTrainingTask({ ...storedRow, editor_payload: future });
const futureDraft = trainingTaskToDraft(futureTask);
futureDraft.durationMinutes = '20';
assert.deepEqual(prepareTrainingTaskEditorPayload(futureDraft, futureTask), future, 'editar ficha preserva payload unsupported');
const invalid = { schemaVersion: 1, board: { pitchType: 'future-field', elements: [] }, keep: true };
const invalidTask = normalizeTrainingTask({ ...storedRow, editor_payload: invalid });
assert.deepEqual(prepareTrainingTaskEditorPayload(trainingTaskToDraft(invalidTask), invalidTask), invalid, 'editar ficha preserva payload invalid');
assert.throws(() => prepareTrainingTaskEditorPayload({ editorPayload: future }), /version no compatible/, 'una tarea nueva no puede enviar payload unsupported');

const oversizedScene = createTrainingTaskEditorSceneV1({
  elements: [{ id: 'text-large', type: 'text', x: 20, y: 20, label: 'x'.repeat(270000) }],
});
let databaseCalls = 0;
await assert.rejects(saveTrainingTask({ from() { databaseCalls += 1; throw new Error('Supabase no debe ejecutarse'); } }, {
  ...validDraft,
  editorPayload: oversizedScene,
}, context), /supera el limite de 256 KiB/);
assert.equal(databaseCalls, 0, 'el limite se comprueba antes de Supabase');
let externalCalls = 0;
await assert.rejects(saveTrainingTaskWithFile({
  from() { externalCalls += 1; throw new Error('DB no debe ejecutarse'); },
  storage: { from() { externalCalls += 1; throw new Error('Storage no debe ejecutarse'); } },
}, { ...validDraft, file: { name: 'x.png', type: 'image/png', size: 1 }, editorPayload: oversizedScene }, context), /supera el limite de 256 KiB/);
assert.equal(externalCalls, 0, 'el limite se comprueba antes de DB y Storage aunque exista un archivo');

let inserted;
const duplicateClient = { from: () => ({ insert(payload) {
  inserted = payload;
  return { select: () => ({ single: async () => ({ data: { ...payload, id: 'copy-1' }, error: null }) }) };
} }) };
const copy = await duplicateTrainingTask(duplicateClient, task, context);
assert.deepEqual(inserted.editor_payload, initialScene, 'duplicar conserva la escena');
inserted.editor_payload.board.elements[0].x = 77;
assert.equal(task.editorPayload.board.elements[0].x, 20, 'la copia no comparte referencias con la original');
assert.equal(copy.previewPath, '', 'duplicar sigue sin copiar preview');
assert.equal(copy.isShared, false, 'duplicar sigue sin copiar sharing');

const sectionSource = await readFile(new URL('../components/training/TrainingTasksSection.jsx', import.meta.url), 'utf8');
const boardSource = await readFile(new URL('../components/training/TrainingTaskBoardEditor.jsx', import.meta.url), 'utf8');
assert.match(sectionSource, /task\.author_user_id !== userId/, 'solo el autor abre edición');
assert.match(sectionSource, /TrainingTaskBoardEditor[^>]+readOnly/, 'el detalle, incluida una compartida, renderiza la pizarra readonly');
assert.match(boardSource, /\{!readOnly \? <div className="mt-3"><SetPieceDiagramToolbar/, 'los controles solo aparecen en modo editable');
assert.match(boardSource, /Pizarra de ejercicio/);
assert.doesNotMatch(boardSource, /cronolog|dossier|impresi[oó]n|metadata de jugada/i, 'la UI de Tareas no expone conceptos ABP');

console.log('training task board integration tests passed');
