import assert from 'node:assert/strict';
import { duplicateTrainingTask } from './trainingTaskStore.js';
import {
  deleteTrainingTaskWithFiles,
  removeTrainingTaskFiles,
  saveTrainingTaskWithFile,
  trainingTaskFilePath,
} from './trainingTaskFiles.js';

const context = { clubId: 'club-id', clubTeamSeasonId: 'cts-id', authorUserId: 'my-user' };
const original = {
  id: 'task-id', club_id: 'club-id', author_user_id: 'other-user',
  name: 'Rondo', taskCode: 'Vigón', objective: 'Control', taskType: 'rondos', gamePhase: 'offensive', gameMoment: 'creation',
  stageKeys: ['juvenil', 'senior'], variants: 'Limitar a dos contactos.',
  previewPath: 'old-preview', attachmentPath: 'old-attachment', attachmentName: 'old.png',
  attachmentMime: 'image/png', attachmentSize: 100, editor_payload: { shapes: [1] },
};

let inserted;
const duplicateClient = {
  async rpc(name, params) {
    assert.equal(name, 'create_shared_training_task_v1');
    assert.equal(params.p_cts_id, 'cts-id');
    inserted = params.p_task_payload;
    return {
      data: {
        ...inserted,
        id: params.p_task_id,
        club_id: 'club-id',
        author_user_id: 'my-user',
        is_personal: true,
        is_shared_with_team: true,
      },
      error: null,
    };
  },
  from(table) {
  if (table === 'training_task_media') return {
    select: () => ({ eq: () => ({ order: () => ({ order: async () => ({ data: [], error: null }) }) }) }),
  };
  throw new Error(`Tabla inesperada: ${table}`);
} };
const copy = await duplicateTrainingTask(duplicateClient, original, context);
assert.notEqual(copy.id, original.id);
assert.equal(copy.author_user_id, 'my-user');
assert.equal(copy.club_id, 'club-id');
assert.equal(copy.isSharedWithTeam, true);
assert.equal(inserted.author_user_id, undefined, 'la RPC deriva el autor autenticado');
assert.equal(inserted.club_id, undefined, 'la RPC deriva el club desde el CTS');
assert.equal(inserted.task_code, 'Vigón', 'duplicar conserva el código de tarea');
assert.deepEqual(inserted.stage_keys, ['juvenil', 'senior'], 'duplicar conserva las etapas');
assert.equal(inserted.variants, 'Limitar a dos contactos.', 'duplicar conserva variantes');
assert.equal(inserted.training_task_feedback, undefined, 'duplicar no copia historial ni valoraciones');
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
  async rpc(name, params) {
    assert.equal(name, 'create_shared_training_task_v1');
    calls.push(['insert', params.p_task_payload]);
    return {
      data: {
        ...params.p_task_payload,
        id: params.p_task_id,
        club_id: 'club-id',
        author_user_id: 'my-user',
        is_personal: true,
        is_shared_with_team: true,
      },
      error: null,
    };
  },
  from(table) {
    assert.equal(table, 'training_tasks');
    return {
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

const pdfUpdates = [];
await saveTrainingTaskWithFile({
  from: () => ({ update(payload) {
    pdfUpdates.push(payload);
    return { eq: () => ({ select: () => ({ single: async () => ({
      data: { ...payload, id: ownTask.id, club_id: ownTask.club_id, author_user_id: ownTask.author_user_id }, error: null,
    }) }) }) };
  } }),
  storage: { from: () => ({
    upload: async () => ({ error: null }),
    remove: async () => ({ error: null }),
  }) },
}, { name: 'Rondo', objective: 'Control', file: { name: 'ficha.pdf', type: 'application/pdf', size: 256 } }, context, ownTask);
assert.equal(pdfUpdates[0].preview_path, null, 'reemplazar una imagen por PDF limpia preview_path antes de borrar el objeto anterior');

await assert.rejects(removeTrainingTaskFiles({ storage: { from: () => ({ remove: async () => ({ error: new Error('Storage denied') }) }) } }, ['path']), /Storage denied/);
const deleteCalls = [];
const cleanupResult = await deleteTrainingTaskWithFiles({
  rpc: async (name) => { assert.equal(name, 'training_task_delete_ready_v1'); return { data: true, error: null }; },
  storage: { from: () => ({ remove: async () => { deleteCalls.push('remove'); return { error: new Error('remove failed') }; } }) },
  from: (table) => {
    if (table === 'training_task_media') return { select: () => ({ eq: () => ({ eq: async () => {
      deleteCalls.push('media-query');
      return { data: [{ storage_path: 'media-path' }], error: null };
    } }) }) };
    assert.equal(table, 'training_tasks');
    return { delete: () => ({ eq: () => ({ select: async () => {
      deleteCalls.push('delete');
      return { data: [{ id: 'task-id' }], error: null };
    } }) }) };
  },
}, { id: 'task-id', attachmentPath: 'path' });
assert.deepEqual(deleteCalls, ['media-query', 'delete', 'remove']);
assert.deepEqual(cleanupResult.cleanupPending, ['path', 'media-path']);
assert.match(cleanupResult.cleanupError.message, /remove failed/);

const rejectedDeleteCalls = [];
await assert.rejects(deleteTrainingTaskWithFiles({
  rpc: async (name) => { assert.equal(name, 'training_task_delete_ready_v1'); return { data: true, error: null }; },
  storage: { from: () => ({ remove: async () => { rejectedDeleteCalls.push('remove'); return { error: null }; } }) },
  from: (table) => {
    if (table === 'training_task_media') return { select: () => ({ eq: () => ({ eq: async () => ({
      data: [], error: null,
    }) }) }) };
    return { delete: () => ({ eq: () => ({ select: async () => {
      rejectedDeleteCalls.push('delete');
      return { data: null, error: new Error('La tarea tiene aportaciones de otros usuarios') };
    } }) }) };
  },
}, { id: 'shared-task', attachmentPath: 'private-path' }), /aportaciones/);
assert.deepEqual(rejectedDeleteCalls, ['delete'], 'el rechazo de la base de datos no elimina archivos');

const successfulDeleteCalls = [];
const deleted = await deleteTrainingTaskWithFiles({
  rpc: async (name) => { assert.equal(name, 'training_task_delete_ready_v1'); return { data: true, error: null }; },
  storage: { from: () => ({ remove: async (paths) => { successfulDeleteCalls.push(['remove', paths]); return { error: null }; } }) },
  from: (table) => {
    if (table === 'training_task_media') return { select: () => ({ eq: () => ({ eq: async () => ({
      data: [{ storage_path: 'media-path' }], error: null,
    }) }) }) };
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
  ['delete', 'id', 'own-task', 'id'],
  ['remove', ['preview-path', 'attachment-path', 'media-path']],
], 'el borrado de la fila se confirma antes de intentar limpiar Storage');
assert.deepEqual(deleted.cleanupPending, []);

let calledWithoutGuard = false;
await assert.rejects(deleteTrainingTaskWithFiles({
  rpc: async () => ({ data: null, error: new Error('RPC missing') }),
  from: () => { calledWithoutGuard = true; throw new Error('No debe tocar tablas'); },
  storage: { from: () => { calledWithoutGuard = true; throw new Error('No debe tocar Storage'); } },
}, { id: 'task-id' }), /protección en Supabase/);
assert.equal(calledWithoutGuard, false, 'sin el guard instalado no se intenta borrar nada');

console.log('training task file lifecycle tests passed');
