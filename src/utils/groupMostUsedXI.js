const clean = (value) => String(value ?? '').trim();

const normalizeIdentity = (value) => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .toLowerCase();

const getPlayerKey = ({ playerId, playerName, player } = {}) => {
  const id = clean(player?.id || playerId);
  return id ? `id:${id}` : `name:${normalizeIdentity(player?.name || playerName)}`;
};

const getStoredPlayerRow = (playerStats = {}, playerName = '') => {
  if (playerStats[playerName]) return playerStats[playerName];
  const identity = normalizeIdentity(playerName);
  const entry = Object.entries(playerStats).find(([name]) => normalizeIdentity(name) === identity);
  return entry?.[1] || {};
};

const getKnownMinutes = (value, duration) => {
  if (value === '' || value === null || value === undefined) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.max(0, Math.min(duration, numeric));
};

export const compareSystemUsageRows = (left = {}, right = {}) =>
  Number(right.minutes || 0) - Number(left.minutes || 0)
  || Number(right.played || 0) - Number(left.played || 0)
  || Number(right.initialStarts || 0) - Number(left.initialStarts || 0)
  || clean(left.system).localeCompare(clean(right.system), 'es', { sensitivity: 'base' });

export const resolveStoredTacticalSlot = ({ storedSlot, targetSlots = [], normalizedId = '', slotIndex = 0 } = {}) => {
  const coordinateMatch = storedSlot
    ? targetSlots.find((slot) => Number(slot.x) === Number(storedSlot.x) && Number(slot.y) === Number(storedSlot.y))
    : null;
  return coordinateMatch
    || targetSlots.find((slot) => slot.id === normalizedId)
    || targetSlots[slotIndex]
    || null;
};

export const buildInitialSlotEvidence = ({
  matchId,
  system,
  duration = 90,
  slots = [],
  playerStats = {},
  resolvePlayer = ({ playerName, playerId }) => ({ id: playerId || '', name: playerName }),
} = {}) => slots.flatMap((slotRow) => {
  const playerName = clean(slotRow?.playerName);
  if (!playerName || !slotRow?.tacticalSlot?.id) return [];
  const stored = getStoredPlayerRow(playerStats, playerName);
  const playerId = clean(slotRow.playerId || slotRow.jugadorId || stored.jugadorId || stored.jugador_id);
  const player = resolvePlayer({ playerName, playerId }) || { id: playerId, name: playerName };
  const starterMinutes = getKnownMinutes(stored.minutes, duration);
  const starter = {
    matchId,
    system,
    slot: slotRow.tacticalSlot,
    player,
    playerId,
    playerName,
    playerKey: getPlayerKey({ playerId, playerName, player }),
    minutes: starterMinutes,
    minutesKnown: starterMinutes !== null,
    starts: 1,
    source: 'initial_real_slot',
  };
  const replacementName = clean(stored.replacementName || stored.replacement_name);
  if (starterMinutes === null || starterMinutes <= 0 || starterMinutes >= duration || !replacementName) return [starter];
  const replacementStored = getStoredPlayerRow(playerStats, replacementName);
  const replacementId = clean(replacementStored.jugadorId || replacementStored.jugador_id);
  const replacementPlayer = resolvePlayer({ playerName: replacementName, playerId: replacementId }) || { id: replacementId, name: replacementName };
  return [starter, {
    matchId,
    system,
    slot: slotRow.tacticalSlot,
    player: replacementPlayer,
    playerId: replacementId,
    playerName: replacementName,
    playerKey: getPlayerKey({ playerId: replacementId, playerName: replacementName, player: replacementPlayer }),
    minutes: duration - starterMinutes,
    minutesKnown: true,
    starts: 0,
    source: 'replacement_same_real_slot',
  }];
});

const compareUsage = (left = {}, right = {}) =>
  Number(right.minutes || 0) - Number(left.minutes || 0)
  || Number(right.appearances || 0) - Number(left.appearances || 0)
  || clean(left.playerName).localeCompare(clean(right.playerName), 'es', { sensitivity: 'base' });

export const buildMostUsedXiFromEvidence = ({ system = '', slots = [], evidence = [] } = {}) => {
  const systemEvidence = evidence.filter((row) => row?.system === system && row?.slot?.id && row?.playerKey);
  const systemMatchIds = new Set(systemEvidence.map((row) => clean(row.matchId)).filter(Boolean));
  const slotRows = slots.map((slot, slotIndex) => {
    const byPlayer = new Map();
    systemEvidence.filter((row) => row.slot.id === slot.id).forEach((row) => {
      const current = byPlayer.get(row.playerKey) || {
        playerKey: row.playerKey,
        player: row.player,
        playerName: row.playerName,
        minutes: 0,
        minutesKnown: false,
        knownMinuteAppearances: 0,
        starts: 0,
        matchIds: new Set(),
      };
      if (row.minutesKnown && Number.isFinite(Number(row.minutes))) {
        current.minutes += Number(row.minutes);
        current.minutesKnown = true;
        current.knownMinuteAppearances += 1;
      }
      current.starts += Number(row.starts || 0);
      if (row.matchId) current.matchIds.add(clean(row.matchId));
      byPlayer.set(row.playerKey, current);
    });
    const candidates = Array.from(byPlayer.values()).map((row) => ({
      ...row,
      slot,
      slotIndex,
      appearances: row.matchIds.size,
      matchesUsed: row.matchIds.size,
      systemMatches: systemMatchIds.size,
      presencePercentage: systemMatchIds.size ? Math.round((row.matchIds.size / systemMatchIds.size) * 100) : null,
    })).sort(compareUsage);
    return { slot, slotIndex, candidates };
  });

  const edges = slotRows.flatMap(({ slot, slotIndex, candidates }) => candidates.map((candidate) => ({
    slot,
    slotIndex,
    candidate,
  }))).sort((left, right) => compareUsage(left.candidate, right.candidate)
    || left.slotIndex - right.slotIndex
    || left.candidate.playerKey.localeCompare(right.candidate.playerKey));
  const selectedBySlot = new Map();
  const usedPlayers = new Set();
  edges.forEach(({ slot, candidate }) => {
    if (selectedBySlot.has(slot.id) || usedPlayers.has(candidate.playerKey)) return;
    selectedBySlot.set(slot.id, candidate);
    usedPlayers.add(candidate.playerKey);
  });

  const alternatives = {};
  const assignments = slotRows.map(({ slot, candidates }) => {
    const row = selectedBySlot.get(slot.id) || null;
    alternatives[slot.id] = candidates
      .filter((candidate) => candidate.playerKey !== row?.playerKey && !usedPlayers.has(candidate.playerKey))
      .slice(0, 2);
    return { slot, row, candidates };
  });
  return {
    system,
    assignments,
    alternatives,
    slotRows,
    matchCount: systemMatchIds.size,
    hasData: assignments.some((assignment) => assignment.row),
  };
};

export const getMostUsedXiMetric = (row = {}) => row.minutesKnown
  ? { label: `${Number(row.minutes || 0)}'`, description: `${Number(row.minutes || 0)} minutos en este slot` }
  : { label: `${Number(row.appearances || 0)} PJ`, description: `${Number(row.appearances || 0)} apariciones en este slot; minutos no disponibles` };
