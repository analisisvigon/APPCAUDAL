import {
  getHighBlockPositions,
  preventInitialPositionOverlaps,
} from './defensiveBlockPositions.js';

const DEFAULT_SYSTEM_LINES = [4, 4, 2];

export const TRANSITION_PRESET_HEIGHTS = Object.freeze({
  offensive_transition: Object.freeze({
    defensive_half: Object.freeze({
      rival: Object.freeze({ goalkeeper: 9, defensiveLine: 21, attackingLine: 54 }),
      caudal: Object.freeze({ goalkeeper: 91, defensiveLine: 68, attackingLine: 32 }),
    }),
    attacking_half: Object.freeze({
      rival: Object.freeze({ goalkeeper: 28, defensiveLine: 51, attackingLine: 82 }),
      caudal: Object.freeze({ goalkeeper: 92, defensiveLine: 79, attackingLine: 61 }),
    }),
  }),
  defensive_transition: Object.freeze({
    defensive_half: Object.freeze({
      rival: Object.freeze({ goalkeeper: 9, defensiveLine: 22, attackingLine: 49 }),
      caudal: Object.freeze({ goalkeeper: 86, defensiveLine: 58, attackingLine: 27 }),
    }),
    attacking_half: Object.freeze({
      rival: Object.freeze({ goalkeeper: 23, defensiveLine: 44, attackingLine: 83 }),
      caudal: Object.freeze({ goalkeeper: 92, defensiveLine: 78, attackingLine: 56 }),
    }),
  }),
});

const parseSystemLines = (system, outfieldPlayerCount) => {
  const parsed = String(system || '').match(/\d+/g)?.map(Number).filter((value) => value > 0);
  const requested = parsed?.length ? parsed : DEFAULT_SYSTEM_LINES;
  if (requested.reduce((total, value) => total + value, 0) === outfieldPlayerCount) return requested;
  return outfieldPlayerCount === 10 ? DEFAULT_SYSTEM_LINES : [outfieldPlayerCount];
};

const spreadLine = (lineSize, compactness = 1) => {
  if (lineSize <= 1) return [50];
  const margin = lineSize >= 5 ? 12 : lineSize === 4 ? 17 : lineSize === 3 ? 25 : 39;
  return Array.from({ length: lineSize }, (_, index) => {
    const base = margin + ((100 - margin * 2) * index) / (lineSize - 1);
    return Math.round((50 + (base - 50) * compactness) * 100) / 100;
  });
};

const lineHeight = (lineIndex, lineCount, defensiveLine, attackingLine) => {
  if (lineCount <= 1) return (defensiveLine + attackingLine) / 2;
  return Math.round((defensiveLine + ((attackingLine - defensiveLine) * lineIndex) / (lineCount - 1)) * 100) / 100;
};

const getRoleTacticalSide = (role) => {
  const normalizedRole = String(role || '').toLowerCase();
  if (normalizedRole.includes('izquier') || normalizedRole.includes('left')) return 'left';
  if (normalizedRole.includes('derech') || normalizedRole.includes('right')) return 'right';
  return '';
};

const normalizeTeamLateralities = (positions, team, formationSlots) => {
  const normalized = { ...positions };
  formationSlots.forEach((slot, fallbackSlot) => {
    const slotId = Number.isInteger(Number(slot?.slot)) ? Number(slot.slot) : fallbackSlot;
    const key = `${team}:${slotId}`;
    const position = normalized[key];
    const tacticalSide = getRoleTacticalSide(slot?.role);
    if (!position || !tacticalSide) return;
    const distanceFromCentre = Math.abs(Number(position.x) - 50);
    normalized[key] = {
      ...position,
      x: tacticalSide === 'left'
        ? 50 - distanceFromCentre
        : 50 + distanceFromCentre,
    };
  });
  return normalized;
};

const getAttackingHalfTransitionPositions = ({
  rivalSystem,
  caudalSystem,
  rivalFormationSlots,
  caudalFormationSlots,
}) => {
  const highBlockPositions = getHighBlockPositions({
    rivalSystem,
    caudalSystem,
    rivalFormationSlots,
    caudalFormationSlots,
  });
  const advancedPositions = Object.fromEntries(Object.entries(highBlockPositions).map(([key, position]) => {
    const [team, slot] = key.split(':');
    if (team === 'rival') {
      return [
        key,
        {
          ...position,
          y: slot === '0' ? 8 : Math.max(56, Math.min(86, position.y + 11)),
        },
      ];
    }
    return [
      key,
      {
        ...position,
        y: slot === '0'
          ? 92
          : Math.max(60, Math.min(82, 60 + ((position.y - 45) * 22) / 35)),
      },
    ];
  }));
  return preventInitialPositionOverlaps(
    normalizeTeamLateralities(advancedPositions, 'rival', rivalFormationSlots)
  );
};

const buildTeamPositions = ({ team, system, formationSlots, heights, compactness }) => {
  const slots = [...formationSlots]
    .map((slot, fallbackSlot) => ({
      ...slot,
      slot: Number.isInteger(Number(slot?.slot)) ? Number(slot.slot) : fallbackSlot,
    }))
    .sort((left, right) => left.slot - right.slot);
  if (!slots.length) return {};

  const positions = {
    [`${team}:${slots[0].slot}`]: { x: 50, y: heights.goalkeeper },
  };
  const outfield = slots.slice(1);
  const lines = parseSystemLines(system, outfield.length);
  let offset = 0;
  lines.forEach((size, index) => {
    const lineSlots = outfield
      .slice(offset, offset + size)
      .sort((left, right) => Number(left.x ?? 50) - Number(right.x ?? 50));
    const xValues = spreadLine(lineSlots.length, compactness);
    const y = lineHeight(index, lines.length, heights.defensiveLine, heights.attackingLine);
    lineSlots.forEach((slot, slotIndex) => {
      positions[`${team}:${slot.slot}`] = { x: xValues[slotIndex], y };
    });
    offset += size;
  });
  return positions;
};

export const getTransitionInitialPositions = ({
  transitionType,
  fieldZone,
  rivalSystem,
  caudalSystem,
  rivalFormationSlots = [],
  caudalFormationSlots = [],
}) => {
  if (fieldZone === 'attacking_half') {
    return getAttackingHalfTransitionPositions({
      rivalSystem,
      caudalSystem,
      rivalFormationSlots,
      caudalFormationSlots,
    });
  }
  const safeType = Object.hasOwn(TRANSITION_PRESET_HEIGHTS, transitionType)
    ? transitionType
    : 'offensive_transition';
  const safeZone = Object.hasOwn(TRANSITION_PRESET_HEIGHTS[safeType], fieldZone)
    ? fieldZone
    : 'defensive_half';
  const heights = TRANSITION_PRESET_HEIGHTS[safeType][safeZone];
  const compactness = safeZone === 'attacking_half' ? 0.78 : 1;
  return preventInitialPositionOverlaps({
    ...buildTeamPositions({
      team: 'rival',
      system: rivalSystem,
      formationSlots: rivalFormationSlots,
      heights: heights.rival,
      compactness,
    }),
    ...buildTeamPositions({
      team: 'caudal',
      system: caudalSystem,
      formationSlots: caudalFormationSlots,
      heights: heights.caudal,
      compactness,
    }),
  });
};
