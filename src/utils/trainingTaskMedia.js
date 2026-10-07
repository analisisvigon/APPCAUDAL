import { detectVideoProvider, getVideoThumbnailUrl } from './videoProvider.js';

export const TRAINING_TASK_MEDIA_BUCKET = 'training-task-files';
export const TRAINING_TASK_MEDIA_MAX_FILE_SIZE = 10 * 1024 * 1024;
export const TRAINING_TASK_MEDIA_MIME_TYPES = Object.freeze([
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
]);

const MIME_TYPES = new Set(TRAINING_TASK_MEDIA_MIME_TYPES);
const cleanText = (value) => String(value || '').trim();
export const sanitizeTrainingTaskMediaFileName = (value) => cleanText(value || 'archivo')
  .replace(/[^a-z0-9._-]+/gi, '-')
  .replace(/^-+|-+$/g, '')
  .toLowerCase() || 'archivo';

export const normalizeTrainingTaskMedia = (row = {}) => ({
  ...row,
  taskId: row.task_id || '',
  clubId: row.club_id || '',
  authorUserId: row.author_user_id || '',
  storagePath: row.storage_path || '',
  originalUrl: row.original_url || '',
  providerKey: row.provider_key || '',
  originalName: row.original_name || '',
  mimeType: row.mime_type || '',
  sizeBytes: row.size_bytes ?? null,
  sortOrder: Number(row.sort_order) || 0,
  isPrimary: Boolean(row.is_primary),
});

export const sortTrainingTaskMedia = (rows = []) => [...rows]
  .map(normalizeTrainingTaskMedia)
  .sort((left, right) => left.sortOrder - right.sortOrder || String(left.created_at || '').localeCompare(String(right.created_at || '')) || String(left.id).localeCompare(String(right.id)));

export const validateTrainingTaskMediaFile = (file) => {
  if (!file || !MIME_TYPES.has(file.type)) throw new Error('Formato no permitido. Usa JPG, PNG, WEBP o PDF.');
  if (!Number.isFinite(Number(file.size)) || file.size <= 0 || file.size > TRAINING_TASK_MEDIA_MAX_FILE_SIZE) {
    throw new Error('El archivo debe pesar entre 1 byte y 10 MB.');
  }
  return file;
};

export const trainingTaskMediaStoragePath = (task, file, mediaId) => (
  `${task.club_id}/${task.id}/${task.author_user_id}/media-${mediaId}-${sanitizeTrainingTaskMediaFileName(file.name)}`
);

