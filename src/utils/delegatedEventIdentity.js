const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const safeArray = (value) => (Array.isArray(value) ? value : []);
const safeObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

export const isCanonicalPlayerId = (value) => UUID_PATTERN.test(String(value || ''));

export const normalizeDelegatedPlayerName = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

export const getCanonicalPlayerId = (player = {}) => {
  const candidates = [
    player.playerId,
    player.jugadorId,
    player.jugador_id,
    player.id,
    player.globalPlayerId,
    player.global_player_id,
  ];
  return candidates.find(isCanonicalPlayerId) || null;
};

const getPlayerName = (player = {}) => String(
  player.name
  || player.playerName
  || player.player_name
  || player.nombre
  || '',
).trim();

const buildPlayerIndexes = (players = []) => {
  const byId = new Map();
  const byName = new Map();
  safeArray(players).forEach((player) => {
    const playerId = getCanonicalPlayerId(player);
    if (playerId) byId.set(String(playerId), player);
    const normalizedName = normalizeDelegatedPlayerName(getPlayerName(player));
    if (!normalizedName) return;
    const matches = byName.get(normalizedName) || [];
    byName.set(normalizedName, [...matches, player]);
  });
  return { byId, byName };
};

export const resolveDelegatedPlayer = (reference = {}, players = []) => {
  const normalizedReference = typeof reference === 'string'
    ? { playerId: reference, playerName: reference }
    : safeObject(reference);
  const { byId, byName } = buildPlayerIndexes(players);
  const rawId = normalizedReference.playerId
    || normalizedReference.jugadorId
    || normalizedReference.jugador_id
    || normalizedReference.id
    || '';
  const canonicalReferenceId = isCanonicalPlayerId(rawId) ? String(rawId) : '';
  const directPlayer = canonicalReferenceId ? byId.get(canonicalReferenceId) : null;
  if (directPlayer) {
    return {
      player: directPlayer,
      playerId: getCanonicalPlayerId(directPlayer),
      playerName: getPlayerName(directPlayer),
      resolvedBy: 'id',
    };
  }

  const rawName = normalizedReference.playerName
    || normalizedReference.player_name
    || normalizedReference.name
    || (!canonicalReferenceId ? rawId : '')
    || '';
  const normalizedName = normalizeDelegatedPlayerName(rawName);
  const nameMatches = normalizedName ? byName.get(normalizedName) || [] : [];
  const canonicalMatches = nameMatches.filter((player) => getCanonicalPlayerId(player));
  if (canonicalMatches.length === 1) {
    const player = canonicalMatches[0];
    return {
      player,
      playerId: getCanonicalPlayerId(player),
      playerName: getPlayerName(player),
      resolvedBy: 'legacy-name',
    };
  }

  return {
    player: null,
    playerId: canonicalReferenceId || null,
    playerName: String(rawName || '').trim(),
    resolvedBy: canonicalReferenceId ? 'unloaded-id' : 'unresolved',
  };
};

export const getDelegatedEventPlayerId = (event = {}) => {
  const rawId = event.playerId || event.jugadorId || event.jugador_id || null;
  return isCanonicalPlayerId(rawId) ? String(rawId) : null;
};

export const resolveDelegatedEventPlayer = (event = {}, players = []) => resolveDelegatedPlayer({
  playerId: getDelegatedEventPlayerId(event),
  playerName: event.playerName || event.player_name || '',
}, players);

export const normalizeDelegatedQuickEvent = (event = {}, players = []) => {
  const identity = resolveDelegatedPlayer({
    playerId: event.playerId || event.jugadorId || event.jugador_id || null,
    playerName: event.playerName || event.player_name || '',
  }, players);
  return {
    id: event.id,
    partidoId: event.partidoId || event.partido_id,
    playerId: identity.playerId,
    jugadorId: identity.playerId,
    playerName: identity.playerName,
    equipo: event.equipo || event.team || 'caudal',
    tipoEvento: event.tipoEvento || event.tipo_evento || event.eventType || '',
    minute: String(event.minute ?? event.minuto ?? ''),
    reviewed: Boolean(event.reviewed),
    createdAt: event.createdAt || event.created_at || '',
  };
};

export const buildDelegatedQuickEventDbPayload = ({
  id,
  partidoId,
  playerReference,
  players = [],
  team = 'caudal',
  eventType = '',
  minute = 0,
  reviewed = false,
} = {}) => {
  const normalizedTeam = team === 'neutral' ? 'caudal' : team;
  const identity = normalizedTeam === 'caudal'
    ? resolveDelegatedPlayer(playerReference, players)
    : { playerId: null };
  const hasPlayerReference = typeof playerReference === 'string'
    ? Boolean(playerReference.trim())
    : Boolean(
      playerReference?.playerId
      || playerReference?.jugadorId
      || playerReference?.jugador_id
      || playerReference?.id
      || playerReference?.playerName
      || playerReference?.player_name
      || playerReference?.name
    );
  if (normalizedTeam === 'caudal' && hasPlayerReference && !identity.playerId) {
    throw new Error('El jugador seleccionado no tiene un jugador_id canónico y el evento no puede guardarse.');
  }
  return {
    ...(id ? { id } : {}),
    partido_id: partidoId,
    jugador_id: normalizedTeam === 'caudal' ? identity.playerId : null,
    equipo: normalizedTeam,
    tipo_evento: eventType,
    minuto: Math.max(0, Math.min(130, Number(minute) || 0)),
    reviewed: Boolean(reviewed),
  };
};

export const buildDelegatedPlayerOptions = ({
  players = [],
  calledPlayerNames = [],
  calledPlayerIds = {},
  statsPlayerData = {},
  lineupNames = [],
} = {}) => {
  const references = [];
  const calledIds = safeObject(calledPlayerIds);
  safeArray(calledPlayerNames).forEach((playerName) => {
    references.push({
      playerId: calledIds[playerName] || safeObject(statsPlayerData)[playerName]?.jugadorId || null,
      playerName,
    });
  });
  Object.entries(safeObject(statsPlayerData)).forEach(([playerName, data]) => {
    references.push({ playerId: safeObject(data).jugadorId || null, playerName });
  });
  safeArray(lineupNames).filter(Boolean).forEach((playerName) => {
    references.push({
      playerId: calledIds[playerName] || safeObject(statsPlayerData)[playerName]?.jugadorId || null,
      playerName,
    });
  });

  const seen = new Set();
  return references.flatMap((reference) => {
    const identity = resolveDelegatedPlayer(reference, players);
    if (!identity.player || !identity.playerId || seen.has(identity.playerId)) return [];
    seen.add(identity.playerId);
    return [{
      ...identity.player,
      id: identity.playerId,
      playerId: identity.playerId,
      jugadorId: identity.playerId,
    }];
  });
};

export const delegatedEventMatchesPlayer = (event = {}, player = {}, players = []) => {
  const playerId = getCanonicalPlayerId(player);
  const eventId = getDelegatedEventPlayerId(event);
  if (playerId && eventId) return playerId === eventId;
  if (eventId) return false;
  const legacyIdentity = resolveDelegatedEventPlayer(event, players);
  return Boolean(playerId && legacyIdentity.playerId === playerId);
};
