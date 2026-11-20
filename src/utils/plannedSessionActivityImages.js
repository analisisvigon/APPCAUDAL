export const SESSION_ACTIVITY_IMAGE_BUCKET = 'planned-session-activity-images';
export const SESSION_ACTIVITY_IMAGE_MAX_SIZE = 10 * 1024 * 1024;
// La tabla admite ocho filas; la interfaz reserva la octava temporalmente para
// poder sustituir una imagen sin borrar antes el original.
export const SESSION_ACTIVITY_IMAGE_MAX_COUNT = 7;
export const SESSION_ACTIVITY_IMAGE_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);

const allowedTypes = new Set(SESSION_ACTIVITY_IMAGE_TYPES);
const clean = (value) => String(value || '').trim();
const safeName = (value) => clean(value || 'imagen')
  .replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'imagen';

export const normalizeSessionActivityImage = (row = {}) => ({
  ...row,
  sessionId: row.session_id || '',
  itemId: row.item_id || '',
  storagePath: row.storage_path || '',
  originalName: row.original_name || '',
  mimeType: row.mime_type || '',
  sizeBytes: row.size_bytes ?? null,
  sortOrder: Number(row.sort_order) || 0,
  signedUrl: row.signedUrl || '',
});

export const sortSessionActivityImages = (rows = []) => [...rows]
  .map(normalizeSessionActivityImage)
  .sort((a, b) => a.sortOrder - b.sortOrder || String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id)));

export const validateSessionActivityImage = (file) => {
  if (!file || !allowedTypes.has(file.type)) throw new Error('Formato no permitido. Usa JPG, PNG o WebP.');
  if (!clean(file.name) || clean(file.name).length > 255) throw new Error('El nombre de la imagen debe tener entre 1 y 255 caracteres.');
  if (!Number.isFinite(Number(file.size)) || file.size <= 0 || file.size > SESSION_ACTIVITY_IMAGE_MAX_SIZE) {
    throw new Error('Cada imagen debe pesar entre 1 byte y 10 MB.');
  }
  return file;
};

export const sessionActivityImagePath = ({ clubId, sessionId, itemId, userId, imageId, file }) =>
  `${clubId}/${sessionId}/${itemId}/${userId}/image-${imageId}-${safeName(file.name)}`;

export const loadSessionActivityImages = async (client, sessionId) => {
  const { data, error } = await client.from('planned_session_activity_images').select('*')
    .eq('session_id', sessionId).order('sort_order', { ascending: true }).order('created_at', { ascending: true });
  if (error) throw error;
  const rows = sortSessionActivityImages(data || []);
  const hydrated = await Promise.all(rows.map(async (row) => {
    const { data: signed, error: signedError } = await client.storage.from(SESSION_ACTIVITY_IMAGE_BUCKET)
      .createSignedUrl(row.storagePath, 3600);
    if (signedError) throw signedError;
    return { ...row, signedUrl: signed.signedUrl };
  }));
  return Object.groupBy ? Object.groupBy(hydrated, (row) => row.itemId) : hydrated.reduce((groups, row) => {
    groups[row.itemId] = [...(groups[row.itemId] || []), row];
    return groups;
  }, {});
};

export const uploadSessionActivityImage = async (client, context, file, sortOrder, imageId = crypto.randomUUID()) => {
  validateSessionActivityImage(file);
  const storagePath = sessionActivityImagePath({ ...context, imageId, file });
  const payload = {
    id: imageId, session_id: context.sessionId, item_id: context.itemId,
    club_team_season_id: context.clubTeamSeasonId, club_id: context.clubId,
    uploader_user_id: context.userId, storage_path: storagePath,
    original_name: clean(file.name), mime_type: file.type, size_bytes: file.size,
    sort_order: sortOrder,
  };
  const { data, error } = await client.from('planned_session_activity_images').insert(payload).select('*').single();
  if (error) throw error;
  const row = normalizeSessionActivityImage(data);
  const { error: uploadError } = await client.storage.from(SESSION_ACTIVITY_IMAGE_BUCKET)
    .upload(row.storagePath, file, { upsert: false, contentType: file.type });
  if (uploadError) {
    const { error: cleanupError } = await client.from('planned_session_activity_images').delete().eq('id', row.id);
    if (cleanupError) throw new Error(`${uploadError.message} No se pudo limpiar el registro pendiente: ${cleanupError.message}.`);
    throw uploadError;
  }
  const { data: signed, error: signedError } = await client.storage.from(SESSION_ACTIVITY_IMAGE_BUCKET)
    .createSignedUrl(row.storagePath, 3600);
  if (signedError) throw signedError;
  return { ...row, signedUrl: signed.signedUrl };
};

export const deleteSessionActivityImage = async (client, image) => {
  const { error: storageError } = await client.storage.from(SESSION_ACTIVITY_IMAGE_BUCKET).remove([image.storagePath]);
  if (storageError) throw storageError;
  const { error } = await client.from('planned_session_activity_images').delete().eq('id', image.id);
  if (error) throw error;
  await client.from('planned_session_activity_image_cleanup').delete().eq('storage_path', image.storagePath);
};

export const cleanupDeletedSessionActivityImages = async (client, sessionId) => {
  const { data, error } = await client.from('planned_session_activity_image_cleanup').select('storage_path')
    .eq('session_id', sessionId);
  if (error) throw error;
  const failed = [];
  for (const row of data || []) {
    const { error: storageError } = await client.storage.from(SESSION_ACTIVITY_IMAGE_BUCKET).remove([row.storage_path]);
    if (storageError) { failed.push(row.storage_path); continue; }
    const { error: queueError } = await client.from('planned_session_activity_image_cleanup')
      .delete().eq('storage_path', row.storage_path);
    if (queueError) failed.push(row.storage_path);
  }
  return { total: (data || []).length, failed };
};

export const reorderSessionActivityImages = async (client, rows, fromIndex, toIndex) => {
  const ordered = sortSessionActivityImages(rows);
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= ordered.length || toIndex >= ordered.length) return ordered;
  const original = new Map(ordered.map((row) => [row.id, row.sortOrder]));
  const [moved] = ordered.splice(fromIndex, 1);
  ordered.splice(toIndex, 0, moved);
  const changed = [];
  for (const [index, row] of ordered.entries()) {
    const { error } = await client.from('planned_session_activity_images').update({ sort_order: index }).eq('id', row.id);
    if (error) {
      await Promise.allSettled(changed.map((id) => client.from('planned_session_activity_images').update({ sort_order: original.get(id) }).eq('id', id)));
      throw error;
    }
    changed.push(row.id);
  }
  return ordered.map((row, index) => ({ ...row, sortOrder: index, sort_order: index }));
};

export const replaceSessionActivityImage = async (client, context, image, file) => {
  const replacement = await uploadSessionActivityImage(client, context, file, image.sortOrder);
  try {
    await deleteSessionActivityImage(client, image);
    return replacement;
  } catch (error) {
    await deleteSessionActivityImage(client, replacement).catch(() => {});
    throw error;
  }
};
