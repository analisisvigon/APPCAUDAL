export const DEFAULT_TACTICAL_BOARD_LAYERS = Object.freeze({
  zones: true,
  names: true,
  badges: true,
  rival: true,
  caudal: true,
  connections: true,
  microduels: true,
});

export const createTacticalBoardViewState = () => ({
  mode: 'LIMPIO',
  layers: { ...DEFAULT_TACTICAL_BOARD_LAYERS },
});

export const updateTacticalBoardViewState = (current, patch = {}) => {
  const base = current && typeof current === 'object'
    ? current
    : createTacticalBoardViewState();

  return {
    ...base,
    ...patch,
    layers: {
      ...DEFAULT_TACTICAL_BOARD_LAYERS,
      ...(base.layers || {}),
      ...(patch.layers || {}),
    },
  };
};
