import { getMatchStatus } from './matchStatus.js';

const cleanId = (value) => String(value || '').trim();
const cleanName = (value) => String(value || '').trim().toLocaleLowerCase('es-ES');

const getPlayerIds = (player = {}) => [
  player.id,
  player.jugadorId,
  player.jugador_id,
].map(cleanId).filter(Boolean);

const getPriorityPlayerId = (entry = {}) => cleanId(
  entry.jugadorId
  ?? entry.jugador_id
  ?? entry.ownPlayerId
  ?? entry.own_player_id
  ?? entry.player?.id
);

const getPriorityValue = (entry = {}, fallback = 0) => {
  const value = Number(entry.captainPriority ?? entry.captain_priority ?? entry.priority ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
};

export const getStatsStarterPlayerIds = (match = {}, players = []) => {
  const ids = [];
  const add = (value) => {
    const id = cleanId(value);
    if (id && !ids.includes(id)) ids.push(id);
  };
  const statsSlots = Array.isArray(match?.lineupSlots?.stats) ? match.lineupSlots.stats : [];
  const slotsByIndex = new Map(statsSlots
    .filter((slot) => Number.isInteger(Number(slot?.slot)) && Number(slot.slot) >= 0 && Number(slot.slot) < 11)
    .map((slot) => [Number(slot.slot), slot]));
  const calledIds = match?.statsCalledPlayerIds && typeof match.statsCalledPlayerIds === 'object'
    ? match.statsCalledPlayerIds
    : {};
  const playersByName = players.reduce((map, player) => {
    const name = cleanName(player?.name);
    if (!name) return map;
    const current = map.get(name) || [];
    map.set(name, [...current, player]);
    return map;
  }, new Map());

  Array.from({ length: 11 }, (_, slotIndex) => {
    const storedSlot = slotsByIndex.get(slotIndex);
    const storedId = storedSlot?.jugadorId ?? storedSlot?.jugador_id;
    if (storedId) {
      add(storedId);
      return;
    }
    const name = String(storedSlot?.playerName ?? storedSlot?.player_name ?? match?.statsLineup?.[slotIndex] ?? '').trim();
    if (!name) return;
    const calledId = calledIds[name];
    if (calledId) {
      add(calledId);
      return;
    }
    const candidates = playersByName.get(cleanName(name)) || [];
    if (candidates.length !== 1) return;
    const candidateIds = getPlayerIds(candidates[0]);
    if (candidateIds.length === 1) add(candidateIds[0]);
  });

  return ids;
};

export const normalizeCaptainPriorities = (entries = []) => entries
  .map((entry, index) => ({
    ...entry,
    jugadorId: getPriorityPlayerId(entry),
    captainPriority: getPriorityValue(entry, index + 1),
  }))
  .filter((entry) => entry.jugadorId)
  .sort((left, right) => left.captainPriority - right.captainPriority);

export const resolveMatchCaptain = ({
  match = {},
  players = [],
  captainPriorities = [],
  status = getMatchStatus(match),
} = {}) => {
  const starterPlayerIds = getStatsStarterPlayerIds(match, players);
  const starters = new Set(starterPlayerIds.map(cleanId));
  const persistedPlayerId = cleanId(match.captainPlayerId ?? match.captain_player_id);
  const historical = status === 'played';

  if (persistedPlayerId && historical) {
    return {
      playerId: persistedPlayerId,
      source: 'historical',
      status,
      starterPlayerIds,
      isStarter: starters.has(persistedPlayerId),
      warning: starters.size && !starters.has(persistedPlayerId)
        ? 'El capitán histórico guardado no figura en el XI inicial registrado.'
        : '',
    };
  }

  if (persistedPlayerId && starters.has(persistedPlayerId)) {
    return {
      playerId: persistedPlayerId,
      source: 'manual',
      status,
      starterPlayerIds,
      isStarter: true,
      warning: '',
    };
  }

  const automatic = normalizeCaptainPriorities(captainPriorities)
    .find((entry) => starters.has(cleanId(entry.jugadorId)));
  const invalidOverride = Boolean(persistedPlayerId);
  if (automatic) {
    return {
      playerId: automatic.jugadorId,
      source: invalidOverride ? 'automatic_invalid_override' : 'automatic',
      status,
      starterPlayerIds,
      isStarter: true,
      warning: invalidOverride
        ? 'El override guardado ya no pertenece al XI inicial; se aplica el orden automático.'
        : '',
    };
  }

  return {
    playerId: '',
    source: invalidOverride ? 'none_invalid_override' : 'none',
    status,
    starterPlayerIds,
    isStarter: false,
    warning: invalidOverride
      ? 'El override guardado no pertenece al XI inicial y no hay otro capitán prioritario titular.'
      : starters.size
        ? 'Ningún jugador del orden de capitanes pertenece al XI inicial.'
        : 'Completa el XI inicial real para resolver el capitán automáticamente.',
  };
};

export const getCaptainResolutionLabel = (resolution, players = []) => {
  const player = players.find((candidate) => getPlayerIds(candidate).includes(cleanId(resolution?.playerId)));
  const name = player?.shirtName || player?.name || '';
  if (!resolution?.playerId) return 'Sin capitán resuelto';
  if (resolution.source === 'historical') return `Histórico — ${name || 'Jugador guardado'}`;
  if (resolution.source === 'manual') return `Override manual — ${name || 'Jugador'}`;
  return `Automático — ${name || 'Jugador'}`;
};
