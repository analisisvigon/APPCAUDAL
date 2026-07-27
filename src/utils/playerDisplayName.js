const cleanName = (value) => String(value || '').trim();

export const getPlayerDisplayName = (player = {}) => {
  const source = player && typeof player === 'object' ? player : {};
  return cleanName(source.shirtName)
  || cleanName(source.shirt_name)
  || cleanName(source.shortName)
  || cleanName(source.short_name)
  || cleanName(source.name)
  || 'Jugador';
};

export const getPlayerTooltipText = (player) => {
  if (!player || typeof player !== 'object') return '';
  const hasName = [
    player.shirtName,
    player.shirt_name,
    player.shortName,
    player.short_name,
    player.name,
  ].some((value) => cleanName(value));
  return hasName ? getPlayerDisplayName(player) : '';
};

export const playerMatchesNameQuery = (player = {}, query = '') => {
  const source = player && typeof player === 'object' ? player : {};
  const normalize = (value) => cleanName(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return true;
  return [
    source.name,
    source.shirtName,
    source.shirt_name,
    source.shortName,
    source.short_name,
  ].some((value) => normalize(value).includes(normalizedQuery));
};
