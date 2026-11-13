const unavailable = (error) => ['42883', 'PGRST202', 'PGRST205'].includes(error?.code);
const uuid = (value) => /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value || '');

export async function checkPlannedSessionDeletion(client) {
  const { data, error } = await client.rpc('planned_session_delete_ready_v1');
  if (unavailable(error)) return false;
  if (error) throw error;
  return data === true;
}

export async function canDeletePlannedSessionContext(client, contextId) {
  if (!uuid(contextId)) return false;
  const { data, error } = await client.rpc('can_write_club_team_season', {
    target_club_team_season_id: contextId,
  });
  if (error) throw error;
  return data === true;
}

// Authorization, revision locking, archival and ordered deletion are ONE RPC.
// No client-side delete cascade and no fallback to a legacy mutation.
export async function deletePlannedSession(client, { sessionId, contextId, revision, confirmed }) {
  if (confirmed !== true) throw new Error('Confirma expresamente la eliminación de la sesión.');
  if (!uuid(sessionId) || !uuid(contextId) || !Number.isInteger(revision) || revision < 1) {
    throw new Error('Identidad o revisión de sesión inválida. Recarga la lista.');
  }
  const { data, error } = await client.rpc('delete_planned_session_v1', {
    p_session_id: sessionId, p_club_team_season_id: contextId,
    p_expected_revision: revision, p_confirm: true,
  });
  if (unavailable(error)) throw new Error('Falta instalar y verificar la actualización de eliminación de sesiones en el servidor.');
  if (error) throw error;
  if (data?.status !== 'deleted' || data.session_id !== sessionId
    || data.club_team_season_id !== contextId || data.revision !== revision) {
    throw new Error('El servidor no confirmó la eliminación de esta sesión. Recarga antes de reintentar.');
  }
  const response = await client.from('planned_training_sessions').select('id')
    .eq('id', sessionId).eq('club_team_season_id', contextId).maybeSingle();
  if (response.error) throw response.error;
  if (response.data) throw new Error('La sesión sigue visible tras la eliminación. Recarga la lista.');
  return data;
}
