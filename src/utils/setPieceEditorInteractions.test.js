import assert from 'node:assert/strict';
import {
  applySetPieceArrowStyle,
  ensureSetPieceCurveGeometry,
  getSetPieceArrowStyle,
  getSetPieceCurveControlPoint,
  getSetPieceDeleteAction,
  getSetPieceElementInteraction,
  getSetPieceHistoryAction,
  isEditableInteractionTarget,
  moveSetPieceCurveControlPoint,
  shouldIgnoreSetPieceShortcut,
  translateSetPieceElement,
} from './setPieceEditorInteractions.js';

const target = (tagName, fields = {}) => ({ tagName, ...fields });
const nestedEditableTarget = {
  tagName: 'SPAN',
  closest: (selector) => (selector.includes('textarea') ? { tagName: 'TEXTAREA' } : null),
};

assert.equal(isEditableInteractionTarget(target('INPUT')), true);
assert.equal(isEditableInteractionTarget(target('TEXTAREA')), true);
assert.equal(isEditableInteractionTarget(target('SELECT')), true);
assert.equal(isEditableInteractionTarget(target('DIV', { isContentEditable: true })), true);
assert.equal(isEditableInteractionTarget(nestedEditableTarget), true);
assert.equal(isEditableInteractionTarget(target('SVG')), false);

[' ', 'Backspace', 'Delete', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].forEach((key) => {
  assert.equal(shouldIgnoreSetPieceShortcut({ key, target: target('TEXTAREA') }), true, `${key} conserva el comportamiento nativo dentro de textarea`);
  assert.equal(shouldIgnoreSetPieceShortcut({ key, target: target('INPUT') }), true, `${key} conserva el comportamiento nativo dentro de input`);
});
assert.equal(getSetPieceDeleteAction({ key: 'Delete', target: target('TEXTAREA') }, true), null, 'Delete escribe/borrar texto y no elimina el elemento');
assert.equal(getSetPieceDeleteAction({ key: 'Backspace', target: target('INPUT') }, true), null, 'Backspace no elimina el elemento mientras se escribe');
assert.equal(getSetPieceDeleteAction({ key: 'Delete', target: target('SVG') }, true), 'delete', 'Delete conserva el shortcut fuera de campos editables');
assert.equal(getSetPieceDeleteAction({ key: 'Backspace', target: target('SVG') }, true), 'delete', 'Backspace conserva el shortcut fuera de campos editables');

assert.equal(getSetPieceHistoryAction({ key: 'z', ctrlKey: true, target: target('TEXTAREA') }), null);
assert.equal(getSetPieceHistoryAction({ key: 'y', ctrlKey: true, target: target('INPUT') }), null);
assert.equal(getSetPieceHistoryAction({ key: 'z', metaKey: true, target: target('DIV', { isContentEditable: true }) }), null);
assert.equal(getSetPieceHistoryAction({ key: 'z', ctrlKey: true, target: target('SVG') }), 'undo');
assert.equal(getSetPieceHistoryAction({ key: 'y', ctrlKey: true, target: target('SVG') }), 'redo');
assert.equal(getSetPieceHistoryAction({ key: 'z', ctrlKey: true, shiftKey: true, target: target('SVG') }), 'redo');
assert.equal(getSetPieceHistoryAction({ key: 'z', metaKey: true, target: target('SVG') }), 'undo');
assert.equal(getSetPieceHistoryAction({ key: 'z', metaKey: true, shiftKey: true, target: target('SVG') }), 'redo');
assert.equal(getSetPieceHistoryAction({ key: 'y', metaKey: true, target: target('SVG') }), null);
assert.equal(getSetPieceHistoryAction({ key: 'x', ctrlKey: true, target: target('SVG') }), null);
assert.equal(getSetPieceHistoryAction({ key: 'z', ctrlKey: true, altKey: true, target: target('SVG') }), null);
assert.equal(getSetPieceHistoryAction({ key: 'z', ctrlKey: true, defaultPrevented: true, target: target('SVG') }), null);

assert.deepEqual(getSetPieceElementInteraction({ locked: false }), { selectable: true, draggable: true });
assert.deepEqual(getSetPieceElementInteraction({ locked: true }), { selectable: true, draggable: false });
assert.deepEqual(getSetPieceElementInteraction({ readOnly: true, locked: false }), { selectable: false, draggable: false });
assert.deepEqual(getSetPieceElementInteraction({ readOnly: true, locked: true }), { selectable: false, draggable: false });

