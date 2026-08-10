import { getPlayerPositionPresentation } from '../constants/playerPositions.js';

export const STATS_CALLUP_POSITION_GROUPS = [
  { key: 'POR', label: 'Porteros' },
  { key: 'DEF', label: 'Defensas' },
  { key: 'MC', label: 'Centrocampistas' },
  { key: 'ATA', label: 'Atacantes' },
  { key: 'OTROS', label: 'Otros' },
];

const POSITION_GROUP_BY_NATURAL_KEY = {
  goalkeeper: 'POR',
  defender: 'DEF',
  midfielder: 'MC',
  forward: 'ATA',
};

export const getStatsCallupPositionGroup = (player = {}) => {
  const presentation = getPlayerPositionPresentation(player);
  return POSITION_GROUP_BY_NATURAL_KEY[presentation.naturalKey] || 'OTROS';
};

export const groupStatsCallupRowsByPosition = (rows = []) => {
  const groupedRows = new Map(STATS_CALLUP_POSITION_GROUPS.map(({ key }) => [key, []]));
  rows.forEach((row) => {
    const group = getStatsCallupPositionGroup(row?.player);
    groupedRows.get(group).push(row);
  });
  return STATS_CALLUP_POSITION_GROUPS
    .map((group) => ({ ...group, rows: groupedRows.get(group.key) }))
    .filter((group) => group.rows.length > 0);
};

export const calculateStatsCallupCounts = (rows = []) => {
  const starters = rows.filter((row) => row?.status === 'Titular').length;
  const substitutes = rows.filter((row) => row?.status === 'Suplente').length;
  const outside = rows.filter((row) => row?.status === 'Fuera').length;
  return {
    called: starters + substitutes,
    starters,
    substitutes,
    outside,
    total: starters + substitutes + outside,
  };
};

export const getOutsideStatsCallupPlayerNames = (rows = []) => Array.from(new Set(
  rows
    .filter((row) => row?.status === 'Fuera' && row?.player?.name)
    .map((row) => row.player.name)
));

export const toggleStatsCallupGroupState = (state = {}, key = '') => ({
  ...state,
  [key]: !state[key],
});

export const addAllOutsideStatsCallups = (rows = []) => rows.map((row) => (
  row?.status === 'Fuera' ? { ...row, status: 'Suplente' } : row
));
