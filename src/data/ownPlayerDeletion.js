export function getPlayerHistoricalSummary(player, { matches = [], stats = null } = {}) {
  if (!player?.id) {
    return { hasHistory: false, matchCount: 0, minutes: 0, starts: 0 };
  }
  const playerId = String(player.id);
  const matchHistory = (matches || []).filter((match) => {
    const isCalledUp = (match.callup || []).some((item) => String(item?.id || item?.player_id || item?.jugador_id || '') === playerId);
    const isInLineup = (match.lineup || []).some((item) => String(item?.id || item?.player_id || item?.jugador_id || '') === playerId);
    const hasSubstitution = (match.substitutions || []).some((sub) => String(sub?.outgoing_jugador_id || '') === playerId || String(sub?.incoming_jugador_id || '') === playerId);
    const hasQuickEvents = (match.quickEvents || []).some((ev) => String(ev?.jugador_id || '') === playerId);
    const isCaptain = String(match?.captain_player_id || '') === playerId;
    const hasGoalOrAssist = (match.goals || []).some((g) => String(g?.scorer_id || g?.scorerId || '') === playerId || String(g?.assistant_id || g?.assistantId || '') === playerId);
    return isCalledUp || isInLineup || hasSubstitution || hasQuickEvents || isCaptain || hasGoalOrAssist;
  });
  const minutes = Number(stats?.minutes ?? player.minutes ?? 0);
  const starts = Number(stats?.starts ?? player.starts ?? 0);
  const hasHistory = matchHistory.length > 0 || minutes > 0 || starts > 0;
  return {
    hasHistory,
    matchCount: matchHistory.length,
    minutes,
    starts,
  };
}

export async function departRosterPlayer(supabase, { jugadorId, ctsId, confirmed, leftOn = null }) {
  if (confirmed !== true || !jugadorId || !ctsId) throw new Error('Confirma la baja del jugador en el equipo y temporada seleccionados.');
  const { data, error } = await supabase.rpc('depart_roster_player_v1', {
    p_jugador_id: jugadorId, p_cts_id: ctsId, p_confirm: true, p_left_on: leftOn,
  });
  if (error) {
    if (['42883', 'PGRST202'].includes(error.code)) throw new Error('La baja CTS requiere instalar y verificar su actualización de Supabase.');
    if (error.message === 'SEASON_CLOSED') throw new Error('La temporada está cerrada. No se ha modificado la plantilla.');
    if (['PLAYER_CTS_DENIED', 'PLAYER_CTS_LINK_REVIEW_REQUIRED'].includes(error.message)) throw new Error('No tienes autorización o la vinculación del jugador no corresponde a este equipo y temporada.');
    throw new Error(error.message || 'No se pudo confirmar la baja.');
  }
  if (data?.status !== 'departed' || data.jugador_id !== jugadorId || data.cts_id !== ctsId) {
    throw new Error('El servidor no confirmó la baja en este equipo y temporada.');
  }
  return data;
}

// Legacy API retained for callers outside Plantilla; never use it as a CTS fallback.
export async function deleteOwnPlayer(supabase, jugadorId) {
  if (!jugadorId) throw new Error('Falta el identificador del jugador.');
  const { data, error } = await supabase.rpc('delete_own_player_atomic_v1', {
    p_jugador_id: jugadorId,
  });
  if (error) {
    const reasons = {
      PLAYER_DELETE_DENIED: 'No tienes permiso para eliminar jugadores.',
      SEASON_CLOSED: 'No se pueden modificar jugadores en una temporada cerrada.',
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
      PLAYER_DELETE_TRIGGER_REVIEW_REQUIRED: 'La comprobación preventiva detectó triggers de borrado pendientes de revisión. No demuestra que este jugador tenga historial y no se ha autorizado su eliminación.',
    };
    const message = error.message || '';
    const code = message.startsWith('PLAYER_DELETE_FK_REVIEW_REQUIRED:')
      ? 'PLAYER_DELETE_FK_REVIEW_REQUIRED' : message;
    const reason = code === 'PLAYER_DELETE_FK_REVIEW_REQUIRED'
      ? 'Existen datos relacionados con el jugador que requieren revisión antes de eliminarlo.'
      : reasons[code];
    throw new Error(reason
      ? `${reason} (Código: ${code})`
      : 'No se pudo eliminar el jugador. Consulta al administrador.');
  }
  if (!['deleted', 'retired'].includes(data?.status)
    || data?.jugador_id !== jugadorId
    || (data.status === 'retired' && data.fine_payments_preserved !== true && data.history_preserved !== true)) {
    throw new Error('El servidor no confirmó la retirada del jugador.');
  }
  return data;
}
