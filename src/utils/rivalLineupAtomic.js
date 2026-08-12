const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value) => UUID_PATTERN.test(String(value || ''));

const placementFields = (placement = {}) => {
  if (placement.status === 'starter') {
    return { tactical_role: 'Titular', tactical_slot: Number(placement.slotIndex), tactical_reserve_slot: null, squad_role: 'Titular' };
  }
  if (placement.status === 'reserve') {
    return { tactical_role: 'Reserva', tactical_slot: Number(placement.slotIndex), tactical_reserve_slot: Number(placement.reserveOrder), squad_role: 'Reserva' };
  }
  return { tactical_role: null, tactical_slot: null, tactical_reserve_slot: null, squad_role: 'Reserva' };
};

export const buildRivalLineupAtomicSnapshot = ({
  teamId,
  system,
  fieldSources = {},
  players = [],
  placements = {},
  lineup = [],
  benchChart = {},
  createPlayerSnapshot = (player) => player,
} = {}) => {
  const playerIdentity = (player = {}) => ({
    membership_id: isUuid(player.membershipId) ? player.membershipId : null,
    rival_player_id: !isUuid(player.membershipId) && isUuid(player.jugadorRivalId || player.id)
      ? (player.jugadorRivalId || player.id)
      : null,
    player_name: String(player.name || '').trim(),
  });
  const playerKey = (player = {}) => String(
    player.membershipId || player.jugadorRivalId || player.globalPlayerId || player.id || player.name || ''
  );

  return {
    p_team_id: teamId,
    p_system: system || null,
    p_field_sources: fieldSources || {},
    p_placements: players.map((player) => ({
      ...playerIdentity(player),
      ...placementFields(placements[playerKey(player)]),
    })),
    p_lineup: lineup.map((player, index) => ({
      ...playerIdentity(player),
      global_player_id: isUuid(player.globalPlayerId) ? player.globalPlayerId : null,
      slot: Number.isInteger(Number(player.slot)) ? Number(player.slot) : index,
      role: 'Titular',
      x: player.x ?? null,
      y: player.y ?? null,
      player_snapshot: createPlayerSnapshot(player),
    })),
    p_bench: Object.entries(benchChart || {}).flatMap(([starterName, slots]) => (
      (slots || []).slice(0, 2).map((player, slot) => ({
        ...playerIdentity(player || {}),
        global_player_id: player && isUuid(player.globalPlayerId) ? player.globalPlayerId : null,
        starter_name: starterName,
        slot,
        player_name: player?.name || null,
        player_snapshot: player ? createPlayerSnapshot(player) : {},
      }))
    )),
  };
};

export const isRivalSaveResponseCurrent = ({ requestedTeamId, currentTeamId, requestId, latestRequestId }) => (
  String(requestedTeamId || '') === String(currentTeamId || '')
  && Number(requestId) === Number(latestRequestId)
);
