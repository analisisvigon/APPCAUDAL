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

const persisted = [];
let nextId = 0;
const persistentClient = {
  from(table) {
    assert.equal(table, 'training_task_feedback');
    return {
      insert(payload) {
        return {
          select() {
            return {
              single: async () => {
                const row = { ...payload, id: `persisted-${++nextId}`, created_at: `2027-01-0${nextId}T10:00:00Z` };
                persisted.push(row);
                return { data: row, error: null };
              },
            };
          },
        };
      },
      select() {
        return {
          eq(column, taskId) {
            assert.equal(column, 'task_id');
            this.taskId = taskId;
            return this;
          },
          order() { return this; },
          then(resolve) { resolve({ data: persisted.filter((row) => row.task_id === this.taskId), error: null }); },
        };
      },
    };
  },
};
const firstForTask = await createTrainingTaskFeedback(persistentClient,
  { usedOn: '2027-01-01', rating: 5, post: 'Primera experiencia' },
  { taskId: 'original-task', clubId: 'club-1', authorUserId: 'user-1' });
const secondForTask = await createTrainingTaskFeedback(persistentClient,
  { usedOn: '2027-01-02', rating: 4, post: 'Segunda experiencia' },
  { taskId: 'original-task', clubId: 'club-1', authorUserId: 'user-1' });
await createTrainingTaskFeedback(persistentClient,
  { usedOn: '2027-01-03', rating: 3, post: 'Otra tarea' },
  { taskId: 'different-task', clubId: 'club-1', authorUserId: 'user-1' });
assert.notEqual(firstForTask.id, secondForTask.id, 'cada guardado confirmado obtiene su propio registro');
const reloaded = await loadTrainingTaskFeedback(persistentClient, 'original-task');
assert.deepEqual(reloaded.map(({ id }) => id).sort(), [firstForTask.id, secondForTask.id].sort(), 'dos experiencias se recuperan sin sobrescribirse tras recargar');
assert.ok(reloaded.every((row) => row.task_id === 'original-task'), 'el historial solo recupera experiencias de la tarea pedida');
assert.deepEqual(reloaded.map(({ post, rating }) => [post, rating]).sort(), [
  ['Primera experiencia', 5],
  ['Segunda experiencia', 4],
], 'se conservan comentario y valoración de cada experiencia');
await assert.rejects(createTrainingTaskFeedback({
  from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: Object.assign(new Error('permission denied'), { code: '42501' }) }) }) }) }),
}, { usedOn: '2027-01-04', rating: null, post: 'Se conserva el borrador' },
{ taskId: 'original-task', clubId: 'club-1', authorUserId: 'user-1' }), /permission denied/, 'un error de guardado no simula éxito');

console.log('training task feedback store tests passed');
