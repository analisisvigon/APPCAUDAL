import {
  getNaturalPositionForSpecific,
  getPlayerPositionModel,
  mapExternalPositionToPlayerPositions,
} from '../constants/playerPositions.js';
import { getPlayerDisplayName } from './playerDisplayName.js';

const ROLE_ORDER = new Map([
  ['titular', 0],
  ['suplente', 1],
]);

const FAMILY_ORDER = new Map([
  ['goalkeeper', 0],
  ['defender', 1],
  ['midfielder', 2],
  ['forward', 3],
]);

const SPECIFIC_ORDER = new Map([
  ['goalkeeper', 0],
  ['sweeper_keeper', 1],

  ['right_back', 0],
  ['right_wing_back', 1],
  ['right_centre_back', 10],
  ['centre_back', 20],
  ['libero', 20],
  ['left_centre_back', 30],
  ['left_back', 40],
  ['left_wing_back', 41],

  ['holding_midfield', 0],
  ['defensive_midfield', 1],
  ['central_midfield', 10],
  ['right_central_midfield', 20],
  ['right_midfield', 21],
  ['left_central_midfield', 30],
  ['left_midfield', 31],
  ['attacking_midfield', 40],

  ['right_winger', 0],
  ['centre_forward', 10],
  ['second_striker', 11],
  ['mobile_forward', 12],
  ['target_forward', 13],
  ['left_winger', 20],
]);

const nameCollator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

const normalizeRole = (value) => String(value || '').trim().toLocaleLowerCase('es-ES');

const normalizeNaturalPosition = (value) => {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';
  if (FAMILY_ORDER.has(rawValue)) return rawValue;
  return mapExternalPositionToPlayerPositions(rawValue).primaryNaturalPosition || '';
};

const getNumericShirtNumber = (player = {}) => {
  const value = player.number ?? player.shirtNumber ?? player.shirt_number;
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export const getStatsIndividualPositionOrder = (player = {}) => {
  const model = getPlayerPositionModel(player);
  const specificPosition = model.primarySpecificPosition || '';
  const naturalPosition = normalizeNaturalPosition(model.primaryNaturalPosition)
    || getNaturalPositionForSpecific(specificPosition)
    || normalizeNaturalPosition(player.position);

  return {
    family: FAMILY_ORDER.get(naturalPosition) ?? 99,
    specific: SPECIFIC_ORDER.get(specificPosition) ?? 99,
  };
};

export const compareStatsIndividualPlayers = (left, right, getRole = () => '') => {
  const roleDifference = (ROLE_ORDER.get(normalizeRole(getRole(left))) ?? 99)
    - (ROLE_ORDER.get(normalizeRole(getRole(right))) ?? 99);
  if (roleDifference) return roleDifference;

  const leftPosition = getStatsIndividualPositionOrder(left);
  const rightPosition = getStatsIndividualPositionOrder(right);
  const familyDifference = leftPosition.family - rightPosition.family;
  if (familyDifference) return familyDifference;
  const specificDifference = leftPosition.specific - rightPosition.specific;
  if (specificDifference) return specificDifference;

  const leftNumber = getNumericShirtNumber(left);
  const rightNumber = getNumericShirtNumber(right);
  if (leftNumber !== null || rightNumber !== null) {
    if (leftNumber === null) return 1;
    if (rightNumber === null) return -1;
    if (leftNumber !== rightNumber) return leftNumber - rightNumber;
  }

  return nameCollator.compare(getPlayerDisplayName(left), getPlayerDisplayName(right));
};

export const sortStatsIndividualPlayers = (players = [], getRole = () => '') => (
  [...players].sort((left, right) => compareStatsIndividualPlayers(left, right, getRole))
);
