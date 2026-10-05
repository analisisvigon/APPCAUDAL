import { normalizeSetPieceElementDimensions } from './setPieceElementDimensions.js';
import { clampDiagramCoordinate } from './diagramScene.js';
import {
  applySetPieceArrowStyle,
  ensureSetPieceCurveGeometry,
  translateSetPieceElement,
} from './setPieceEditorInteractions.js';

const ARROW_TYPES = new Set(['arrow', 'dashed_arrow', 'curved_arrow', 'double_arrow', 'curved_dashed_arrow']);

export const cloneDiagramElements = (elements = []) => JSON.parse(JSON.stringify(elements));

export const createDiagramElementId = () => (
  globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
);

export const createDiagramElement = (type, createId = createDiagramElementId) => {
  const id = createId();
  if (type === 'ball') return { id, type, x: 8, y: 8 };
  if (ARROW_TYPES.has(type)) {
    return applySetPieceArrowStyle({ id, type: 'arrow', x1: 20, y1: 46, x2: 44, y2: 26 }, type);
  }
  if (type === 'zone') return { id, type, x: 34, y: 18, width: 22, height: 12, label: 'Zona' };
  if (type === 'text') return { id, type, x: 42, y: 40, label: 'Texto' };
  if (type === 'block') return { id, type, x: 42, y: 34, width: 5, label: 'BLOQUEO' };
  if (type === 'text_box') return { id, type, x: 58, y: 10, width: 32, height: 24, label: 'TEXTO' };
  if (type === 'opponent') return { id, type, x: 50, y: 17, label: 'R' };
  return { id, type: 'player', x: 50, y: 35, label: '1', player_id: '', roles: [], sequenceOrder: null };
};

export const duplicateDiagramElement = (element, createId = createDiagramElementId, offset = 4) => {
  const source = element?.type === 'curved_arrow' ? ensureSetPieceCurveGeometry(element) : element;
  const translated = translateSetPieceElement(cloneDiagramElements([source])[0], offset, offset);
  ['x', 'x1', 'x2', 'controlX'].forEach((field) => {
    if (field in translated) translated[field] = clampDiagramCoordinate(translated[field], 'x');
  });
  ['y', 'y1', 'y2', 'controlY'].forEach((field) => {
    if (field in translated) translated[field] = clampDiagramCoordinate(translated[field], 'y');
  });
  return normalizeSetPieceElementDimensions({
    ...translated,
    id: createId(),
  });
};

export const createDiagramHistory = (elements = []) => ({
  entries: [cloneDiagramElements(elements)],
  index: 0,
});

export const pushDiagramHistory = (history, elements, limit = 50) => {
  const entries = [...history.entries.slice(0, history.index + 1), cloneDiagramElements(elements)].slice(-limit);
  return { entries, index: entries.length - 1 };
};

export const moveDiagramHistory = (history, direction) => {
  const offset = direction === 'redo' ? 1 : -1;
  const index = Math.max(0, Math.min(history.entries.length - 1, history.index + offset));
  return {
    history: { ...history, index },
    elements: cloneDiagramElements(history.entries[index]),
    changed: index !== history.index,
  };
};
