import assert from 'node:assert/strict';
import { duplicateTrainingTask } from './trainingTaskStore.js';
import {
  deleteTrainingTaskWithFiles,
  removeTrainingTaskFiles,
  saveTrainingTaskWithFile,
  trainingTaskFilePath,
} from './trainingTaskFiles.js';

const context = { clubId: 'club-id', authorUserId: 'my-user' };
const original = {
  id: 'task-id', club_id: 'club-id', author_user_id: 'other-user',
  name: 'Rondo', taskCode: 'Vigón', objective: 'Control', taskType: 'rondos', gamePhase: 'offensive', gameMoment: 'creation',
  previewPath: 'old-preview', attachmentPath: 'old-attachment', attachmentName: 'old.png',
  attachmentMime: 'image/png', attachmentSize: 100, editor_payload: { shapes: [1] },
};

let inserted;
const duplicateClient = { from(table) {
  assert.equal(table, 'training_tasks');
  return { insert(payload) {
    inserted = payload;
    return { select() { return { async single() { return { data: { ...payload, id: 'new-task' }, error: null }; } }; } };
  } };
} };
const copy = await duplicateTrainingTask(duplicateClient, original, context);
assert.equal(copy.id, 'new-task');
assert.equal(inserted.author_user_id, 'my-user');
assert.equal(inserted.club_id, 'club-id');
assert.equal(inserted.task_code, 'Vigón', 'duplicar conserva el código de tarea');
assert.equal(inserted.preview_path, null);
assert.equal(inserted.attachment_path, null);
assert.equal(inserted.attachment_name, null);
assert.equal(inserted.attachment_mime, null);
assert.equal(inserted.attachment_size, null);
assert.deepEqual(inserted.editor_payload, { shapes: [1] });
assert.equal(inserted.training_task_shares, undefined);
assert.equal(inserted.created_at, undefined);

const file = { name: 'Mi imagen.PNG', type: 'image/png', size: 128 };
assert.equal(trainingTaskFilePath(original, file, 'file-id'), 'club-id/task-id/other-user/attachment-file-id-mi-imagen.png');

const calls = [];
const client = {
  from(table) {
    assert.equal(table, 'training_tasks');
    return {
      insert(payload) {
        calls.push(['insert', payload]);
        return { select() { return { async single() {
          return { data: { ...payload, id: 'new-task' }, error: null };
        } }; } };
      },
      update(payload) {
        calls.push(['update', payload]);
        return { eq() { return { select() { return { async single() {
          return { data: null, error: new Error('DB update failed') };
        } }; } }; } };
      },
      delete() {
        calls.push(['delete']);
        return { eq() { return { async select() { return { data: [{ id: 'new-task' }], error: null }; } }; } };
      },
    };
  },
  storage: { from(bucket) {
    assert.equal(bucket, 'training-task-files');
    return {
      async upload(path) { calls.push(['upload', path]); return { error: null }; },
      async remove(paths) { calls.push(['remove', paths]); return { error: null }; },
    };
  } },
};

await assert.rejects(
  saveTrainingTaskWithFile(client, { name: 'Nueva', objective: 'Control', file }, context),
  /DB update failed/,
);
assert.deepEqual(calls.map(([operation]) => operation), ['insert', 'upload', 'update', 'remove', 'delete']);
assert.deepEqual(calls[3][1], [calls[1][1]], 'el upload confirmado se limpia tras fallo DB');

calls.length = 0;
await assert.rejects(saveTrainingTaskWithFile({
  ...client,
  storage: { from: () => ({
    async upload() { calls.push(['upload']); return { error: new Error('Upload failed') }; },
    async remove() { throw new Error('No object should be removed'); },
  }) },
}, { name: 'Nueva', objective: 'Control', file }, context), /Upload failed/);
assert.deepEqual(calls.map(([operation]) => operation), ['insert', 'upload', 'delete'], 'un upload fallido no deja la tarea provisional');

const ownTask = { ...original, author_user_id: 'my-user' };
const replacementCalls = [];
const replacementClient = {
  from: () => ({ update(payload) {
    replacementCalls.push('db-update');
    return { eq() { return { select() { return { async single() {
      return { data: { ...payload, id: ownTask.id, club_id: ownTask.club_id, author_user_id: ownTask.author_user_id }, error: null };
    } }; } }; } };
  } }),
  storage: { from: () => ({
    async upload() { replacementCalls.push('upload'); return { error: null }; },
    async remove() { replacementCalls.push('remove-old'); return { error: new Error('Cleanup denied') }; },
  }) },
};
const replacement = await saveTrainingTaskWithFile(replacementClient, { name: 'Rondo', objective: 'Control', file }, context, ownTask);
assert.deepEqual(replacementCalls, ['upload', 'db-update', 'remove-old'], 'el archivo antiguo se borra tras confirmar DB');
assert.deepEqual(replacement.cleanupPending, ['old-preview', 'old-attachment']);
assert.match(replacement.cleanupError.message, /Cleanup denied/);

await assert.rejects(removeTrainingTaskFiles({ storage: { from: () => ({ remove: async () => ({ error: new Error('Storage denied') }) }) } }, ['path']), /Storage denied/);
const deleteCalls = [];
await assert.rejects(deleteTrainingTaskWithFiles({
  storage: { from: () => ({ remove: async () => { deleteCalls.push('remove'); return { error: new Error('remove failed') }; } }) },
  from: () => { deleteCalls.push('db'); throw new Error('DB should not be reached'); },
}, { id: 'task-id', attachmentPath: 'path' }), /remove failed/);
assert.deepEqual(deleteCalls, ['remove']);

const successfulDeleteCalls = [];
await deleteTrainingTaskWithFiles({
  storage: { from: () => ({ remove: async (paths) => { successfulDeleteCalls.push(['remove', paths]); return { error: null }; } }) },
  from: (table) => {
    assert.equal(table, 'training_tasks');
    return { delete: () => ({ eq: (column, id) => ({
      async select(selection) {
        successfulDeleteCalls.push(['delete', column, id, selection]);
        return { data: [{ id }], error: null };
      },
    }) }) };
  },
}, { id: 'own-task', previewPath: 'preview-path', attachmentPath: 'attachment-path' });
assert.deepEqual(successfulDeleteCalls, [
  ['remove', ['preview-path', 'attachment-path']],
  ['delete', 'id', 'own-task', 'id'],
], 'el borrado correcto limpia Storage antes de eliminar la fila');

console.log('training task file lifecycle tests passed');
