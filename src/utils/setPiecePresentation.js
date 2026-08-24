const FIELD_ASPECT_RATIO = 7 / 8.4;

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const round = (value) => Math.round(value * 100) / 100;

const normalizePoint = (point) => {
  const x = Number(point?.x);
  const y = Number(point?.y);
  return Number.isFinite(x) && Number.isFinite(y)
    ? { x: clamp(x, 0, 100), y: clamp(y, 0, 100) }
    : null;
};

const getBaseViewport = (setPieceAction, ball) => {
  const attacksBottomGoal = ball.y >= 50;
  if (setPieceAction === 'corner') {
    return { x: 0, y: attacksBottomGoal ? 38 : 0, width: 100, height: 62 };
  }
  if (setPieceAction === 'wide_free_kick') {
    return { x: 0, y: attacksBottomGoal ? 22 : 0, width: 100, height: 78 };
  }
  if (setPieceAction === 'central_free_kick') {
    return { x: 14, y: attacksBottomGoal ? 28 : 0, width: 72, height: 72 };
  }
  if (setPieceAction === 'throw_in') {
    const width = 76;
    const height = 72;
    return {
      x: ball.x <= 50 ? 0 : 100 - width,
      y: clamp(ball.y - (height / 2), 0, 100 - height),
      width,
      height,
    };
  }
  return { x: 0, y: 0, width: 100, height: 100 };
};

const isNearViewport = (point, viewport, margin = 12) => (
  point.x >= viewport.x - margin
  && point.x <= viewport.x + viewport.width + margin
  && point.y >= viewport.y - margin
  && point.y <= viewport.y + viewport.height + margin
);

export const buildSetPiecePresentationViewport = ({
  setPieceAction = 'corner',
  ballStartPosition,
  playerPositions = {},
  arrows = [],
  zones = [],
} = {}) => {
  const ball = normalizePoint(ballStartPosition) || { x: 5, y: 95 };
  const base = getBaseViewport(setPieceAction, ball);
  const playerPoints = Object.values(playerPositions || {})
    .map(normalizePoint)
    .filter(Boolean)
    .filter((point) => isNearViewport(point, base));
  const arrowPoints = (Array.isArray(arrows) ? arrows : []).flatMap((arrow) => (
    [arrow?.start, arrow?.end, arrow?.controlPoint].map(normalizePoint).filter(Boolean)
  ));
  const zonePoints = (Array.isArray(zones) ? zones : [])
    .filter((zone) => zone?.active !== false)
    .map(normalizePoint)
    .filter(Boolean)
    .filter((point) => isNearViewport(point, base));
  const points = [
    { x: base.x, y: base.y },
    { x: base.x + base.width, y: base.y + base.height },
    ball,
    ...playerPoints,
    ...arrowPoints,
    ...zonePoints,
  ];
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const safety = 4;
  const x = clamp(minX - safety, 0, 100);
  const y = clamp(minY - safety, 0, 100);
  const right = clamp(maxX + safety, 0, 100);
  const bottom = clamp(maxY + safety, 0, 100);

  return {
    x: round(x),
    y: round(y),
    width: round(Math.max(1, right - x)),
    height: round(Math.max(1, bottom - y)),
  };
};

export const buildSetPiecePresentationCrop = (viewport) => {
  const normalized = viewport || { x: 0, y: 0, width: 100, height: 100 };
  return {
    aspectRatio: round(FIELD_ASPECT_RATIO * (normalized.width / normalized.height)),
    hostStyle: {
      width: `${round(10000 / normalized.width)}%`,
      left: `${round((-100 * normalized.x) / normalized.width)}%`,
      top: `${round((-100 * normalized.y) / normalized.height)}%`,
    },
  };
};

export const getSetPiecePresentationName = (playName) => {
  const name = String(playName || '').trim();
  return /^jugada(?:\s+\d+)?(?:\s*\u00b7\s*copia)?$/i.test(name) ? '' : name;
};