const baseCurve = ensureSetPieceCurveGeometry({
  id: 'curve-1',
  type: 'curved_arrow',
  x1: 20,
  y1: 36,
  x2: 80,
  y2: 36,
});
const dashedCurve = applySetPieceArrowStyle({ id: 'curve-dashed', type: 'arrow', x1: 20, y1: 36, x2: 80, y2: 36 }, 'curved_dashed_arrow');
assert.equal(dashedCurve.type, 'curved_arrow', 'la curva discontinua reutiliza el tipo geométrico de la curva');
assert.equal(dashedCurve.dashed, true, 'la discontinuidad se almacena como estilo combinable');
assert.equal(getSetPieceArrowStyle(dashedCurve), 'curved_dashed_arrow');
assert.deepEqual(getSetPieceCurveControlPoint(dashedCurve), { x: 50, y: 24 });
const dashedCurveLeft = moveSetPieceCurveControlPoint(dashedCurve, { x: 43, y: 17 });
const dashedCurveRight = moveSetPieceCurveControlPoint(dashedCurveLeft, { x: 57, y: 53 });
const dashedCurveHistory = [dashedCurve, dashedCurveLeft, dashedCurveRight];
assert.deepEqual(dashedCurveHistory[1], dashedCurveLeft, 'undo restaura controlX/controlY y discontinuidad');
assert.deepEqual(dashedCurveHistory[2], dashedCurveRight, 'redo recupera controlX/controlY y discontinuidad');
assert.equal(dashedCurveHistory.every((entry) => entry.type === 'curved_arrow' && entry.dashed === true), true);
assert.deepEqual(getSetPieceCurveControlPoint(baseCurve), { x: 50, y: 24 }, 'una curva nueva persiste un control intermedio real');

const leftCurve = moveSetPieceCurveControlPoint(baseCurve, { x: 50, y: 18 });
const rightCurve = moveSetPieceCurveControlPoint(leftCurve, { x: 50, y: 54 });
assert.equal(leftCurve.controlY < 36, true, 'el control crea una curva hacia un lado');
assert.equal(rightCurve.controlY > 36, true, 'el mismo control cambia la curva al lado contrario');

const pronouncedCurve = moveSetPieceCurveControlPoint(baseCurve, { x: 50, y: 6 });
const softCurve = moveSetPieceCurveControlPoint(pronouncedCurve, { x: 50, y: 34.5 });
assert.equal(Math.abs(pronouncedCurve.controlY - 36) > Math.abs(leftCurve.controlY - 36), true, 'alejar el control aumenta la curvatura');
assert.equal(Math.abs(softCurve.controlY - 36) < Math.abs(leftCurve.controlY - 36), true, 'acercarlo al eje reduce la curvatura hasta casi recta');

const curveHistory = [baseCurve, leftCurve, rightCurve];
let curveHistoryIndex = 2;
curveHistoryIndex -= 1;
assert.deepEqual(curveHistory[curveHistoryIndex], leftCurve, 'deshacer restaura el punto de control anterior');
curveHistoryIndex += 1;
assert.deepEqual(curveHistory[curveHistoryIndex], rightCurve, 'rehacer restaura el nuevo punto de control');

const endpointEdit = { ...rightCurve, x1: 14, y1: 31, x2: 86, y2: 42 };
const fullGeometryHistory = [rightCurve, endpointEdit];
assert.deepEqual(fullGeometryHistory[0], rightCurve, 'deshacer restaura origen y destino junto al control');
assert.deepEqual(fullGeometryHistory[1], endpointEdit, 'rehacer recupera origen, destino y control de la curva');

const translatedCurve = translateSetPieceElement(leftCurve, 4, 3);
assert.deepEqual(
  { x1: translatedCurve.x1, y1: translatedCurve.y1, x2: translatedCurve.x2, y2: translatedCurve.y2, controlX: translatedCurve.controlX, controlY: translatedCurve.controlY },
  { x1: 24, y1: 39, x2: 84, y2: 39, controlX: 54, controlY: 21 },
  'mover o duplicar una curva traslada origen, destino y control como una unidad',
);
const translatedDashedCurve = translateSetPieceElement(moveSetPieceCurveControlPoint(dashedCurve, { x: 46, y: 52 }), -3, 5);
assert.deepEqual(
  { type: translatedDashedCurve.type, dashed: translatedDashedCurve.dashed, x1: translatedDashedCurve.x1, y1: translatedDashedCurve.y1, x2: translatedDashedCurve.x2, y2: translatedDashedCurve.y2, controlX: translatedDashedCurve.controlX, controlY: translatedDashedCurve.controlY },
  { type: 'curved_arrow', dashed: true, x1: 17, y1: 41, x2: 77, y2: 41, controlX: 43, controlY: 57 },
  'mover la curva discontinua traslada origen, destino y control sin perder el estilo',
);

console.log('setPieceEditorInteractions tests passed');
