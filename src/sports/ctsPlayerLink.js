import { assertCtsCreate, loadCtsRoster } from './ctsSportsData.js';

export async function linkAndConfirmCtsPlayer(client, coordinator, snapshot, { playerId, teamId }) {
  const context = await assertCtsCreate(client, coordinator, snapshot);
  if (!playerId || context.teamId !== teamId) throw new Error('Selecciona el CTS autorizado del equipo de destino antes de incorporar al jugador.');
  const { data, error } = await client.rpc('incorporate_global_player_cts_v1', {
    p_cts_id: context.id, p_player_id: playerId,
  });
  if (error) {
    const reasons = {
      CTS_LINK_REVIEW_REQUIRED: 'La vinculación existente requiere revisión. No se han alterado sus datos.',
      CTS_PLAYER_DEPARTED: 'El jugador tiene una baja en este CTS. Su reincorporación requiere revisar las fechas; no se reactivará automáticamente.',
      CTS_WRITE_DENIED: 'No tienes permiso o la temporada de destino está cerrada.',
      SOURCE_PLAYER_ACCESS_REQUIRED: 'No se ha acreditado el acceso al perfil de origen.',
    };
    throw new Error(['42883','PGRST202'].includes(error.code)
      ? 'Falta instalar la actualización de incorporación CTS en Supabase.'
      : reasons[error.message] || error.message || 'No se pudo incorporar al jugador.');
  }
  if (!['linked','already_linked'].includes(data?.status) || data.playerId !== playerId
    || data.ctsId !== context.id || !data.ownPlayerId || !data.membershipId) {
    throw new Error('El servidor no confirmó la vinculación CTS completa.');
  }
  const roster = await loadCtsRoster(client, coordinator, snapshot);
  coordinator.assertWritable(snapshot);
  if (!roster.some((row) => row.id === data.ownPlayerId && row.global_player_id === playerId
    && row.membership_id === data.membershipId)) throw new Error('La incorporación no aparece en la plantilla. Actualiza o reintenta sin crear otro perfil.');
  return roster;
}
