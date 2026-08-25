import { getPlayerDisplayName } from './playerDisplayName.js';

const cleanId = (value) => String(value || '').trim();

export const normalizeMatchPrintResponsibilities = (source = {}) => ({
  goalkeeperProtocolPrimaryPlayerId: cleanId(
    source.goalkeeperProtocolPrimaryPlayerId ?? source.goalkeeper_protocol_primary_player_id
  ),
  goalkeeperProtocolSecondaryPlayerId: cleanId(
    source.goalkeeperProtocolSecondaryPlayerId ?? source.goalkeeper_protocol_secondary_player_id
  ),
});

export const updateGoalkeeperProtocolSelection = (current, field, playerId) => {
  const normalized = normalizeMatchPrintResponsibilities(current);
  const nextPlayerId = cleanId(playerId);
  if (field === 'primary') {
    return {
      ...normalized,
      goalkeeperProtocolPrimaryPlayerId: nextPlayerId,
      goalkeeperProtocolSecondaryPlayerId: nextPlayerId === normalized.goalkeeperProtocolSecondaryPlayerId
        ? ''
        : normalized.goalkeeperProtocolSecondaryPlayerId,
    };
  }
  if (field === 'secondary') {
    return {
      ...normalized,
      goalkeeperProtocolSecondaryPlayerId: nextPlayerId === normalized.goalkeeperProtocolPrimaryPlayerId
        ? ''
        : nextPlayerId,
    };
  }
  return normalized;
};

export const buildMatchResponsibilityPlayers = (starters = [], bench = []) => {
  const byId = new Map();
  [...(Array.isArray(starters) ? starters : []), ...(Array.isArray(bench) ? bench : [])].forEach((player) => {
    const playerId = cleanId(player?.id);
    if (playerId && !byId.has(playerId)) byId.set(playerId, player);
  });
  return [...byId.values()];
};

export const buildGoalkeeperProtocolModel = ({ settings, availablePlayers = [], allPlayers = [] } = {}) => {
  const normalized = normalizeMatchPrintResponsibilities(settings);
  const availableIds = new Set(availablePlayers.map((player) => cleanId(player?.id)).filter(Boolean));
  const allPlayersById = new Map(
    [...allPlayers, ...availablePlayers]
      .map((player) => [cleanId(player?.id), player])
      .filter(([playerId]) => playerId)
  );
  const primaryPlayer = allPlayersById.get(normalized.goalkeeperProtocolPrimaryPlayerId) || null;
  const secondaryPlayer = allPlayersById.get(normalized.goalkeeperProtocolSecondaryPlayerId) || null;
  return {
    ...normalized,
    primaryPlayer,
    secondaryPlayer,
    primaryName: primaryPlayer ? getPlayerDisplayName(primaryPlayer) : '',
    secondaryName: secondaryPlayer ? getPlayerDisplayName(secondaryPlayer) : '',
    primaryIsAvailable: Boolean(normalized.goalkeeperProtocolPrimaryPlayerId && availableIds.has(normalized.goalkeeperProtocolPrimaryPlayerId)),
    secondaryIsAvailable: Boolean(normalized.goalkeeperProtocolSecondaryPlayerId && availableIds.has(normalized.goalkeeperProtocolSecondaryPlayerId)),
    show: Boolean(normalized.goalkeeperProtocolPrimaryPlayerId && availableIds.has(normalized.goalkeeperProtocolPrimaryPlayerId)),
  };
};
