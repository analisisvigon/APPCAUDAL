import { normalizeTrainingTask } from './trainingTasks.js';
import { sortTrainingTaskMedia } from './trainingTaskMedia.js';
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

export async function loadTrainingTaskPrintData(client, taskId, clubId) {
  const { data, error } = await client.from('training_tasks').select('*')
    .eq('club_id', clubId).eq('id', taskId).single();
  if (error) throw error;
  if (!data || data.id !== taskId || data.club_id !== clubId) throw new Error('La tarea ya no está disponible para exportar.');
  const [media, feedback] = await Promise.all([
    readRelated(client, 'training_task_media', taskId),
    readRelated(client, 'training_task_feedback', taskId),
  ]);
  return { ...normalizeTrainingTask(data), media: sortTrainingTaskMedia(media),
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
