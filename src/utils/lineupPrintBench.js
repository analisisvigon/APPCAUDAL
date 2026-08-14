import { getPlayerPositionPresentation } from '../constants/playerPositions.js';
import { getPlayerDisplayName } from './playerDisplayName.js';

const getBenchNumber = (player) => {
  const value = player?.number ?? player?.dorsal;
  const parsed = Number.parseInt(String(value ?? '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
};

export const buildLineupPrintBenchRows = (bench = []) => [...bench]
  .sort((left, right) => getBenchNumber(left) - getBenchNumber(right))
  .map((player) => ({
    key: player?.id || player?.name,
    player,
    number: player?.number || player?.dorsal || '-',
    name: getPlayerDisplayName(player),
    isGoalkeeper: getPlayerPositionPresentation(player).naturalKey === 'goalkeeper',
  }));
