export const DEFAULT_TACTICAL_BOARD_LAYERS = Object.freeze({
  zones: true,
  rivalNames: true,
  caudalNames: false,
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

export const getTacticalBoardNamesVisibility = (viewState) => {
  const rival = viewState?.layers?.rivalNames ?? true;
  const caudal = viewState?.layers?.caudalNames ?? false;

  return {
    rival,
    caudal,
    all: rival && caudal,
    none: !rival && !caudal,
    partial: rival !== caudal,
  };
};

export const toggleAllTacticalBoardNames = (viewState) => {
  const names = getTacticalBoardNamesVisibility(viewState);
  const nextVisible = !names.all;
  return updateTacticalBoardViewState(viewState, {
    layers: {
      rivalNames: nextVisible,
      caudalNames: nextVisible,
    },
  });
};
