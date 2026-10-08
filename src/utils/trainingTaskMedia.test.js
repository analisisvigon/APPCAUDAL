import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  TRAINING_TASK_MEDIA_MAX_FILE_SIZE,
  analyzeTrainingTaskMediaUrl,
  deleteTaskMedia,
  duplicateUrlMedia,
  reorderTaskMedia,
  selectTrainingTaskPreviewMedia,
  setTaskMediaPrimary,
  trainingTaskMediaStoragePath,
  uploadTaskMediaFile,
  validateTrainingTaskMediaFile,
} from './trainingTaskMedia.js';

const youtube = analyzeTrainingTaskMediaUrl('https://youtu.be/AbCdEf12345?t=20');
assert.deepEqual(
  { kind: youtube.kind, provider: youtube.provider, providerKey: youtube.providerKey },
  { kind: 'video', provider: 'youtube', providerKey: 'AbCdEf12345' },
);
assert.equal(analyzeTrainingTaskMediaUrl('https://vimeo.com/123456').provider, 'vimeo');
assert.equal(analyzeTrainingTaskMediaUrl('https://m.youtube.com/watch?v=AbCdEf12345').provider, 'youtube');
assert.equal(analyzeTrainingTaskMediaUrl('https://cdn.example.com/video.mp4').provider, 'direct');
assert.equal(analyzeTrainingTaskMediaUrl('https://cdn.example.com/video.webm').provider, 'direct');
assert.equal(analyzeTrainingTaskMediaUrl('https://cdn.example.com/live.m3u8').provider, 'direct');
assert.equal(analyzeTrainingTaskMediaUrl('https://example.com/recurso').provider, 'external');
assert.throws(() => analyzeTrainingTaskMediaUrl('http://example.com/video.mp4'), /HTTPS/);
assert.throws(() => analyzeTrainingTaskMediaUrl('<iframe src="https://youtu.be/AbCdEf12345">'), /no HTML/);
assert.throws(() => analyzeTrainingTaskMediaUrl('https://www.youtube.com/embed/AbCdEf12345'), /no HTML ni una URL embed/);
assert.throws(() => analyzeTrainingTaskMediaUrl(`https://example.com/${'a'.repeat(2049)}`), /2048/);

const image = { name: 'Mi Foto final.PNG', type: 'image/png', size: 1024 };
assert.equal(validateTrainingTaskMediaFile(image), image);
assert.throws(() => validateTrainingTaskMediaFile({ name: 'clip.mp4', type: 'video/mp4', size: 10 }), /Formato no permitido/);
assert.throws(() => validateTrainingTaskMediaFile({ ...image, size: TRAINING_TASK_MEDIA_MAX_FILE_SIZE + 1 }), /10 MB/);
assert.equal(
  trainingTaskMediaStoragePath({ club_id: 'club', id: 'task', author_user_id: 'user' }, image, 'media-id'),
  'club/task/user/media-media-id-mi-foto-final.png',
);

const uploadCalls = [];
const uploadClient = {
  from(table) {
    assert.equal(table, 'training_task_media');
    return {
      insert(payload) {
        uploadCalls.push(['row', payload]);
        return { select: () => ({ single: async () => ({ data: payload, error: null }) }) };
      },
      delete() {
        return { eq: async (column, id) => { uploadCalls.push(['cleanup-row', column, id]); return { error: null }; } };
      },
    };
  },
  storage: { from(bucket) {
    assert.equal(bucket, 'training-task-files');
    return { upload: async (path) => { uploadCalls.push(['upload', path]); return { error: new Error('Upload denied') }; } };
  } },
};
await assert.rejects(
  uploadTaskMediaFile(uploadClient, { club_id: 'club', id: 'task', author_user_id: 'user' }, image, {}, 'media-id'),
  /Upload denied/,
);
assert.deepEqual(uploadCalls.map(([operation]) => operation), ['row', 'upload', 'cleanup-row'], 'si Storage falla se limpia la fila creada primero');

const deleteCalls = [];
await deleteTaskMedia({
  storage: { from: () => ({ remove: async (paths) => { deleteCalls.push(['storage', paths]); return { error: null }; } }) },
  from: () => ({ delete: () => ({ eq: async (column, id) => { deleteCalls.push(['row', column, id]); return { error: null }; } }) }),
}, { id: 'media-id', source: 'upload', storagePath: 'club/task/user/media-id.png' });
assert.deepEqual(deleteCalls, [
  ['storage', ['club/task/user/media-id.png']],
  ['row', 'id', 'media-id'],
], 'un upload se borra de Storage antes que su fila');

const reorderUpdates = [];
const reordered = await reorderTaskMedia({
  from: () => ({ update: ({ sort_order }) => ({ eq: async (column, id) => {
    reorderUpdates.push([id, sort_order]);
    return { error: null };
  } }) }),
}, [
  { id: 'a', sort_order: 0 },
  { id: 'b', sort_order: 1 },
  { id: 'c', sort_order: 2 },
], 2, 0);
assert.deepEqual(reordered.map(({ id, sortOrder }) => [id, sortOrder]), [['c', 0], ['a', 1], ['b', 2]]);
assert.deepEqual(reorderUpdates, [['c', 0], ['a', 1], ['b', 2]], 'el orden persistido es correlativo y no negativo');

