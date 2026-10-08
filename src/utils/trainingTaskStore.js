import { buildTrainingTaskPayload, normalizeTrainingTask } from './trainingTasks.js';
import { summarizeTrainingTaskRatings } from './trainingTaskFeedback.js';
import { duplicateUrlMedia, sortTrainingTaskMedia } from './trainingTaskMedia.js';

export const loadTrainingTasks = async (client, clubId) => {
  const [tasksResult, feedbackResult] = await Promise.all([
    client
      .from('training_tasks')
      .select('*, training_task_shares(id), training_task_media(*)')
      .eq('club_id', clubId)
      .order('updated_at', { ascending: false }),
    client
      .from('training_task_feedback')
      .select('task_id,rating')
      .eq('club_id', clubId),
  ]);
  if (tasksResult.error) throw tasksResult.error;
  if (feedbackResult.error) throw feedbackResult.error;

  const feedbackByTask = new Map();
  (feedbackResult.data || []).forEach((row) => {
    const rows = feedbackByTask.get(row.task_id) || [];
    rows.push(row);
    feedbackByTask.set(row.task_id, rows);
  });

  return (tasksResult.data || []).map((row) => ({
    ...normalizeTrainingTask({
      ...row,
      ...summarizeTrainingTaskRatings(feedbackByTask.get(row.id) || []),
      is_shared: Array.isArray(row.training_task_shares) && row.training_task_shares.length > 0,
    }),
    media: sortTrainingTaskMedia(row.training_task_media || []),
  }));
};

export const saveTrainingTask = async (client, draft, context, existing = null) => {
  const payload = buildTrainingTaskPayload(draft, { ...context, existing });
  if (existing) {
    delete payload.club_id;
    delete payload.author_user_id;
  }
  let data;
  let error;
  if (existing) {
    ({ data, error } = await client.from('training_tasks').update(payload).eq('id', existing.id).select('*').single());
  } else {
    ({ data, error } = await client.from('training_tasks').insert(payload).select('*').single());
  }
  if (error) throw error;
  return normalizeTrainingTask(data);
};

export const duplicateTrainingTask = async (client, task, context) => {
  const payload = buildTrainingTaskPayload({ ...task, taskType: task.taskType, technicalContent: task.technicalContent, tacticalContent: task.tacticalContent }, { ...context, existing: task });
  delete payload.id;
  payload.name = `${task.name || 'Tarea'} copia`;
  payload.preview_path = null;
  payload.attachment_path = null;
  payload.attachment_name = null;
  payload.attachment_mime = null;
  payload.attachment_size = null;
  const { data, error } = await client.from('training_tasks').insert(payload).select('*').single();
  if (error) throw error;
  const copy = normalizeTrainingTask(data);
  try {
    const media = await duplicateUrlMedia(client, task.id, copy, context.authorUserId);
    return { ...copy, media };
  } catch (mediaError) {
    const { error: cleanupError } = await client.from('training_tasks').delete().eq('id', copy.id);
    if (cleanupError) throw new Error(`No se pudo copiar Multimedia y quedó una copia incompleta (${copy.id}): ${mediaError.message || 'error desconocido'}.`);
    throw new Error(`No se pudo duplicar la tarea con su Multimedia: ${mediaError.message || 'error desconocido'}.`);
  }
};

export const deleteTrainingTask = async (client, id) => {
  const { data, error } = await client.from('training_tasks').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('No se eliminó la tarea: comprueba tus permisos.');
};

export const shareTrainingTask = async (client, taskId, membershipIds, sharedByUserId) => {
  const rows = membershipIds.map((membershipId) => ({ task_id: taskId, membership_id: membershipId, shared_by_user_id: sharedByUserId }));
  const { error: deleteError } = await client.from('training_task_shares').delete().eq('task_id', taskId);
  if (deleteError) throw deleteError;
  if (!rows.length) return;
  const { error } = await client.from('training_task_shares').insert(rows);
  if (error) throw error;
};
