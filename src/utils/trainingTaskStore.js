import { buildTrainingTaskPayload, normalizeTrainingTask } from './trainingTasks.js';

export const loadTrainingTasks = async (client, clubId) => {
  const { data, error } = await client
    .from('training_tasks')
    .select('*, training_task_shares(id)')
    .eq('club_id', clubId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => normalizeTrainingTask({ ...row, is_shared: Array.isArray(row.training_task_shares) && row.training_task_shares.length > 0 }));
};

export const saveTrainingTask = async (client, draft, context, existing = null) => {
  const payload = buildTrainingTaskPayload(draft, { ...context, existing });
  if (existing) {
    delete payload.club_id;
    delete payload.author_user_id;
  }
  const request = existing
    ? client.from('training_tasks').update(payload).eq('id', existing.id).select('*').single()
    : client.from('training_tasks').insert(payload).select('*').single();
  const { data, error } = await request;
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
  return normalizeTrainingTask(data);
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
