const clean = (value) => String(value ?? '').trim();
const normalizeName = (value) => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .toLowerCase();

export const normalizeTacticalParticipant = (row = {}) => {
  const source = row || {};
  return {
    playerId: clean(source.playerId || source.jugadorId || source.jugador_id || source.id),
    playerName: clean(source.playerName || source.player_name || source.playerNameSnapshot || source.player_name_snapshot || source.name),
  };
};

export const getTacticalParticipantKey = (row = {}) => {
  const participant = normalizeTacticalParticipant(row);
  return participant.playerId ? `id:${participant.playerId}` : participant.playerName ? `name:${normalizeName(participant.playerName)}` : '';
};

const findStatsEntry = (playerStats = {}, playerName = '') => {
  if (playerStats[playerName]) return [playerName, playerStats[playerName]];
  const identity = normalizeName(playerName);
  return Object.entries(playerStats).find(([name]) => normalizeName(name) === identity) || [playerName, {}];
};

export const buildKnownOnFieldPlayers = ({ initialSlots = [], playerStats = {}, atMinute = 0 } = {}) => {
  const errors = [];
  const initial = initialSlots
    .slice()
    .sort((left, right) => Number(left.slot) - Number(right.slot))
    .map(normalizeTacticalParticipant)
    .filter((row) => getTacticalParticipantKey(row));
  const initialKeys = initial.map(getTacticalParticipantKey);
  if (initial.length !== 11 || new Set(initialKeys).size !== 11) {
    errors.push('La alineación inicial no contiene 11 jugadores únicos.');
  }
  const playersByKey = new Map(initial.map((player) => [getTacticalParticipantKey(player), player]));
  const substitutions = Object.entries(playerStats || {}).flatMap(([outName, stats]) => {
    const minute = Number(stats?.minutes);
    const replacementName = clean(stats?.replacementName || stats?.replacement_name);
    if (!replacementName || !Number.isFinite(minute) || minute <= 0 || minute > Number(atMinute)) return [];
    const [storedInName, inStats] = findStatsEntry(playerStats, replacementName);
    const outStats = stats || {};
    return [{
      minute,
      outPlayer: normalizeTacticalParticipant({ playerId: outStats.jugadorId || outStats.jugador_id, playerName: outName }),
      inPlayer: normalizeTacticalParticipant({ playerId: inStats.jugadorId || inStats.jugador_id, playerName: storedInName || replacementName }),
    }];
  }).sort((left, right) => left.minute - right.minute || getTacticalParticipantKey(left.outPlayer).localeCompare(getTacticalParticipantKey(right.outPlayer)));

  substitutions.forEach(({ minute, outPlayer, inPlayer }) => {
    const outKey = getTacticalParticipantKey(outPlayer);
    const inKey = getTacticalParticipantKey(inPlayer);
    if (!outKey || !playersByKey.has(outKey)) {
      errors.push(`Sustitución ${minute}': el jugador saliente no estaba identificado en el campo.`);
      return;
    }
    if (!inKey || playersByKey.has(inKey)) {
      errors.push(`Sustitución ${minute}': el jugador entrante no es válido o ya estaba en el campo.`);
      return;
    }
    playersByKey.delete(outKey);
    playersByKey.set(inKey, inPlayer);
  });

  const players = Array.from(playersByKey.values());
  if (players.length !== 11 || new Set(players.map(getTacticalParticipantKey)).size !== 11) {
    errors.push(`El intervalo contiene ${players.length} jugadores inequívocos en lugar de 11.`);
  }
  return { valid: errors.length === 0, players, substitutions, errors };
};

export const buildTacticalDispositionDraft = ({ interval = null, previousInterval = null, knownPlayers = [] } = {}) => {
  const knownByKey = new Map(knownPlayers.map((player) => [getTacticalParticipantKey(player), normalizeTacticalParticipant(player)]));
  const sourceSlots = interval?.isComplete
    ? interval.slots
    : previousInterval?.isComplete && previousInterval.system === interval?.system
      ? previousInterval.slots
      : [];
  const lineup = Array.from({ length: 11 }, () => null);
  sourceSlots.forEach((slotRow) => {
    const slot = Number(slotRow.slot);
    const key = getTacticalParticipantKey(slotRow);
    if (!Number.isInteger(slot) || slot < 0 || slot > 10 || !knownByKey.has(key)) return;
    lineup[slot] = knownByKey.get(key);
  });
  const placed = new Set(lineup.filter(Boolean).map(getTacticalParticipantKey));
  const pendingPlayers = knownPlayers.map(normalizeTacticalParticipant).filter((player) => !placed.has(getTacticalParticipantKey(player)));
  return { lineup, pendingPlayers };
};

export const moveTacticalDispositionPlayer = ({ lineup = [], player, targetSlot } = {}) => {
  const next = Array.from({ length: 11 }, (_, slot) => lineup[slot] ? normalizeTacticalParticipant(lineup[slot]) : null);
  const participant = normalizeTacticalParticipant(player);
  const key = getTacticalParticipantKey(participant);
  const target = Number(targetSlot);
  if (!key || !Number.isInteger(target) || target < 0 || target > 10) return next;
  const source = next.findIndex((row) => getTacticalParticipantKey(row) === key);
  const displaced = next[target];
  next[target] = participant;
  if (source >= 0 && source !== target) next[source] = displaced;
  return next;
};

export const validateTacticalDisposition = ({ lineup = [], knownPlayers = [] } = {}) => {
  const placed = lineup.filter(Boolean).map(normalizeTacticalParticipant);
  const placedKeys = placed.map(getTacticalParticipantKey);
  const knownKeys = knownPlayers.map(getTacticalParticipantKey).filter(Boolean);
  const errors = [];
  if (placed.length !== 11) errors.push(`Debes colocar los 11 jugadores (${placed.length}/11).`);
  if (new Set(placedKeys).size !== placedKeys.length) errors.push('Hay un jugador duplicado en la disposición.');
  if (knownKeys.length !== 11 || new Set(knownKeys).size !== 11) errors.push('No se conocen con certeza los 11 jugadores del intervalo.');
  if (placedKeys.some((key) => !knownKeys.includes(key)) || knownKeys.some((key) => !placedKeys.includes(key))) {
    errors.push('Los jugadores colocados no coinciden exactamente con los que estaban en el campo.');
  }
  return {
    valid: errors.length === 0,
    errors,
    slots: lineup.flatMap((player, slot) => player ? [{ slot, ...normalizeTacticalParticipant(player) }] : []),
  };
};

export const tacticalSnapshotMatchesDisposition = ({ snapshot = {}, matchId = '', minute = 0, system = '', slots = [] } = {}) => {
  const snapshotMatchId = clean(snapshot.partido_id || snapshot.partidoId || snapshot.matchId);
  const snapshotMinute = Number(snapshot.minute);
  const snapshotSystem = clean(snapshot.system);
  const expected = slots
    .map((row) => ({ slot: Number(row.slot), key: getTacticalParticipantKey(row) }))
    .sort((left, right) => left.slot - right.slot);
  const stored = (Array.isArray(snapshot.slots) ? snapshot.slots : [])
    .map((row) => ({ slot: Number(row.slot), key: getTacticalParticipantKey(row) }))
    .sort((left, right) => left.slot - right.slot);
  return snapshotMatchId === clean(matchId)
    && snapshotMinute === Number(minute)
    && snapshotSystem === clean(system)
    && expected.length === 11
    && stored.length === expected.length
    && expected.every((row, index) => row.slot === stored[index].slot && row.key === stored[index].key);
};
