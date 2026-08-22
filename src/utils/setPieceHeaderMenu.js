export const SET_PIECE_HEADER_MENUS = Object.freeze({
  MANAGE: 'manage',
  LIBRARY: 'library',
  TRANSFORM: 'transform',
});

export const transitionSetPieceHeaderMenu = (openMenu, action = {}) => {
  if (action.type === 'toggle') return openMenu === action.menu ? null : action.menu;
  if (action.type === 'pointerdown') return action.inside ? openMenu : null;
  if (action.type === 'keydown') return action.key === 'Escape' ? null : openMenu;
  if (action.type === 'select' || action.type === 'context-change') return null;
  return openMenu;
};
