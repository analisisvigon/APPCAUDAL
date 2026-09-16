import {
  getSetPieceResponsibilitiesForPhase,
  inspectSetPieceResponsibilities,
} from './setPieceResponsibilities.js';

export const buildSetPieceCaptureResponsibilities = (
  responsibilities,
  phase,
  currentPlayerIdByPositionKey = null,
  playerNameById = {}
) => {
  const reviews = inspectSetPieceResponsibilities(
    responsibilities,
    phase,
    currentPlayerIdByPositionKey
  );
  const valid = reviews.filter((item) => item.validForPhase && !item.needsReview);
  const visibleByPlayerId = Object.fromEntries(valid.map((item) => [item.playerId, item]));
  const usedIds = new Set(valid.map((item) => item.responsibilityId));
  const namesByResponsibilityId = valid
    .slice()
    .sort((left, right) => {
      const leftSlot = Number.parseInt(left.positionKey.split(':')[1], 10);
      const rightSlot = Number.parseInt(right.positionKey.split(':')[1], 10);
      return leftSlot - rightSlot || left.playerId.localeCompare(right.playerId);
    })
    .reduce((names, item) => {
      const playerName = String(playerNameById?.[item.playerId] || '').trim();
      if (!playerName) return names;
      names[item.responsibilityId] = [...(names[item.responsibilityId] || []), playerName];
      return names;
    }, {});
  return {
    visibleByPlayerId,
    legend: getSetPieceResponsibilitiesForPhase(phase)
      .filter((definition) => usedIds.has(definition.id))
      .sort((left, right) => left.order - right.order)
      .map((definition) => ({
        ...definition,
        playerNames: namesByResponsibilityId[definition.id] || [],
      })),
    hasNeedsReview: reviews.some((item) => item.needsReview),
  };
};
