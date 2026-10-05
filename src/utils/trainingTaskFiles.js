import { deleteTrainingTask, saveTrainingTask } from './trainingTaskStore.js';
import { prepareTrainingTaskEditorPayload } from './trainingTasks.js';

export const TRAINING_TASK_BUCKET = 'training-task-files';
export const TRAINING_TASK_MAX_FILE_SIZE = 10 * 1024 * 1024;
const MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

const cleanFileName = (value) => String(value || 'archivo')
  .replace(/[^a-z0-9._-]+/gi, '-')
  .replace(/^-+|-+$/g, '')
  .toLowerCase() || 'archivo';

export const trainingTaskFilePath = (task, file, fileId) => (
  `${task.club_id}/${task.id}/${task.author_user_id}/attachment-${fileId}-${cleanFileName(file.name)}`
);

export const removeTrainingTaskFiles = async (client, paths) => {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  if (!uniquePaths.length) return;
  const { error } = await client.storage.from(TRAINING_TASK_BUCKET).remove(uniquePaths);
  if (error) throw error;
};

export const uploadTrainingTaskFile = async (client, task, file, fileId = crypto.randomUUID()) => {
  if (!MIME_TYPES.has(file.type)) throw new Error('Formato no permitido. Usa JPG, PNG, WEBP o PDF.');
  if (file.size > TRAINING_TASK_MAX_FILE_SIZE || file.size <= 0) throw new Error('El archivo debe pesar entre 1 byte y 10 MB.');
  const path = trainingTaskFilePath(task, file, fileId);
  const { error } = await client.storage.from(TRAINING_TASK_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;
  return { path, name: file.name, mime: file.type, size: file.size, isImage: file.type.startsWith('image/') };
};

const withCleanupDetail = (error, cleanupError, path) => {
  if (!cleanupError) return error;
  return new Error(`${error.message || 'No se pudo guardar.'} Limpieza pendiente del archivo ${path}: ${cleanupError.message || 'error desconocido'}.`);
};

export const saveTrainingTaskWithFile = async (client, draft, context, existing = null) => {
  const safeDraft = {
    ...draft,
    editorPayload: prepareTrainingTaskEditorPayload(draft, existing),
  };
  if (!safeDraft.file) return { task: await saveTrainingTask(client, safeDraft, context, existing), cleanupPending: [] };

  // El objeto necesita una tarea existente para que Storage autorice el upload.
  const task = existing || await saveTrainingTask(client, { ...safeDraft, previewPath: '', attachmentPath: '', attachmentName: '', attachmentMime: '', attachmentSize: null }, context);
  let uploaded;
  try {
    uploaded = await uploadTrainingTaskFile(client, task, safeDraft.file);
    const taskWithFile = await saveTrainingTask(client, {
      ...safeDraft,
      previewPath: uploaded.isImage ? uploaded.path : (existing?.previewPath || ''),
      attachmentPath: uploaded.path,
      attachmentName: uploaded.name,
      attachmentMime: uploaded.mime,
      attachmentSize: uploaded.size,
    }, context, task);

    const previousPaths = existing
      ? [...new Set([existing.previewPath, existing.attachmentPath].filter((path) => path && path !== uploaded.path))]
      : [];
    try {
      await removeTrainingTaskFiles(client, previousPaths);
      return { task: taskWithFile, cleanupPending: [] };
    } catch (cleanupError) {
      return { task: taskWithFile, cleanupPending: previousPaths, cleanupError };
    }
  } catch (error) {
    let cleanupError = null;
    if (uploaded?.path) {
      try { await removeTrainingTaskFiles(client, [uploaded.path]); } catch (failure) { cleanupError = failure; }
    }
    if (!existing) {
      try { await deleteTrainingTask(client, task.id); } catch (failure) { cleanupError ||= failure; }
    }
    throw withCleanupDetail(error, cleanupError, uploaded?.path || 'tarea sin adjunto');
  }
};

export const deleteTrainingTaskWithFiles = async (client, task) => {
  // Storage exige tarea existente. Si falla el borrado DB, la fila sigue visible
  // y el usuario recibe un error; no hay transacción distribuida con Storage.
  await removeTrainingTaskFiles(client, [task.previewPath, task.attachmentPath]);
  await deleteTrainingTask(client, task.id);
};
