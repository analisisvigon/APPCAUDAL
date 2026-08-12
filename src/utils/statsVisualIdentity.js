import { getPlayerDisplayName } from './playerDisplayName.js';

const INVALID_IDENTITY_LABELS = new Set(['?', 'desconocido', 'sin jugador']);

const cleanIdentityText = (value) => String(value || '')
  .replace(/^\s*\?+\s*/, '')
  .replace(/\s+/g, ' ')
  .trim();

const normalizeIdentityText = (value) => cleanIdentityText(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('es-ES');

const isUsefulIdentityText = (value) => {
  const cleaned = cleanIdentityText(value);
  return Boolean(cleaned) && !INVALID_IDENTITY_LABELS.has(normalizeIdentityText(cleaned));
};

const getPlayerIds = (player = {}) => [
  player.id,
  player.globalPlayerId,
  player.global_player_id,
  player.legacyId,
  player.legacy_id,
].filter(Boolean).map(String);

const getPlayerNames = (player = {}) => [
  player.name,
  player.shirtName,
  player.shirt_name,
  player.shortName,
  player.short_name,
].filter(isUsefulIdentityText);

export const resolveStatsVisualIdentity = ({ playerId, storedName, players = [], fallback = 'Jugador' } = {}) => {
  const roster = Array.isArray(players) ? players : [];
  const playerById = playerId
    ? roster.find((candidate) => getPlayerIds(candidate).includes(String(playerId)))
    : null;
  const normalizedStoredName = normalizeIdentityText(storedName);
  const playerByName = !playerById && normalizedStoredName
    ? roster.find((candidate) => getPlayerNames(candidate).some((name) => normalizeIdentityText(name) === normalizedStoredName))
    : null;
  const player = playerById || playerByName || null;
  const rosterDisplayName = player ? cleanIdentityText(getPlayerDisplayName(player)) : '';
  const eventDisplayName = isUsefulIdentityText(storedName) ? cleanIdentityText(storedName) : '';
  const fallbackDisplayName = isUsefulIdentityText(fallback) ? cleanIdentityText(fallback) : 'Jugador';
  const displayName = isUsefulIdentityText(rosterDisplayName)
    ? rosterDisplayName
    : eventDisplayName || fallbackDisplayName;

  const rawNumber = player?.number ?? player?.shirtNumber ?? player?.shirt_number ?? null;
  const number = rawNumber !== null && rawNumber !== '' && Number.isFinite(Number(rawNumber))
    ? Number(rawNumber)
    : null;

  return {
    player,
    displayName,
    fullName: eventDisplayName || cleanIdentityText(player?.name) || displayName,
    number,
    source: playerById ? 'player_id' : playerByName ? 'roster' : eventDisplayName ? 'event_name' : 'fallback',
  };
};

export const formatStatsPitchPlayerName = (value, maxLength = 16) => {
  const cleaned = isUsefulIdentityText(value) ? cleanIdentityText(value) : 'Jugador';
  const upperName = cleaned.toLocaleUpperCase('es-ES');
  if (upperName.length <= maxLength) return upperName;

  const words = upperName.split(' ').filter(Boolean);
  if (words.length < 2) return upperName;
  const compactName = `${words[0].charAt(0)}. ${words.at(-1)}`;
  return compactName.length <= maxLength ? compactName : upperName;
};
