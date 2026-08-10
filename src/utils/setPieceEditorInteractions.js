const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="searchbox"], [role="combobox"], [role="spinbutton"]';

export const isEditableInteractionTarget = (target) => {
  if (!target || typeof target !== 'object') return false;
  if (target.isContentEditable) return true;

  const tagName = String(target.tagName || '').toLowerCase();
  if (['input', 'textarea', 'select'].includes(tagName)) return true;

  return typeof target.closest === 'function' && Boolean(target.closest(EDITABLE_SELECTOR));
};

export const shouldIgnoreSetPieceShortcut = (event = {}) => (
  Boolean(event.defaultPrevented) || isEditableInteractionTarget(event.target)
);

export const getSetPieceHistoryAction = (event = {}) => {
  if (shouldIgnoreSetPieceShortcut(event)) return null;
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;

  const key = String(event.key || '').toLowerCase();
  if (key === 'y' && event.ctrlKey && !event.shiftKey) return 'redo';
  if (key !== 'z') return null;
  return event.shiftKey ? 'redo' : 'undo';
};

export const getSetPieceDeleteAction = (event = {}, hasSelection = false) => {
  if (!hasSelection || shouldIgnoreSetPieceShortcut(event)) return null;
  return ['Delete', 'Backspace'].includes(event.key) ? 'delete' : null;
};

export const getSetPieceArrowStyle = (element = {}) => {
  if (element.type === 'curved_arrow' && element.dashed) return 'curved_dashed_arrow';
  return element.type || 'arrow';
};

export const applySetPieceArrowStyle = (element = {}, style = 'arrow') => {
  const curved = ['curved_arrow', 'curved_dashed_arrow'].includes(style);
  const next = {
    ...element,
    type: curved ? 'curved_arrow' : style,
    dashed: style === 'dashed_arrow' || style === 'curved_dashed_arrow',
  };
  return curved ? ensureSetPieceCurveGeometry(next) : next;
};

export const getSetPieceElementInteraction = ({ readOnly = false, locked = false } = {}) => ({
  selectable: !readOnly,
  draggable: !readOnly && !locked,
});

const finiteCoordinate = (value, fallback = 0) => (
  Number.isFinite(Number(value)) ? Number(value) : fallback
);

export const getSetPieceCurveControlPoint = (element = {}) => {
  const x1 = finiteCoordinate(element.x1);
  const y1 = finiteCoordinate(element.y1);
  const x2 = finiteCoordinate(element.x2);
  const y2 = finiteCoordinate(element.y2);
  return {
    x: finiteCoordinate(element.controlX, (x1 + x2) / 2),
    y: finiteCoordinate(
      element.controlY,
      (y1 + y2) / 2 + finiteCoordinate(element.curvature, -12),
    ),
  };
};

export const ensureSetPieceCurveGeometry = (element = {}) => {
  if (element.type !== 'curved_arrow') return { ...element };
  const controlPoint = getSetPieceCurveControlPoint(element);
  return { ...element, controlX: controlPoint.x, controlY: controlPoint.y };
};

export const moveSetPieceCurveControlPoint = (element = {}, point = {}) => {
  const current = getSetPieceCurveControlPoint(element);
  return {
    ...ensureSetPieceCurveGeometry(element),
    controlX: finiteCoordinate(point.x, current.x),
    controlY: finiteCoordinate(point.y, current.y),
  };
};

export const translateSetPieceElement = (element = {}, dx = 0, dy = 0) => {
  const offsetX = finiteCoordinate(dx);
  const offsetY = finiteCoordinate(dy);
  if (!['arrow', 'dashed_arrow', 'curved_arrow', 'double_arrow'].includes(element.type)) {
    return {
      ...element,
      x: finiteCoordinate(element.x) + offsetX,
      y: finiteCoordinate(element.y) + offsetY,
    };
  }
  const translated = {
    ...element,
    x1: finiteCoordinate(element.x1) + offsetX,
    y1: finiteCoordinate(element.y1) + offsetY,
    x2: finiteCoordinate(element.x2) + offsetX,
    y2: finiteCoordinate(element.y2) + offsetY,
  };
  if (element.type !== 'curved_arrow') return translated;
  const controlPoint = getSetPieceCurveControlPoint(element);
  return {
    ...translated,
    controlX: controlPoint.x + offsetX,
    controlY: controlPoint.y + offsetY,
  };
};
