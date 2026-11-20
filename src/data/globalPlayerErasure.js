// Contract for the dedicated owner-only RPC. No legacy fallback and no
// client-side history decision. Backend implementation requires schema review.
export async function eraseGlobalPlayer(client, { playerId, confirmation, requestId }) {
  const uuid = (value) => /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value || '');
  if (confirmation !== 'ELIMINAR') throw new Error('Escribe ELIMINAR exactamente para confirmar.');
  if (!uuid(playerId) || !uuid(requestId)) throw new Error('Identidad o identificador de operación inválidos.');
  const { data, error } = await client.rpc('erase_global_player_v1', {
    p_player_id: playerId, p_confirmation: confirmation, p_request_id: requestId,
  });
  if (error) {
    if (['PGRST202','42883'].includes(error.code)) throw new Error('La eliminación definitiva aún no está instalada y verificada.');
    if (error.code === '42501') throw new Error('Supabase no ha autorizado al propietario para eliminar este perfil global.');
    throw new Error('No se ha confirmado la eliminación. Actualiza el estado antes de reintentar.');
  }
  if (data?.status !== 'deleted' || data.request_id !== requestId || data.player_id !== playerId) {
    throw new Error('El servidor no devolvió un comprobante válido de eliminación.');
  }
  return data;
}
