export async function deleteOwnPlayer(supabase, jugadorId) {
  if (!jugadorId) throw new Error('Falta el identificador del jugador.');
  const { data, error } = await supabase.rpc('delete_own_player_atomic_v1', {
    p_jugador_id: jugadorId,
  });
  if (error) {
    const reasons = {
      PLAYER_IDENTITY_LINK_REVIEW_REQUIRED: 'El jugador tiene una cuenta PLAYER vinculada. Revisa esa identidad antes de eliminarlo.',
      PLAYER_IMMUTABLE_FINE_PAYMENTS_REVIEW_REQUIRED: 'El jugador tiene pagos de multas. El registro contable no se puede borrar.',
      PLAYER_SHARED_SUBSTITUTION_REVIEW_REQUIRED: 'El jugador aparece en sustituciones compartidas de partidos. Revisa esos eventos antes de eliminarlo.',
      PLAYER_CTS_LINK_REVIEW_REQUIRED: 'La vinculación del jugador con el equipo o la temporada requiere revisión.',
      PLAYER_GLOBAL_LINK_REVIEW_REQUIRED: 'La vinculación del jugador con su perfil global requiere revisión.',
    };
    throw new Error(reasons[error.message] || error.message);
  }
  if (data?.status !== 'deleted' || data?.jugador_id !== jugadorId) {
    throw new Error('El servidor no confirmó la eliminación del jugador.');
  }
  return data;
}
