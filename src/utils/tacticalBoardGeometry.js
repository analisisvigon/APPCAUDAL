import { getSetPieceCurveControlPoint } from './setPieceEditorInteractions.js';

const clampCoordinate = (value) => Math.max(1, Math.min(99, Number(value)));

export const normalizeTacticalBoardPoint = (value) => {
  const x = Number(value?.x);
  const y = Number(value?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x: Math.round(clampCoordinate(x) * 100) / 100,
    y: Math.round(clampCoordinate(y) * 100) / 100,
  };
};

export const normalizeTacticalBoardArrow = (arrow, { requireId = true } = {}) => {
  if (!arrow || !['pass', 'movement'].includes(arrow.type)) return null;
  if (requireId && !arrow.id) return null;
  const start = normalizeTacticalBoardPoint(arrow.start);
  const end = normalizeTacticalBoardPoint(arrow.end);
  if (!start || !end) return null;
  const controlPoint = normalizeTacticalBoardPoint(arrow.controlPoint);
  return {
    ...(arrow.id ? { id: String(arrow.id) } : {}),
    type: arrow.type,
    start,
    end,
    ...(controlPoint ? { controlPoint } : {}),
  };
};

export const normalizeTacticalBoardArrows = (arrows, options) => (
  (Array.isArray(arrows) ? arrows : [])
    .map((arrow) => normalizeTacticalBoardArrow(arrow, options))
    .filter(Boolean)
);

export const getTacticalBoardCurveControlPoint = (arrow = {}) => {
  const start = normalizeTacticalBoardPoint(arrow.start) || { x: 50, y: 50 };
  const end = normalizeTacticalBoardPoint(arrow.end) || start;
  const controlPoint = getSetPieceCurveControlPoint({
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    controlX: arrow.controlPoint?.x,
    controlY: arrow.controlPoint?.y,
  });
  return normalizeTacticalBoardPoint(controlPoint) || { ...start };
};

export const convertTacticalBoardArrowToCurve = (arrow = {}) => ({
  ...arrow,
  controlPoint: getTacticalBoardCurveControlPoint(arrow),
});

export const straightenTacticalBoardArrow = (arrow = {}) => {
  const { controlPoint: _controlPoint, ...straightArrow } = arrow;
  return straightArrow;
};

export const updateTacticalBoardArrowPoint = (arrow = {}, handle, point) => {
  const normalizedPoint = normalizeTacticalBoardPoint(point);
  if (!normalizedPoint || !['start', 'controlPoint', 'end'].includes(handle)) return { ...arrow };
  return { ...arrow, [handle]: normalizedPoint };
};

export const duplicateTacticalBoardArrow = (arrow = {}, id, offset = 4) => {
  const shift = (point) => normalizeTacticalBoardPoint({
    x: Number(point?.x) + offset,
    y: Number(point?.y) + offset,
  });
  return {
    ...arrow,
    id: String(id),
    start: shift(arrow.start),
    end: shift(arrow.end),
    ...(arrow.controlPoint ? { controlPoint: shift(arrow.controlPoint) } : {}),
  };
};

export const cloneTacticalBoardArrow = (arrow = {}, id = arrow.id) => ({
  ...arrow,
  id: String(id),
  start: { ...arrow.start },
  end: { ...arrow.end },
  ...(arrow.controlPoint ? { controlPoint: { ...arrow.controlPoint } } : {}),
});

export const getTacticalBoardArrowPath = (arrow = {}) => {
  const start = normalizeTacticalBoardPoint(arrow.start) || { x: 50, y: 50 };
  const end = normalizeTacticalBoardPoint(arrow.end) || start;
  if (!arrow.controlPoint) return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  const controlPoint = getTacticalBoardCurveControlPoint(arrow);
  return `M ${start.x} ${start.y} Q ${controlPoint.x} ${controlPoint.y} ${end.x} ${end.y}`;
};
