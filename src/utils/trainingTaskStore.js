import { buildTrainingTaskPayload, normalizeTrainingTask } from './trainingTasks.js';
import { summarizeTrainingTaskRatings } from './trainingTaskFeedback.js';
import { duplicateUrlMedia, sortTrainingTaskMedia } from './trainingTaskMedia.js';
import { chunkTrainingTaskIds, loadTrainingTaskLibraryScope } from './trainingTaskLibraryScope.js';

export const loadTrainingTasks = async (client, clubTeamSeasonId) => {
  const scope = await loadTrainingTaskLibraryScope(client, clubTeamSeasonId);
  if (!scope.length) return [];
  const tasks = [];
  const feedback = [];
  for (const ids of chunkTrainingTaskIds(scope.map((entry) => entry.taskId))) {
    const [tasksResult, feedbackResult] = await Promise.all([
      client.from('training_tasks').select('*, training_task_media(*)').in('id', ids),
      client.from('training_task_feedback').select('task_id,rating,post_text,used_on').in('task_id', ids),
    ]);
    if (tasksResult.error) throw tasksResult.error;
    if (feedbackResult.error) throw feedbackResult.error;
    tasks.push(...(tasksResult.data || []));
    feedback.push(...(feedbackResult.data || []));
  }

  const feedbackByTask = new Map();
  feedback.forEach((row) => {
    const rows = feedbackByTask.get(row.task_id) || [];
    rows.push(row);
    feedbackByTask.set(row.task_id, rows);
  });

  const scopeByTask = new Map(scope.map((entry) => [entry.taskId, entry]));
  const taskById = new Map(tasks.map((row) => [row.id, row]));
  return scope.map((scopeEntry) => taskById.get(scopeEntry.taskId)).filter(Boolean).map((row) => ({
    ...normalizeTrainingTask({
      ...row,
      ...summarizeTrainingTaskRatings(feedbackByTask.get(row.id) || []),
      feedbackSearchText: (feedbackByTask.get(row.id) || [])
        .map((entry) => entry.post_text)
        .filter(Boolean)
        .join('\n'),
      is_personal: scopeByTask.get(row.id)?.isPersonal === true,
      is_shared_with_team: scopeByTask.get(row.id)?.isSharedWithTeam === true,
      is_shared: scopeByTask.get(row.id)?.isSharedWithTeam === true,
    }),
    media: sortTrainingTaskMedia(row.training_task_media || []),
  }));
};

const createSharedTrainingTask = async (client, payload, context, taskId = crypto.randomUUID()) => {
  if (!context.clubTeamSeasonId) throw new Error('Selecciona un equipo y temporada autorizados.');
  const rpcPayload = { ...payload };
  delete rpcPayload.club_id;
  delete rpcPayload.author_user_id;
  const { data, error } = await client.rpc('create_shared_training_task_v1', {
    p_cts_id: context.clubTeamSeasonId,
    p_task_id: taskId,
    p_task_payload: rpcPayload,
  });
  if (error) throw error;
  if (!data?.id) throw new Error('Supabase no confirmó la creación compartida.');
  return normalizeTrainingTask(data);
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
    return createSharedTrainingTask(client, payload, context);
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
  const copy = await createSharedTrainingTask(client, payload, context);
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

export const shareTrainingTask = async (client, taskId, clubTeamSeasonId, shared) => {
  const { data, error } = await client.rpc('set_training_task_team_link_v1', {
    p_task_id: taskId,
    p_cts_id: clubTeamSeasonId,
    p_shared: shared === true,
  });
  if (error) throw error;
  if (data !== true) throw new Error('No se confirmó la actualización de la biblioteca.');
};
