const isMissingCaptainPrioritySchema = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === '42703'
    || error?.code === 'PGRST204'
    || message.includes('captain_priority')
    || message.includes('save_own_captain_priorities');
};

export const loadOwnCaptainPriorities = async (client, players = []) => {
  const membershipToPlayer = new Map(players
    .filter((player) => player?.membershipId && player?.id)
    .map((player) => [String(player.membershipId), player]));
  const membershipIds = [...membershipToPlayer.keys()];
  if (!membershipIds.length) return { rows: [], schemaAvailable: true, unlinkedPlayers: players.length };

  const { data, error } = await client
    .from('player_team_memberships')
    .select('id,player_id,captain,captain_priority')
    .in('id', membershipIds)
    .eq('is_current', true)
    .not('captain_priority', 'is', null)
    .order('captain_priority', { ascending: true });
  if (error) {
    if (isMissingCaptainPrioritySchema(error)) {
      return { rows: [], schemaAvailable: false, unlinkedPlayers: players.filter((player) => !player?.membershipId).length };
    }
    throw error;
  }

  return {
    rows: (data || []).map((row) => ({
      membershipId: row.id,
      globalPlayerId: row.player_id,
      jugadorId: membershipToPlayer.get(String(row.id))?.id || '',
      captainPriority: Number(row.captain_priority),
    })).filter((row) => row.jugadorId),
    schemaAvailable: true,
    unlinkedPlayers: players.filter((player) => !player?.membershipId).length,
  };
};

export const saveOwnCaptainPriorities = async (client, orderedPlayers = []) => {
  const membershipIds = orderedPlayers.map((player) => player?.membershipId).filter(Boolean);
  if (membershipIds.length !== orderedPlayers.length) {
    throw new Error('Todos los capitanes deben tener una relación UUID vigente con la plantilla propia.');
  }
  const { data, error } = await client.rpc('save_own_captain_priorities', {
    p_membership_ids: membershipIds,
  });
  if (error) {
    if (isMissingCaptainPrioritySchema(error)) {
      const schemaError = new Error('Falta aplicar supabase_own_captain_priority.sql en Supabase.');
      schemaError.code = 'CAPTAIN_PRIORITY_SCHEMA_MISSING';
      throw schemaError;
    }
    throw error;
  }
  return (data || []).map((row) => ({
    membershipId: row.membership_id,
    globalPlayerId: row.player_id,
    jugadorId: row.jugador_id,
    captainPriority: Number(row.captain_priority),
  }));
};
