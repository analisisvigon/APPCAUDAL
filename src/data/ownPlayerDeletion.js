export async function deleteOwnPlayer(supabase, jugadorId) {
  if (!jugadorId) throw new Error('Falta el identificador del jugador.');
  const { data, error } = await supabase.rpc('delete_own_player_atomic_v1', {
    p_jugador_id: jugadorId,
  });
  if (error) {
    const reasons = {
      PLAYER_DELETE_DENIED: 'No tienes permiso para eliminar jugadores.',
      SINGLE_CLUB_STAFF_REQUIRED: 'Tu acceso al equipo requiere revisión antes de eliminar jugadores.',
      PLAYER_NOT_FOUND: 'El jugador ya no existe. Actualiza la plantilla.',
      PLAYER_NOT_IN_OWN_TEAM: 'Este jugador no pertenece al equipo propio.',
      PLAYER_IDENTITY_LINK_REVIEW_REQUIRED: 'El jugador tiene una cuenta PLAYER vinculada. Revisa esa identidad antes de eliminarlo.',
      PLAYER_IMMUTABLE_FINE_PAYMENTS_REVIEW_REQUIRED: 'El jugador tiene pagos de multas. El registro contable no se puede borrar.',
      PLAYER_SHARED_SUBSTITUTION_REVIEW_REQUIRED: 'El jugador aparece en sustituciones compartidas de partidos. Revisa esos eventos antes de eliminarlo.',
      PLAYER_CTS_LINK_REVIEW_REQUIRED: 'La vinculación del jugador con el equipo o la temporada requiere revisión.',
      PLAYER_GLOBAL_LINK_REVIEW_REQUIRED: 'La vinculación del jugador con su perfil global requiere revisión.',
      PLAYER_STAGE_SHARED_REVIEW_REQUIRED: 'El jugador tiene una etapa compartida que requiere revisión antes de eliminarlo.',
      PLAYER_CROSS_CLUB_DEPENDENCY_REVIEW_REQUIRED: 'El jugador tiene datos asociados a otro club. Revisa esa vinculación antes de eliminarlo.',
      PLAYER_FINE_FK_REVIEW_REQUIRED: 'Las multas del jugador tienen una dependencia que requiere revisión.',
      PLAYER_DELETE_TRIGGER_REVIEW_REQUIRED: 'Una automatización de la base de datos impide eliminar este jugador. Revisa su configuración.',
    };
    const message = error.message || '';
    if (message.startsWith('PLAYER_DELETE_FK_REVIEW_REQUIRED:')) {
      throw new Error('Existen datos relacionados con el jugador que requieren revisión antes de eliminarlo.');
    }
    throw new Error(reasons[message] || message || 'No se pudo eliminar el jugador.');
  }
  if (data?.status !== 'deleted' || data?.jugador_id !== jugadorId) {
    throw new Error('El servidor no confirmó la eliminación del jugador.');
  }
  return data;
}