export const analyzeTrainingTaskMediaUrl = (value) => {
  const originalUrl = cleanText(value);
  if (!originalUrl || /[<>"']/.test(originalUrl) || /\/embed\//i.test(originalUrl) || /^https:\/\/player\.vimeo\.com\//i.test(originalUrl)) {
    throw new Error('Pega una URL HTTPS original, no HTML ni una URL embed.');
  }
  let parsed;
  try { parsed = new URL(originalUrl); } catch { throw new Error('La URL no es válida.'); }
  if (parsed.protocol !== 'https:') throw new Error('La URL debe usar HTTPS.');
  const analysis = detectVideoProvider(originalUrl);
  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  const knownVideoHost = ['youtube.com', 'youtu.be', 'vimeo.com'].includes(host);
  if (analysis.kind === 'invalid' || analysis.kind === 'empty' || (knownVideoHost && analysis.kind === 'external')) {
    throw new Error('El enlace de vídeo no contiene un identificador válido.');
  }
  if (analysis.provider === 'YouTube') return { kind: 'video', provider: 'youtube', providerKey: analysis.providerKey, originalUrl, analysis };
  if (analysis.provider === 'Vimeo') return { kind: 'video', provider: 'vimeo', providerKey: analysis.providerKey, originalUrl, analysis };
  if (analysis.kind === 'video' && ['MP4', 'WEBM', 'M3U8'].includes(analysis.provider)) {
    return { kind: 'video', provider: 'direct', providerKey: null, originalUrl, analysis };
  }
  return { kind: 'link', provider: 'external', providerKey: null, originalUrl, analysis };
};

export const listTaskMedia = async (client, taskId) => {
  const { data, error } = await client.from('training_task_media').select('*').eq('task_id', taskId).order('sort_order', { ascending: true }).order('created_at', { ascending: true });
  if (error) throw error;
  return sortTrainingTaskMedia(data || []);
};

export const createUrlMedia = async (client, task, values, mediaId = crypto.randomUUID()) => {
  const parsed = analyzeTrainingTaskMediaUrl(values.url);
  const payload = {
    id: mediaId, task_id: task.id, club_id: task.club_id, author_user_id: task.author_user_id,
    kind: parsed.kind, source: 'url', original_url: parsed.originalUrl,
    provider: parsed.provider, provider_key: parsed.providerKey,
    title: cleanText(values.title) || null, caption: cleanText(values.caption) || null,
    sort_order: Number.isInteger(values.sortOrder) && values.sortOrder >= 0 ? values.sortOrder : 0,
    is_primary: Boolean(values.isPrimary),
  };
  const { data, error } = await client.from('training_task_media').insert(payload).select('*').single();
  if (error) throw error;
  return normalizeTrainingTaskMedia(data);
};

export const createUploadMediaRow = async (client, task, file, values = {}, mediaId = crypto.randomUUID()) => {
  validateTrainingTaskMediaFile(file);
  const path = trainingTaskMediaStoragePath(task, file, mediaId);
  const payload = {
    id: mediaId, task_id: task.id, club_id: task.club_id, author_user_id: task.author_user_id,
    kind: file.type === 'application/pdf' ? 'document' : 'image', source: 'upload', storage_path: path,
    original_name: cleanText(file.name) || 'archivo', mime_type: file.type, size_bytes: file.size,
    title: cleanText(values.title) || null, caption: cleanText(values.caption) || null,
    sort_order: Number.isInteger(values.sortOrder) && values.sortOrder >= 0 ? values.sortOrder : 0,
    is_primary: Boolean(values.isPrimary),
  };
  const { data, error } = await client.from('training_task_media').insert(payload).select('*').single();
  if (error) throw error;
  return normalizeTrainingTaskMedia(data);
};

export const uploadTaskMediaFile = async (client, task, file, values = {}, mediaId = crypto.randomUUID()) => {
  const row = await createUploadMediaRow(client, task, file, values, mediaId);
  const { error: uploadError } = await client.storage.from(TRAINING_TASK_MEDIA_BUCKET).upload(row.storagePath, file, { upsert: false, contentType: file.type });
  if (!uploadError) return row;
  const { error: cleanupError } = await client.from('training_task_media').delete().eq('id', row.id);
  if (cleanupError) throw new Error(`${uploadError.message || 'No se pudo subir el archivo.'} No se pudo limpiar la fila pendiente: ${cleanupError.message}.`);
  throw uploadError;
};

export const updateTaskMediaMetadata = async (client, mediaId, values) => {
  const payload = { title: cleanText(values.title) || null, caption: cleanText(values.caption) || null };
  const { data, error } = await client.from('training_task_media').update(payload).eq('id', mediaId).select('*').single();
  if (error) throw error;
  return normalizeTrainingTaskMedia(data);
};

export const setTaskMediaPrimary = async (client, taskId, mediaId, rows = []) => {
  const previous = rows.find((row) => row.isPrimary || row.is_primary);
  const { error: clearError } = await client.from('training_task_media').update({ is_primary: false }).eq('task_id', taskId).eq('is_primary', true);
  if (clearError) throw clearError;
  const { data, error } = await client.from('training_task_media').update({ is_primary: true }).eq('id', mediaId).select('*').single();
  if (!error) return normalizeTrainingTaskMedia(data);
  if (previous?.id && previous.id !== mediaId) await client.from('training_task_media').update({ is_primary: true }).eq('id', previous.id);
  throw error;
};

export const reorderTaskMedia = async (client, rows, fromIndex, toIndex) => {
  const ordered = sortTrainingTaskMedia(rows);
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= ordered.length || toIndex >= ordered.length || fromIndex === toIndex) return ordered;
  const [moved] = ordered.splice(fromIndex, 1);
  ordered.splice(toIndex, 0, moved);
  const normalized = ordered.map((row, index) => ({ ...row, sortOrder: index, sort_order: index }));
  for (const row of normalized) {
    const { error } = await client.from('training_task_media').update({ sort_order: row.sortOrder }).eq('id', row.id);
    if (error) throw error;
  }
  return normalized;
};

export const deleteTaskMedia = async (client, media) => {
  if (media.source === 'upload') {
    const { error: storageError } = await client.storage.from(TRAINING_TASK_MEDIA_BUCKET).remove([media.storagePath || media.storage_path]);
    if (storageError) throw storageError;
  }
  const { error } = await client.from('training_task_media').delete().eq('id', media.id);
  if (error) throw error;
};

export const duplicateUrlMedia = async (client, sourceTaskId, targetTask, authorUserId) => {
  const sourceRows = await listTaskMedia(client, sourceTaskId);
  const urlRows = sourceRows.filter((row) => row.source === 'url');
  if (!urlRows.length) return [];
  const payload = urlRows.map((row) => ({
    id: crypto.randomUUID(), task_id: targetTask.id, club_id: targetTask.club_id,
    author_user_id: authorUserId, kind: row.kind, source: 'url', original_url: row.originalUrl,
    provider: row.provider, provider_key: row.providerKey || null, title: row.title || null,
    caption: row.caption || null, sort_order: row.sortOrder, is_primary: row.isPrimary,
  }));
  const { data, error } = await client.from('training_task_media').insert(payload).select('*');
  if (error) throw error;
  return sortTrainingTaskMedia(data || []);
};

export const getTaskMediaSignedUrl = async (client, media, download = false) => {
  const { data, error } = await client.storage.from(TRAINING_TASK_MEDIA_BUCKET).createSignedUrl(
    media.storagePath || media.storage_path, 3600, download ? { download: media.originalName || media.original_name || true } : undefined,
  );
  if (error) throw error;
  return data.signedUrl;
};

export const selectTrainingTaskPreviewMedia = (rows = []) => {
  const ordered = sortTrainingTaskMedia(rows);
  return ordered.find((row) => row.kind === 'image' && row.isPrimary)
    || ordered.find((row) => row.kind === 'image')
    || ordered.find((row) => row.kind === 'video' && getVideoThumbnailUrl(detectVideoProvider(row.originalUrl)))
    || null;
};
