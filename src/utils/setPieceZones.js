const clampCoordinate = (value) => Math.max(1, Math.min(99, Number(value)));

export const normalizeBallStartPosition = (position, fallback = { x: 5, y: 95 }) => {
  const x = Number(position?.x);
  const y = Number(position?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { ...fallback };
  return {
    x: Math.round(clampCoordinate(x) * 100) / 100,
    y: Math.round(clampCoordinate(y) * 100) / 100,
  };
};

const mirrorY = (y, setPieceType) => (
  setPieceType === 'defensive_set_piece' ? 100 - y : y
);

const createPoint = (id, label, x, y, setPieceType) => ({
  id,
  label,
  position: normalizeBallStartPosition({ x, y: mirrorY(y, setPieceType) }),
});

export const getSetPieceZonePoints = (setPieceType, setPieceAction) => {
  if (setPieceAction === 'corner') {
    return [
      createPoint('corner-left', 'Córner izquierdo', 5, 95, setPieceType),
      createPoint('corner-right', 'Córner derecho', 95, 95, setPieceType),
    ];
  }
  if (setPieceAction === 'wide_free_kick') {
    return [58, 66, 74, 82, 89].flatMap((y, index) => [
      createPoint(`wide-left-${index + 1}`, `Falta lateral izquierda ${index + 1}`, 7, y, setPieceType),
      createPoint(`wide-right-${index + 1}`, `Falta lateral derecha ${index + 1}`, 93, y, setPieceType),
    ]);
  }
  if (setPieceAction === 'central_free_kick') {
    return [
      createPoint('central-left', 'Frontal izquierda', 38, 78, setPieceType),
      createPoint('central-centre', 'Frontal centrada', 50, 82, setPieceType),
      createPoint('central-right', 'Frontal derecha', 62, 78, setPieceType),
      createPoint('central-far', 'Frontal lejana', 50, 70, setPieceType),
    ];
  }
  return [16, 33, 50, 67, 84].flatMap((y, index) => [
    createPoint(`throw-left-${index + 1}`, `Saque de banda izquierdo ${index + 1}`, 5, y, setPieceType),
    createPoint(`throw-right-${index + 1}`, `Saque de banda derecho ${index + 1}`, 95, y, setPieceType),
  ]);
};

export const getDefaultSetPieceBallPosition = (setPieceType, setPieceAction) => (
  getSetPieceZonePoints(setPieceType, setPieceAction)[0]?.position || { x: 5, y: 95 }
);

export const getBallPositionKey = (position) => {
  const normalized = normalizeBallStartPosition(position);
  return `${normalized.x}:${normalized.y}`;
};
