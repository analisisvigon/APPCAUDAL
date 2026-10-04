import { buildTrainingTaskPayload, normalizeTrainingTask } from './trainingTasks.js';

const safeDiagnostic = (read) => Promise.resolve()
  .then(read)
  .catch(() => ({ data: null }));

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
  let data;
  let error;
  if (existing) {
    ({ data, error } = await client.from('training_tasks').update(payload).eq('id', existing.id).select('*').single());
  } else {
    const [sessionResult, userResult, membershipResult, canEditResult] = await Promise.all([
      safeDiagnostic(() => client.auth.getSession()),
      safeDiagnostic(() => client.auth.getUser()),
      safeDiagnostic(() => client.rpc('current_membership')),
      payload.club_id
        ? safeDiagnostic(() => client.rpc('can_edit_club_data', { target_club_id: payload.club_id }))
        : Promise.resolve({ data: null }),
    ]);
    const sessionUserId = sessionResult?.data?.session?.user?.id || null;
    const getUserId = userResult?.data?.user?.id || null;
    const membership = Array.isArray(membershipResult?.data)
      ? membershipResult.data[0] || null
      : membershipResult?.data || null;
    const canEditClubData = canEditResult?.data === true
      ? true
      : canEditResult?.data === false ? false : null;

    ({ error } = await client.from('training_tasks').insert(payload));

    console.group('[TRAINING_TASK_RLS_DEBUG]');
    console.log({
      testMode: 'insert-without-representation',
      payload: {
        club_id: payload.club_id,
        author_user_id: payload.author_user_id,
      },
      session: { user: { id: sessionUserId } },
      getUser: { user: { id: getUserId } },
      membership: {
        id: membership?.membership_id || membership?.id || null,
        club_id: membership?.club_id || null,
        user_id: membership?.user_id || null,
        role: membership?.role || null,
        is_active: membership?.is_active ?? null,
      },
      can_edit_club_data: canEditClubData,
      payloadAuthorMatchesSession: payload.author_user_id === sessionUserId,
      payloadAuthorMatchesGetUser: payload.author_user_id === getUserId,
      membershipUserMatchesSession: membership?.user_id === sessionUserId,
      membershipClubMatchesPayload: membership?.club_id === payload.club_id,
      membershipIsActive: membership?.is_active === true,
      membershipCanEdit: canEditClubData === true,
      insertError: {
        code: error?.code || null,
        message: error?.message || null,
        details: error?.details || null,
        hint: error?.hint || null,
      },
    });
    console.groupEnd();
  }
  if (error) throw error;
  if (!existing) {
    return {
      success: true,
      testMode: 'insert-without-representation',
      task: null,
    };
  }
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
