export const getSetPieceBadgePlacement = (index, positions = []) => {
  const own = positions[index];
  if (!own) return 'below';
  const nearby = positions.filter((position, otherIndex) => (
    otherIndex !== index && position && Math.abs(position.y - own.y) < 3.5
  ));
  if (own.y >= 91) {
    const leftGap = Math.min(own.x, ...nearby.filter((position) => position.x < own.x).map((position) => own.x - position.x));
    const rightGap = Math.min(100 - own.x, ...nearby.filter((position) => position.x > own.x).map((position) => position.x - own.x));
    return rightGap >= leftGap ? 'right' : 'left';
  }
  const playerImmediatelyBelow = positions.some((position, otherIndex) => (
    otherIndex !== index
    && position
    && Math.abs(position.x - own.x) < 7
    && position.y > own.y
    && position.y - own.y < 10
  ));
  return playerImmediatelyBelow ? 'above' : 'below';
};
