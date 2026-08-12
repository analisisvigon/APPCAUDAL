import {
  normalizeDelegatedPlayerName,
  resolveDelegatedPlayer,
} from './delegatedEventIdentity.js';
import { getPlayerDisplayName } from './playerDisplayName.js';

const safeArray = (value) => (Array.isArray(value) ? value : []);
const safeObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const clean = (value) => String(value ?? '').trim();

const getValueByPlayerName = (record, playerName) => {
  const source = safeObject(record);
  if (Object.prototype.hasOwnProperty.call(source, playerName)) return source[playerName];
  const normalizedName = normalizeDelegatedPlayerName(playerName);
  const matchingKey = Object.keys(source).find((key) => normalizeDelegatedPlayerName(key) === normalizedName);
  return matchingKey ? source[matchingKey] : undefined;
};

const getRegisteredNumber = (player = {}) => {
  const rawNumber = clean(player.number ?? player.dorsal);
  const numericNumber = Number(rawNumber);
  if (!rawNumber || !Number.isFinite(numericNumber) || numericNumber <= 0) {
    return { displayNumber: '', numericNumber: null };
  }
  return { displayNumber: rawNumber, numericNumber };
};

export const formatSetPieceLinkedPlayerLabel = (player, { nonStarter = false } = {}) => {
  const { displayNumber } = getRegisteredNumber(player);
  const identity = `${displayNumber ? `#${displayNumber}` : 'Sin dorsal'} · ${getPlayerDisplayName(player)}`;
  return nonStarter ? `${identity} — No titular` : identity;
};

const toOption = (player, id, nonStarter = false) => {
  const number = getRegisteredNumber(player);
  return {
    id: clean(id),
    player,
    displayNumber: number.displayNumber,
    numericNumber: number.numericNumber,
    label: formatSetPieceLinkedPlayerLabel(player, { nonStarter }),
    nonStarter,
  };
};

const compareStarterOptions = (left, right) => {
  if (left.numericNumber === null && right.numericNumber !== null) return 1;
  if (left.numericNumber !== null && right.numericNumber === null) return -1;
  if (left.numericNumber !== null && right.numericNumber !== null && left.numericNumber !== right.numericNumber) {
    return left.numericNumber - right.numericNumber;
  }
  return left.label.localeCompare(right.label, 'es', { sensitivity: 'base', numeric: true });
};

const findCurrentPlayer = (players, currentPlayerId, currentPlayerFallback) => {
  const cleanId = clean(currentPlayerId);
  if (!cleanId) return null;
  return safeArray(players).find((player) => clean(player.id) === cleanId)
    || (currentPlayerFallback ? { ...currentPlayerFallback, id: cleanId } : null);
};

export const buildSetPieceLinkedPlayerOptions = ({
  match,
  players = [],
  currentPlayerId = '',
  currentPlayerFallback = null,
} = {}) => {
  // Estadísticas usa statsLineup como fuente efectiva del rol Titular. No se
  // infiere el XI desde la plantilla, la disponibilidad ni la alineación previa.
  const starterEntries = safeArray(match?.statsLineup)
    .map((playerName, slot) => ({ playerName: clean(playerName), slot }))
    .filter((entry) => entry.playerName);
  const statsSlots = safeArray(match?.lineupSlots?.stats);
  const calledPlayerIds = safeObject(match?.statsCalledPlayerIds);
  const statsPlayerData = safeObject(match?.statsPlayerData);
  const seenIds = new Set();

  const starterOptions = starterEntries.flatMap(({ playerName, slot }) => {
    const statsData = safeObject(getValueByPlayerName(statsPlayerData, playerName));
    const calledPlayerId = getValueByPlayerName(calledPlayerIds, playerName);
    const matchingSlot = statsSlots.find((entry) => Number(entry?.slot) === slot
      && normalizeDelegatedPlayerName(entry?.playerName ?? entry?.player_name) === normalizeDelegatedPlayerName(playerName));
    const identity = resolveDelegatedPlayer({
      playerId: calledPlayerId
        || statsData.jugadorId
        || statsData.jugador_id
        || matchingSlot?.jugadorId
        || matchingSlot?.jugador_id
        || null,
      playerName,
    }, players);
    if (!identity.player || !identity.playerId || seenIds.has(identity.playerId)) return [];
    seenIds.add(identity.playerId);
    return [toOption({ ...identity.player, id: identity.playerId }, identity.playerId)];
  }).sort(compareStarterOptions);

  const cleanCurrentPlayerId = clean(currentPlayerId);
  const currentPlayer = findCurrentPlayer(players, cleanCurrentPlayerId, currentPlayerFallback);
  const exceptionalOption = cleanCurrentPlayerId
    && !seenIds.has(cleanCurrentPlayerId)
    && currentPlayer
    ? toOption(currentPlayer, cleanCurrentPlayerId, true)
    : null;

  return {
    starterOptions,
    exceptionalOption,
    hasDefinedStarters: starterEntries.length > 0,
    sourceStarterCount: starterEntries.length,
  };
};
