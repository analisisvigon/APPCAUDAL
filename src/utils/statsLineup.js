export const STATS_LINEUP_SLOT_COUNT = 11;

const cleanPlayerName = (value) => String(value || '').trim();

export const normalizeStatsLineup = (lineup = [], slotCount = STATS_LINEUP_SLOT_COUNT) => {
  const normalized = Array.from({ length: slotCount }, () => '');
  const usedPlayers = new Set();
  Array.from({ length: slotCount }, (_, index) => cleanPlayerName(lineup?.[index])).forEach((playerName, index) => {
    if (!playerName || usedPlayers.has(playerName)) return;
    normalized[index] = playerName;
    usedPlayers.add(playerName);
  });
  return normalized;
};

export const moveStatsLineupPlayer = ({ lineup = [], playerName, targetSlot }) => {
  const cleanLineup = normalizeStatsLineup(lineup);
  const movingPlayerName = cleanPlayerName(playerName);
  const targetIndex = Number(targetSlot);
  if (!movingPlayerName || !Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= cleanLineup.length) {
    return { lineup: cleanLineup, changed: false, sourceSlot: -1, targetSlot: targetIndex, displacedPlayerName: '', demotedPlayerName: '' };
  }

  const sourceSlot = cleanLineup.indexOf(movingPlayerName);
  if (sourceSlot === targetIndex) {
    return { lineup: cleanLineup, changed: false, sourceSlot, targetSlot: targetIndex, displacedPlayerName: '', demotedPlayerName: '' };
  }

  const displacedPlayerName = cleanLineup[targetIndex] || '';
  cleanLineup[targetIndex] = movingPlayerName;
  if (sourceSlot >= 0) cleanLineup[sourceSlot] = displacedPlayerName;

  return {
    lineup: normalizeStatsLineup(cleanLineup),
    changed: true,
    sourceSlot,
    targetSlot: targetIndex,
    displacedPlayerName,
    demotedPlayerName: sourceSlot < 0 ? displacedPlayerName : '',
  };
};

export const removeStatsLineupPlayer = (lineup = [], playerName = '') => {
  const cleanLineup = normalizeStatsLineup(lineup);
  const sourceSlot = cleanLineup.indexOf(cleanPlayerName(playerName));
  if (sourceSlot >= 0) cleanLineup[sourceSlot] = '';
  return normalizeStatsLineup(cleanLineup);
};

export const getStatsLineupInvariantReport = (lineup = []) => {
  const rawNames = lineup.map(cleanPlayerName).filter(Boolean);
  const normalized = normalizeStatsLineup(lineup);
  const placedNames = normalized.filter(Boolean);
  return {
    valid: rawNames.length === placedNames.length && new Set(rawNames).size === rawNames.length,
    placedCount: placedNames.length,
    uniquePlayerCount: new Set(placedNames).size,
    lineup: normalized,
  };
};

export const buildStatsLineupRows = ({ matchId, lineup = [], players = [] }) => {
  const playersByName = new Map(players.map((player) => [player.name, player]));
  return normalizeStatsLineup(lineup).flatMap((playerName, slot) => {
    if (!playerName) return [];
    const player = playersByName.get(playerName);
    return [{
      partido_id: matchId,
      scope: 'stats',
      slot,
      player_name: playerName,
      jugador_id: player?.id || null,
    }];
  });
};

export const hydrateStatsLineup = (rows = []) => {
  const lineup = Array.from({ length: STATS_LINEUP_SLOT_COUNT }, () => '');
  rows.forEach((row) => {
    const slot = Number(row?.slot);
    if (Number.isInteger(slot) && slot >= 0 && slot < lineup.length) lineup[slot] = cleanPlayerName(row.player_name ?? row.playerName);
  });
  return normalizeStatsLineup(lineup);
};
