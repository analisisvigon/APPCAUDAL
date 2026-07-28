import assert from 'node:assert/strict';
import {
  getSetPieceElementInteraction,
  getSetPieceHistoryAction,
  isEditableInteractionTarget,
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

console.log('setPieceEditorInteractions tests passed');
