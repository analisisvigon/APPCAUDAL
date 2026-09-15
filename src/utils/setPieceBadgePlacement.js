const getBounds = (viewport) => viewport || { x: 0, y: 0, width: 100, height: 100 };

export const getSetPieceCaptureMarkerAnchor = (position, viewport) => {
  if (!position) return { horizontal: 'center', vertical: 'center' };
  const bounds = getBounds(viewport);
  return {
    horizontal: position.x - bounds.x < 4 ? 'left'
      : bounds.x + bounds.width - position.x < 4 ? 'right' : 'center',
    vertical: position.y - bounds.y < 5 ? 'top'
      : bounds.y + bounds.height - position.y < 7 ? 'bottom' : 'center',
  };
};

export const getSetPieceBadgePlacement = (index, positions = [], viewport = null) => {
  const own = positions[index];
  if (!own) return 'below';
  const bounds = getBounds(viewport);
  const nearby = positions.filter((position, otherIndex) => (
    otherIndex !== index && position && Math.abs(position.y - own.y) < 3.5
  ));
  if (own.y >= 91 || (viewport && bounds.y + bounds.height - own.y < 8)) {
    const leftGap = Math.min(own.x - bounds.x, ...nearby.filter((position) => position.x < own.x).map((position) => own.x - position.x));
    const rightGap = Math.min(bounds.x + bounds.width - own.x, ...nearby.filter((position) => position.x > own.x).map((position) => position.x - own.x));
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
