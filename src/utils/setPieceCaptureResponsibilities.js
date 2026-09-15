import {
  getSetPieceResponsibilitiesForPhase,
  inspectSetPieceResponsibilities,
} from './setPieceResponsibilities.js';

export const buildSetPieceCaptureResponsibilities = (
  responsibilities,
  phase,
  currentPlayerIdByPositionKey = null
) => {
  const reviews = inspectSetPieceResponsibilities(
    responsibilities,
    phase,
    currentPlayerIdByPositionKey
  );
  const valid = reviews.filter((item) => item.validForPhase && !item.needsReview);
  const visibleByPlayerId = Object.fromEntries(valid.map((item) => [item.playerId, item]));
  const usedIds = new Set(valid.map((item) => item.responsibilityId));
  return {
    visibleByPlayerId,
    legend: getSetPieceResponsibilitiesForPhase(phase)
      .filter((definition) => usedIds.has(definition.id))
      .sort((left, right) => left.order - right.order),
    hasNeedsReview: reviews.some((item) => item.needsReview),
  };
};