const primaryCalls = [];
const primaryClient = { from: () => ({ update(payload) {
  const query = {
    error: null,
    eq(column, value) { primaryCalls.push([payload.is_primary, column, value]); return query; },
    select() { return query; },
    async single() { return { data: { id: 'new-primary', is_primary: true }, error: null }; },
  };
  return query;
} }) };
const primary = await setTaskMediaPrimary(primaryClient, 'task', 'new-primary', [{ id: 'old-primary', isPrimary: true }]);
assert.equal(primary.isPrimary, true);
assert.deepEqual(primaryCalls, [
  [false, 'task_id', 'task'], [false, 'is_primary', true], [true, 'id', 'new-primary'],
], 'marcar principal limpia primero el principal anterior de la misma tarea');

const sourceMedia = [
  { id: 'upload', task_id: 'source', source: 'upload', kind: 'image', storage_path: 'private/image.png', sort_order: 0, is_primary: true },
  { id: 'url', task_id: 'source', source: 'url', kind: 'video', original_url: 'https://youtu.be/AbCdEf12345', provider: 'youtube', provider_key: 'AbCdEf12345', sort_order: 1, is_primary: false },
];
let duplicatedPayload;
const duplicated = await duplicateUrlMedia({ from: () => ({
  select: () => ({ eq: () => ({ order: () => ({ order: async () => ({ data: sourceMedia, error: null }) }) }) }),
  insert(payload) { duplicatedPayload = payload; return { select: async () => ({ data: payload, error: null }) }; },
}) }, 'source', { id: 'target', club_id: 'club' }, 'user');
assert.equal(duplicated.length, 1);
assert.equal(duplicatedPayload[0].source, 'url');
assert.equal(duplicatedPayload[0].original_url, sourceMedia[1].original_url);
assert.equal(duplicatedPayload[0].is_primary, false, 'si el principal era upload no se promociona una URL');
assert.equal(duplicatedPayload.some((row) => row.storage_path), false, 'duplicar no copia uploads ni rutas privadas');

let primaryUrlCopy;
await duplicateUrlMedia({ from: () => ({
  select: () => ({ eq: () => ({ order: () => ({ order: async () => ({ data: [{ ...sourceMedia[1], is_primary: true }], error: null }) }) }) }),
  insert(payload) { primaryUrlCopy = payload; return { select: async () => ({ data: payload, error: null }) }; },
}) }, 'source', { id: 'target-2', club_id: 'club' }, 'user');
assert.equal(primaryUrlCopy[0].is_primary, true, 'el primary se conserva cuando pertenece a una URL copiada');

const rows = [
  { id: 'pdf', kind: 'document', source: 'upload', sort_order: 0, is_primary: true },
  { id: 'image-2', kind: 'image', source: 'upload', sort_order: 2, is_primary: false },
  { id: 'image-1', kind: 'image', source: 'upload', sort_order: 1, is_primary: true },
];
assert.equal(selectTrainingTaskPreviewMedia(rows)?.id, 'image-1', 'el PDF principal nunca sustituye el preview de tarjeta');
assert.equal(selectTrainingTaskPreviewMedia([{ ...rows[1] }])?.id, 'image-2', 'sin principal se usa la primera imagen');
assert.equal(selectTrainingTaskPreviewMedia([sourceMedia[1]])?.id, 'url', 'YouTube aporta una miniatura segura');
assert.equal(selectTrainingTaskPreviewMedia([{ id: 'pdf', kind: 'document', source: 'upload' }]), null);

const panelSource = await readFile(new URL('../components/training/TrainingTaskMediaPanel.jsx', import.meta.url), 'utf8');
const cardPreviewSource = await readFile(new URL('../components/training/TrainingTaskCardPreview.jsx', import.meta.url), 'utf8');
const sectionSource = await readFile(new URL('../components/training/TrainingTasksSection.jsx', import.meta.url), 'utf8');
const mediaSource = await readFile(new URL('./trainingTaskMedia.js', import.meta.url), 'utf8');
assert.match(panelSource, /canManage \?/, 'las mutaciones multimedia quedan fuera del modo readonly compartido');
assert.match(panelSource, /window\.open\([^\n]+noopener,noreferrer/, 'los enlaces externos se abren sin acceso al opener');
assert.doesNotMatch(panelSource, /dangerouslySetInnerHTML/, 'ningún HTML pegado se inyecta en la interfaz');
assert.match(cardPreviewSource, /selectTrainingTaskPreviewMedia/, 'la tarjeta aplica la prioridad centralizada de multimedia');
assert.match(sectionSource, /Adjunto anterior/, 'el adjunto legacy continúa visible durante la transición');
assert.match(sectionSource, /Guarda la tarea para añadir contenido multimedia/, 'una tarea nueva exige guardado previo');
assert.doesNotMatch(mediaSource, /editor_payload/, 'Multimedia permanece fuera del contrato de la pizarra');

console.log('training task multimedia tests passed');
