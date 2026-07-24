const DEFAULT_SYSTEM_LINES = [4, 4, 2];
const MIN_HORIZONTAL_SEPARATION = 8;
const MIN_VERTICAL_SEPARATION = 5.5;
const FIELD_MARGIN = 5;

export const DEFENSIVE_BLOCK_LINE_HEIGHTS = Object.freeze({
  low_block: Object.freeze({
    rival: Object.freeze({ goalkeeper: 8, defensiveLine: 18, attackingLine: 40 }),
    caudal: Object.freeze({ goalkeeper: 85, defensiveLine: 56, attackingLine: 24 }),
  }),
  mid_block: Object.freeze({
    rival: Object.freeze({ goalkeeper: 16, defensiveLine: 32, attackingLine: 58 }),
    caudal: Object.freeze({ goalkeeper: 89, defensiveLine: 71, attackingLine: 39 }),
  }),
  high_block: Object.freeze({
    rival: Object.freeze({ goalkeeper: 28, defensiveLine: 49, attackingLine: 73 }),
    caudal: Object.freeze({ goalkeeper: 90, defensiveLine: 80, attackingLine: 45 }),
  }),
});

const clampCoordinate = (value) => Math.max(FIELD_MARGIN, Math.min(100 - FIELD_MARGIN, value));
const roundCoordinate = (value) => Math.round(value * 100) / 100;

const parseSystemLines = (system, outfieldPlayerCount) => {
  const parsed = String(system || '')
    .match(/\d+/g)
    ?.map(Number)
    .filter((lineSize) => Number.isInteger(lineSize) && lineSize > 0);
  const requested = parsed?.length ? parsed : DEFAULT_SYSTEM_LINES;
  if (requested.reduce((total, lineSize) => total + lineSize, 0) === outfieldPlayerCount) return requested;
  if (outfieldPlayerCount === 10) return DEFAULT_SYSTEM_LINES;
  return [outfieldPlayerCount];
};

const spreadLineHorizontally = (lineSize) => {
  if (lineSize <= 1) return [50];
  const sideMargin = lineSize >= 5 ? 12 : lineSize === 4 ? 17 : lineSize === 3 ? 25 : 39;
  const availableWidth = 100 - sideMargin * 2;
  return Array.from({ length: lineSize }, (_, index) => (
    roundCoordinate(sideMargin + (availableWidth * index) / (lineSize - 1))
  ));
};

const interpolateLineHeight = (lineIndex, lineCount, defensiveLine, attackingLine) => {
  if (lineCount <= 1) return roundCoordinate((defensiveLine + attackingLine) / 2);
  return roundCoordinate(defensiveLine + ((attackingLine - defensiveLine) * lineIndex) / (lineCount - 1));
};

const buildTeamPositions = ({ team, system, formationSlots, lineHeights }) => {
  const sortedSlots = [...formationSlots]
    .map((slot, fallbackIndex) => ({ ...slot, slot: Number.isInteger(Number(slot?.slot)) ? Number(slot.slot) : fallbackIndex }))
    .sort((left, right) => left.slot - right.slot);
  if (!sortedSlots.length) return {};

  const goalkeeper = sortedSlots[0];
  const outfieldSlots = sortedSlots.slice(1);
  const lineSizes = parseSystemLines(system, outfieldSlots.length);
  const positions = {
    [`${team}:${goalkeeper.slot}`]: { x: 50, y: lineHeights.goalkeeper },
  };
  let offset = 0;

  lineSizes.forEach((lineSize, lineIndex) => {
    const lineSlots = outfieldSlots
      .slice(offset, offset + lineSize)
      .sort((left, right) => Number(left.x ?? 50) - Number(right.x ?? 50));
    const horizontalPositions = spreadLineHorizontally(lineSlots.length);
    const y = interpolateLineHeight(
      lineIndex,
      lineSizes.length,
      lineHeights.defensiveLine,
      lineHeights.attackingLine
    );
    lineSlots.forEach((slot, slotIndex) => {
      positions[`${team}:${slot.slot}`] = { x: horizontalPositions[slotIndex], y };
    });
    offset += lineSize;
  });

  return positions;
};

const positionsOverlap = (left, right) => (
  Math.abs(left.x - right.x) < MIN_HORIZONTAL_SEPARATION
  && Math.abs(left.y - right.y) < MIN_VERTICAL_SEPARATION
);

export const preventInitialPositionOverlaps = (playerPositions) => {
  const resolved = {};
  Object.entries(playerPositions).forEach(([playerKey, sourcePosition], playerIndex) => {
    const original = {
      x: clampCoordinate(Number(sourcePosition.x)),
      y: clampCoordinate(Number(sourcePosition.y)),
    };
    const horizontalDirection = playerIndex % 2 === 0 ? -1 : 1;
    const horizontalOffsets = [0, 4, -4, 7, -7, 10, -10, 13, -13]
      .map((offset) => offset * horizontalDirection);
    let position = horizontalOffsets
      .map((offset) => ({ x: clampCoordinate(original.x + offset), y: original.y }))
      .find((candidate) => !Object.values(resolved).some((placed) => positionsOverlap(candidate, placed)));

    if (!position) {
      const fallbackOffsets = [-3, 3, -6, 6];
      position = fallbackOffsets
        .map((offset) => ({ x: original.x, y: clampCoordinate(original.y + offset) }))
        .find((candidate) => !Object.values(resolved).some((placed) => positionsOverlap(candidate, placed)));
    }

    resolved[playerKey] = {
      x: roundCoordinate(position?.x ?? original.x),
      y: roundCoordinate(position?.y ?? original.y),
    };
  });
  return resolved;
};

export const hasInitialPositionOverlap = (playerPositions) => {
  const positions = Object.values(playerPositions);
  return positions.some((position, index) => (
    positions.slice(index + 1).some((candidate) => positionsOverlap(position, candidate))
  ));
};

export const getDefensiveBlockInitialPositions = ({
  defensiveSituation,
  rivalSystem,
  caudalSystem,
  rivalFormationSlots = [],
  caudalFormationSlots = [],
}) => {
  const situation = Object.prototype.hasOwnProperty.call(DEFENSIVE_BLOCK_LINE_HEIGHTS, defensiveSituation)
    ? defensiveSituation
    : 'mid_block';
  const lineHeights = DEFENSIVE_BLOCK_LINE_HEIGHTS[situation];
  const rivalPositions = buildTeamPositions({
    team: 'rival',
    system: rivalSystem,
    formationSlots: rivalFormationSlots,
    lineHeights: lineHeights.rival,
  });
  const caudalPositions = buildTeamPositions({
    team: 'caudal',
    system: caudalSystem,
    formationSlots: caudalFormationSlots,
    lineHeights: lineHeights.caudal,
  });
  return preventInitialPositionOverlaps({
    ...rivalPositions,
    ...caudalPositions,
  });
};

export const getLowBlockPositions = (options) => getDefensiveBlockInitialPositions({
  ...options,
  defensiveSituation: 'low_block',
});

export const getMidBlockPositions = (options) => getDefensiveBlockInitialPositions({
  ...options,
  defensiveSituation: 'mid_block',
});

export const getHighBlockPositions = (options) => getDefensiveBlockInitialPositions({
  ...options,
  defensiveSituation: 'high_block',
});
