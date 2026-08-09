const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const normalizeComparable = (value) => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('es');

const UNASSIGNED_LABELS = new Set([
  'sin asignar',
  'sin jugador',
  'sin jugador asignado',
  'jugador pendiente',
]);

export const PRINT_PLAYER_TEAM_TYPES = Object.freeze({
  OWN: 'own',
  OPPONENT: 'opponent',
});

export const getOwnPrintKitForMatch = (match = {}) => {
  const venueValue = match?.isHome ?? match?.is_home;
  if (venueValue === undefined || venueValue === null || venueValue === '') return 'home';
  if (typeof venueValue === 'string') {
    return ['true', '1', 'home', 'local'].includes(normalizeComparable(venueValue)) ? 'home' : 'away';
  }
  return venueValue ? 'home' : 'away';
};

export const getPrintPlayerIdentity = (player = {}) => [
  player?.shirtName,
  player?.shirt_name,
  player?.abbreviation,
  player?.abreviatura,
  player?.shortName,
  player?.short_name,
  player?.name,
  player?.label,
  player?.number,
  player?.dorsal,
].map(clean).find((value) => value && !UNASSIGNED_LABELS.has(normalizeComparable(value))) || '';

export const buildPrintPlayerShirtModel = ({
  player,
  teamType = PRINT_PLAYER_TEAM_TYPES.OWN,
  kit = 'home',
  assigned,
} = {}) => {
  const source = player && typeof player === 'object' ? player : {};
  const rawLabels = [source.name, source.label, source.shirtName, source.shirt_name]
    .map(normalizeComparable)
    .filter(Boolean);
  const placeholderPlayer = rawLabels.some((label) => UNASSIGNED_LABELS.has(label));
  const identity = getPrintPlayerIdentity(source);
  const number = clean(source.number || source.dorsal);
  const hasPlayerData = Boolean(source.id || identity || number);
  const isAssigned = !placeholderPlayer && (typeof assigned === 'boolean' ? assigned : hasPlayerData);
  const normalizedTeamType = isAssigned && teamType === PRINT_PLAYER_TEAM_TYPES.OPPONENT
    ? PRINT_PLAYER_TEAM_TYPES.OPPONENT
    : PRINT_PLAYER_TEAM_TYPES.OWN;

  return {
    assigned: isAssigned,
    teamType: normalizedTeamType,
    kit: kit === 'away' ? 'away' : 'home',
    number: isAssigned ? number || '—' : '—',
    identity: isAssigned ? identity || number || 'JUGADOR' : 'SIN ASIGNAR',
  };
};
