import { normalizeTrainingTask } from './trainingTasks.js';
import { getTaskMediaSignedUrl, selectTrainingTaskPreviewMedia, sortTrainingTaskMedia,
  TRAINING_TASK_MEDIA_BUCKET } from './trainingTaskMedia.js';
import { normalizeTrainingTaskFeedback, sortTrainingTaskFeedback } from './trainingTaskFeedback.js';

async function readRelated(client, table, taskId) {
  const rows = [];
  for (;;) {
    const { data, error } = await client.from(table).select('*').eq('task_id', taskId)
      .order('id', { ascending: true }).range(rows.length, rows.length + 199);
    if (error) throw error;
    if (!data?.length) return rows;
    rows.push(...data);
  }
}

export async function loadTrainingTaskPrintData(client, taskId) {
  const { data, error } = await client.from('training_tasks').select('*')
    .eq('id', taskId).single();
  if (error) throw error;
  if (!data || data.id !== taskId) throw new Error('La tarea ya no está disponible para exportar.');
  const [media, feedback] = await Promise.all([
    readRelated(client, 'training_task_media', taskId),
    readRelated(client, 'training_task_feedback', taskId),
  ]);
  const task = normalizeTrainingTask(data);
  const orderedMedia = sortTrainingTaskMedia(media);
  const featured = selectTrainingTaskPreviewMedia(orderedMedia);
  const legacyImagePath = String(task.attachmentMime || '').startsWith('image/') ? task.attachmentPath : '';
  let printImage = null;
  if (featured?.source === 'url' && printableMediaUrl(featured)) {
    printImage = { url: printableMediaUrl(featured), name: featured.title || featured.originalName || task.name };
  } else if (featured?.storagePath) {
    printImage = { url: await getTaskMediaSignedUrl(client, featured),
      name: featured.title || featured.originalName || task.name };
  } else if (legacyImagePath) {
    const { data: signed, error: signedError } = await client.storage.from(TRAINING_TASK_MEDIA_BUCKET)
      .createSignedUrl(legacyImagePath, 3600);
    if (signedError) throw signedError;
    printImage = { url: signed.signedUrl, name: task.attachmentName || task.name };
  }
  return { ...task, media: orderedMedia, printImage,
    feedback: sortTrainingTaskFeedback(feedback.map(normalizeTrainingTaskFeedback)) };
}

export function printableMediaUrl(media) {
  if (media.source !== 'url') return '';
  try {
    const url = new URL(media.originalUrl || media.original_url);
    if (url.protocol !== 'https:' || url.username || url.password ||
        /\/storage\/v1\/object\//i.test(url.pathname) ||
        [...url.searchParams.keys()].some((key) => /token|signature|expires|credential/i.test(key))) return '';
    return url.href;
  } catch { return ''; }
}
