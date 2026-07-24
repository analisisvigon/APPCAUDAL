import { preventInitialPositionOverlaps } from './defensiveBlockPositions.js';

const DEFAULT_SYSTEM_LINES = [4, 4, 2];

export const OFFENSIVE_PHASE_LINE_HEIGHTS = Object.freeze({
  build_up: Object.freeze({
    rival: Object.freeze({ goalkeeper: 8, defensiveLine: 20, attackingLine: 49 }),
    caudal: Object.freeze({ goalkeeper: 91, defensiveLine: 73, attackingLine: 28 }),
  }),
  creation: Object.freeze({
    rival: Object.freeze({ goalkeeper: 16, defensiveLine: 36, attackingLine: 67 }),
    caudal: Object.freeze({ goalkeeper: 91, defensiveLine: 76, attackingLine: 43 }),
  }),
  finishing: Object.freeze({
    rival: Object.freeze({ goalkeeper: 30, defensiveLine: 52, attackingLine: 85 }),
    caudal: Object.freeze({ goalkeeper: 92, defensiveLine: 82, attackingLine: 53 }),
  }),
});

export const OFFENSIVE_DIRECT_BUILD_UP_LINE_HEIGHTS = Object.freeze({
  rival: Object.freeze({ goalkeeper: 13, defensiveLine: 31, attackingLine: 59 }),
  caudal: Object.freeze({ goalkeeper: 91, defensiveLine: 74, attackingLine: 50 }),
});

const parseSystemLines = (system, outfieldPlayerCount) => {
  const parsed = String(system || '').match(/\d+/g)?.map(Number).filter((lineSize) => lineSize > 0);
  const requested = parsed?.length ? parsed : DEFAULT_SYSTEM_LINES;
  if (requested.reduce((total, lineSize) => total + lineSize, 0) === outfieldPlayerCount) return requested;
  return outfieldPlayerCount === 10 ? DEFAULT_SYSTEM_LINES : [outfieldPlayerCount];
};

const spreadLineHorizontally = (lineSize) => {
  if (lineSize <= 1) return [50];
  const margin = lineSize >= 5 ? 12 : lineSize === 4 ? 17 : lineSize === 3 ? 25 : 39;
  return Array.from({ length: lineSize }, (_, index) => (
    Math.round((margin + ((100 - margin * 2) * index) / (lineSize - 1)) * 100) / 100
  ));
};

const interpolateHeight = (lineIndex, lineCount, defensiveLine, attackingLine) => {
  if (lineCount <= 1) return (defensiveLine + attackingLine) / 2;
  return Math.round((defensiveLine + ((attackingLine - defensiveLine) * lineIndex) / (lineCount - 1)) * 100) / 100;
};

const buildTeamPositions = ({ team, system, formationSlots, heights }) => {
  const sortedSlots = [...formationSlots]
    .map((slot, index) => ({ ...slot, slot: Number.isInteger(Number(slot?.slot)) ? Number(slot.slot) : index }))
    .sort((left, right) => left.slot - right.slot);
  if (!sortedSlots.length) return {};
  const positions = { [`${team}:${sortedSlots[0].slot}`]: { x: 50, y: heights.goalkeeper } };
  const outfieldSlots = sortedSlots.slice(1);
  const lineSizes = parseSystemLines(system, outfieldSlots.length);
  let offset = 0;

  lineSizes.forEach((lineSize, lineIndex) => {
    const lineSlots = outfieldSlots
      .slice(offset, offset + lineSize)
      .sort((left, right) => Number(left.x ?? 50) - Number(right.x ?? 50));
    const horizontalPositions = spreadLineHorizontally(lineSlots.length);
    const y = interpolateHeight(lineIndex, lineSizes.length, heights.defensiveLine, heights.attackingLine);
    lineSlots.forEach((slot, playerIndex) => {
      positions[`${team}:${slot.slot}`] = { x: horizontalPositions[playerIndex], y };
    });
    offset += lineSize;
  });
  return positions;
};

const getOffensiveSituationPositions = ({
  offensiveSituation,
  rivalSystem,
  caudalSystem,
  rivalFormationSlots = [],
  caudalFormationSlots = [],
}) => {
  const heights = OFFENSIVE_PHASE_LINE_HEIGHTS[offensiveSituation];
  if (!heights) return {};
  return preventInitialPositionOverlaps({
    ...buildTeamPositions({
      team: 'rival',
      system: rivalSystem,
      formationSlots: rivalFormationSlots,
      heights: heights.rival,
    }),
    ...buildTeamPositions({
      team: 'caudal',
      system: caudalSystem,
      formationSlots: caudalFormationSlots,
      heights: heights.caudal,
    }),
  });
};

export const getOffensiveBuildUpPositions = (options) => getOffensiveSituationPositions({
  ...options,
  offensiveSituation: 'build_up',
});

export const getOffensiveDirectBuildUpPositions = ({
  rivalSystem,
  caudalSystem,
  rivalFormationSlots = [],
  caudalFormationSlots = [],
}) => {
  const rivalPositions = buildTeamPositions({
    team: 'rival',
    system: rivalSystem,
    formationSlots: rivalFormationSlots,
    heights: OFFENSIVE_DIRECT_BUILD_UP_LINE_HEIGHTS.rival,
  });
  rivalFormationSlots.forEach((slot) => {
    const role = String(slot?.role || '').toLowerCase();
    if (!/lateral|carrilero/.test(role)) return;
    const key = `rival:${slot.slot}`;
    if (!rivalPositions[key]) return;
    rivalPositions[key] = {
      ...rivalPositions[key],
      y: Math.min(95, rivalPositions[key].y + 6),
    };
  });
  const caudalPositions = buildTeamPositions({
    team: 'caudal',
    system: caudalSystem,
    formationSlots: caudalFormationSlots,
    heights: OFFENSIVE_DIRECT_BUILD_UP_LINE_HEIGHTS.caudal,
  });
  return preventInitialPositionOverlaps({
    ...rivalPositions,
    ...caudalPositions,
  });
};

export const getOffensiveCreationPositions = (options) => getOffensiveSituationPositions({
  ...options,
  offensiveSituation: 'creation',
});

export const getOffensiveFinishingPositions = (options) => getOffensiveSituationPositions({
  ...options,
  offensiveSituation: 'finishing',
});
