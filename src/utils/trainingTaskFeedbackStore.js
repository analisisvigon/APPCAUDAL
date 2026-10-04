import {
  buildTrainingTaskFeedbackPayload,
  normalizeTrainingTaskFeedback,
  sortTrainingTaskFeedback,
} from './trainingTaskFeedback.js';

export const loadTrainingTaskFeedback = async (client, taskId) => {
  const { data, error } = await client
    .from('training_task_feedback')
    .select('*')
    .eq('task_id', taskId)
    .order('used_on', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return sortTrainingTaskFeedback((data || []).map(normalizeTrainingTaskFeedback));
};

export const createTrainingTaskFeedback = async (client, draft, context) => {
  const payload = buildTrainingTaskFeedbackPayload(draft, context);
  const { data, error } = await client.from('training_task_feedback').insert(payload).select('*').single();
  if (error) throw error;
  return normalizeTrainingTaskFeedback(data);
};

export const updateTrainingTaskFeedback = async (client, feedbackId, draft) => {
  const payload = {
    used_on: draft.usedOn,
    rating: draft.rating === '' || draft.rating === null || draft.rating === undefined ? null : Number(draft.rating),
    post_text: String(draft.post || '').trim() || null,
  };
  const { data, error } = await client
    .from('training_task_feedback')
    .update(payload)
    .eq('id', feedbackId)
    .select('*')
    .single();
  if (error) throw error;
  return normalizeTrainingTaskFeedback(data);
};

export const deleteTrainingTaskFeedback = async (client, feedbackId) => {
  const { data, error } = await client
    .from('training_task_feedback')
    .delete()
    .eq('id', feedbackId)
    .select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('No se eliminó el POST: comprueba tus permisos.');
};
