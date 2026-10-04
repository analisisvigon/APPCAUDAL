import assert from 'node:assert/strict';
import {
  createTrainingTaskFeedback,
  deleteTrainingTaskFeedback,
  loadTrainingTaskFeedback,
  updateTrainingTaskFeedback,
} from './trainingTaskFeedbackStore.js';

const stored = [
  { id: 'entry-1', task_id: 'task-1', author_user_id: 'user-1', used_on: '2026-10-10', rating: 3, post_text: 'Primera' },
  { id: 'entry-2', task_id: 'task-1', author_user_id: 'user-2', used_on: '2026-11-05', rating: 4, post_text: 'Segunda' },
];
const calls = [];
const loadQuery = {
  select(selection) { calls.push(['select', selection]); return this; },
  eq(column, value) { calls.push(['eq', column, value]); return this; },
  order(column, options) { calls.push(['order', column, options]); return this; },
  then(resolve) { resolve({ data: stored, error: null }); },
};
const loaded = await loadTrainingTaskFeedback({ from: (table) => { assert.equal(table, 'training_task_feedback'); return loadQuery; } }, 'task-1');
assert.deepEqual(loaded.map(({ id }) => id), ['entry-2', 'entry-1'], 'carga varias entradas sin sobrescribir y en orden reciente');
assert.deepEqual(calls.filter(([name]) => name === 'order').map(([, column]) => column), ['used_on', 'created_at']);

let createdPayload;
const created = await createTrainingTaskFeedback({ from: () => ({ insert(payload) { createdPayload = payload; return { select: () => ({ single: async () => ({ data: { ...payload, id: 'entry-3' }, error: null }) }) }; } }) },
  { usedOn: '2027-01-20', rating: 5, post: 'Perfecta' },
  { taskId: 'task-1', clubId: 'club-1', authorUserId: 'user-1' });
assert.equal(created.id, 'entry-3');
assert.equal(createdPayload.author_user_id, 'user-1', 'CREATE usa la identidad real del contexto');

let updatedPayload;
const updated = await updateTrainingTaskFeedback({ from: () => ({ update(payload) { updatedPayload = payload; return { eq: () => ({ select: () => ({ single: async () => ({ data: { ...stored[0], ...payload }, error: null }) }) }) }; } }) }, 'entry-1',
  { usedOn: '2026-10-11', rating: 4, post: 'Editada' });
assert.equal(updated.rating, 4, 'EDIT actualiza la entrada seleccionada');
assert.deepEqual(Object.keys(updatedPayload).sort(), ['post_text', 'rating', 'used_on'], 'EDIT no intenta cambiar ownership ni task_id');

let deletedId;
await deleteTrainingTaskFeedback({ from: () => ({ delete: () => ({ eq(column, id) { deletedId = id; assert.equal(column, 'id'); return { select: async () => ({ data: [{ id }], error: null }) }; } }) }) }, 'entry-1');
assert.equal(deletedId, 'entry-1', 'DELETE apunta solo a la entrada elegida');

await assert.rejects(deleteTrainingTaskFeedback({ from: () => ({ delete: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }) }) }, 'foreign-entry'), /permisos/, 'DELETE sin fila visible no simula éxito');

console.log('training task feedback store tests passed');
