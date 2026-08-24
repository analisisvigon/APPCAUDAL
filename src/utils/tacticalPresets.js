import { getDefensiveBlockInitialPositions } from './defensiveBlockPositions.js';
import { getOffensiveInitialPositions } from './offensivePhasePositions.js';
import { getSetPieceInitialPositions } from './setPiecePositions.js';
import { getTransitionInitialPositions } from './transitionPhasePositions.js';

const SUPPORTED_PHASES = new Set(['defensive', 'offensive', 'transition', 'set_piece']);

/**
 * Single entry point for the automatic 22-player tactical-board layout.
 * Saved play coordinates are deliberately resolved by the caller first; this
 * function only returns the normalized preset for the requested context.
 */
export const getTacticalPreset = ({
  phase,
  situation,
  playStyle = 'combinative',
  transitionType = 'offensive_transition',
  fieldZone = 'defensive_half',
  setPieceType = 'offensive_set_piece',
  setPieceAction = 'corner',
  ballStartPosition,
  rivalSystem,
  caudalSystem,
  rivalFormationSlots = [],
  caudalFormationSlots = [],
} = {}) => {
  if (!SUPPORTED_PHASES.has(phase)) return {};

  const shared = {
    rivalSystem,
    caudalSystem,
    rivalFormationSlots,
    caudalFormationSlots,
  };

  if (phase === 'defensive') {
    return getDefensiveBlockInitialPositions({
      ...shared,
      defensiveSituation: situation,
    });
  }
  if (phase === 'offensive') {
    return getOffensiveInitialPositions({
      ...shared,
      offensiveSituation: situation,
      playStyle,
    });
  }
  if (phase === 'transition') {
    return getTransitionInitialPositions({
      ...shared,
      transitionType,
      fieldZone,
    });
  }
  return getSetPieceInitialPositions({
    ...shared,
    setPieceType,
    setPieceAction,
    ballStartPosition,
  });
};

