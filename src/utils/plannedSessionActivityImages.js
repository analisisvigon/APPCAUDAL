export const SESSION_ACTIVITY_IMAGE_BUCKET = 'planned-session-activity-images';
export const SESSION_ACTIVITY_IMAGE_MAX_SIZE = 10 * 1024 * 1024;
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
  const { error: confirmError } = await client.rpc('confirm_planned_session_activity_cleanup_v1', {
    p_storage_path: image.storagePath,
  });
  if (confirmError) throw confirmError;
};

export const cleanupDeletedSessionActivityImages = async (client, clubTeamSeasonId, sessionId = null) => {
  const { data, error } = await client.rpc('list_planned_session_activity_cleanup_v1', {
    p_club_team_season_id: clubTeamSeasonId, p_session_id: sessionId,
  });
  if (error) throw error;
  const failed = [];
  for (const row of data || []) {
    const { error: storageError } = await client.storage.from(SESSION_ACTIVITY_IMAGE_BUCKET).remove([row.storage_path]);
    if (storageError) { failed.push(row.storage_path); continue; }
    const { error: confirmError } = await client.rpc('confirm_planned_session_activity_cleanup_v1', {
      p_storage_path: row.storage_path,
    });
    if (confirmError) failed.push(row.storage_path);
  }
  return { total: (data || []).length, failed };
};

export const reorderSessionActivityImages = async (client, rows, fromIndex, toIndex) => {
  const ordered = sortSessionActivityImages(rows);
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= ordered.length || toIndex >= ordered.length) return ordered;
  const [moved] = ordered.splice(fromIndex, 1);
  ordered.splice(toIndex, 0, moved);
  const { error } = await client.rpc('reorder_planned_session_activity_images_v1', {
    p_item_id: ordered[0].itemId, p_image_ids: ordered.map((row) => row.id),
  });
  if (error) throw error;
  return ordered.map((row, index) => ({ ...row, sortOrder: index, sort_order: index }));
};

export const replaceSessionActivityImage = async (client, _context, image, file) => {
  validateSessionActivityImage(file);
  const bucket = client.storage.from(SESSION_ACTIVITY_IMAGE_BUCKET);
  const { data: previous, error: downloadError } = await bucket.download(image.storagePath);
  if (downloadError) throw downloadError;
  const { error: storageError } = await bucket.update(image.storagePath, file, { upsert: false, contentType: file.type });
  if (storageError) throw storageError;
  const payload = { original_name: clean(file.name), mime_type: file.type, size_bytes: file.size };
  const { data, error } = await client.from('planned_session_activity_images').update(payload).eq('id', image.id).select('*').single();
  if (!error) return { ...normalizeSessionActivityImage(data), signedUrl: URL.createObjectURL(file) };
  const { error: rollbackError } = await bucket.update(image.storagePath, previous, {
    upsert: false, contentType: image.mimeType,
  });
  if (rollbackError) throw new Error(`${error.message} Tampoco se pudo restaurar el archivo anterior: ${rollbackError.message}.`);
  throw error;
};
