const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="searchbox"], [role="combobox"], [role="spinbutton"]';

export const isEditableInteractionTarget = (target) => {
  if (!target || typeof target !== 'object') return false;
  if (target.isContentEditable) return true;

  const tagName = String(target.tagName || '').toLowerCase();
  if (['input', 'textarea', 'select'].includes(tagName)) return true;

  return typeof target.closest === 'function' && Boolean(target.closest(EDITABLE_SELECTOR));
};

export const getSetPieceHistoryAction = (event = {}) => {
  if (event.defaultPrevented) return null;
  if (isEditableInteractionTarget(event.target)) return null;
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;

  const key = String(event.key || '').toLowerCase();
  if (key === 'y' && event.ctrlKey && !event.shiftKey) return 'redo';
  if (key !== 'z') return null;
  return event.shiftKey ? 'redo' : 'undo';
};

export const getSetPieceElementInteraction = ({ readOnly = false, locked = false } = {}) => ({
  selectable: !readOnly,
  draggable: !readOnly && !locked,
});
