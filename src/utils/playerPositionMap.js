import { mapExternalPositionToPlayerPositions } from '../constants/playerPositions.js';

const rows = (value) => Array.isArray(value) ? value : [];
const number = (value) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const clean = (value) => String(value ?? '').trim();
const normalize = (value) => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

// Misma orientación que formationSlotCoordinates: izquierda/derecha del jugador,
// portería rival arriba (y=0) y portería propia abajo (y=1).
const POSITION_MAP_COORDINATES = Object.freeze({
  goalkeeper: { x: 0.50, y: 0.89 },
  sweeper_keeper: { x: 0.50, y: 0.82 },
  right_back: { x: 0.82, y: 0.73 },
  left_back: { x: 0.18, y: 0.73 },
  right_wing_back: { x: 0.86, y: 0.48 },
  left_wing_back: { x: 0.14, y: 0.48 },
  centre_back: { x: 0.50, y: 0.75 },
  right_centre_back: { x: 0.66, y: 0.73 },
  left_centre_back: { x: 0.34, y: 0.73 },
  libero: { x: 0.50, y: 0.66 },
  holding_midfield: { x: 0.50, y: 0.57 },
  defensive_midfield: { x: 0.50, y: 0.53 },
  central_midfield: { x: 0.50, y: 0.45 },
  right_central_midfield: { x: 0.62, y: 0.40 },
  left_central_midfield: { x: 0.38, y: 0.40 },
  attacking_midfield: { x: 0.50, y: 0.31 },
  right_midfield: { x: 0.82, y: 0.44 },
  left_midfield: { x: 0.18, y: 0.44 },
  right_winger: { x: 0.80, y: 0.18 },
  left_winger: { x: 0.20, y: 0.18 },
  second_striker: { x: 0.50, y: 0.23 },
  centre_forward: { x: 0.50, y: 0.14 },
  mobile_forward: { x: 0.50, y: 0.18 },
  target_forward: { x: 0.50, y: 0.12 },
});

const TACTICAL_LABEL_COORDINATES = Object.freeze({
  'pivote derecho': { x: 0.61, y: 0.54 },
  'pivote izquierdo': { x: 0.39, y: 0.54 },
});

export const getPositionMapCoordinates = (position) => {
  const label = clean(position);
  if (!label) return null;
  const tacticalCoordinates = TACTICAL_LABEL_COORDINATES[normalize(label)];
  if (tacticalCoordinates) return { ...tacticalCoordinates };
  const mapped = mapExternalPositionToPlayerPositions(label);
  const coordinates = POSITION_MAP_COORDINATES[mapped.primarySpecificPosition];
  return coordinates ? { ...coordinates } : null;
};

const getLevel = (index) => index === 0
  ? { level: 'principal', levelLabel: 'Principal' }
  : index === 1
    ? { level: 'secondary', levelLabel: 'Secundaria' }
    : { level: 'other', levelLabel: 'Otra' };

export const buildPlayerPositionMapModel = (usage = {}) => {
  const officialMinutes = number(usage.totalMinutes);
  const positions = rows(usage.positions)
    .filter((position) => number(position?.minutes) > 0 && clean(position?.position))
    .slice()
    .sort((left, right) => number(right.minutes) - number(left.minutes)
      || clean(left.position).localeCompare(clean(right.position), 'es'));
  const totalIdentifiedMinutes = positions.reduce((sum, position) => sum + number(position.minutes), 0);
  const unknownPositionMinutes = number(usage.unknownMinutes);
  const normalizedPositions = positions.map((position, index) => ({
    ...position,
    position: clean(position.position),
    minutes: number(position.minutes),
    percentage: officialMinutes ? Math.round((number(position.minutes) / officialMinutes) * 100) : 0,
    coordinates: getPositionMapCoordinates(position.position),
    markerNumber: index + 1,
    ...getLevel(index),
  }));
  return {
    officialMinutes,
    totalIdentifiedMinutes,
    unknownPositionMinutes,
    positions: normalizedPositions,
    markers: normalizedPositions.filter((position) => position.coordinates),
    unmappedPositions: normalizedPositions.filter((position) => !position.coordinates),
    empty: officialMinutes === 0,
    hasPositionData: normalizedPositions.length > 0,
    valid: totalIdentifiedMinutes <= officialMinutes
      && totalIdentifiedMinutes + unknownPositionMinutes === officialMinutes,
  };
};

export const PLAYER_POSITION_MAP_ORIENTATION = Object.freeze({
  attack: 'up',
  horizontal: 'player-perspective',
});
