export const TACTICAL_SYSTEM_CONTEXT_VERSION = 1;
export const TACTICAL_SYSTEM_CONTEXT_SOURCE = 'explicit_selection';

export const normalizeIdentitySystem = (value) => String(value || '').trim();

export const hasCompleteSystemPair = ({ caudalSystem, rivalSystem } = {}) => (
  Boolean(normalizeIdentitySystem(caudalSystem) && normalizeIdentitySystem(rivalSystem))
);

export const hasExplicitTacticalSystemContext = (play) => (
  Boolean(play)
  && play.systemContextVersion === TACTICAL_SYSTEM_CONTEXT_VERSION
  && play.systemContextSource === TACTICAL_SYSTEM_CONTEXT_SOURCE
  && hasCompleteSystemPair(play)
);

export const getExplicitTacticalSystemContext = (play) => (
  hasExplicitTacticalSystemContext(play)
    ? {
      caudalSystem: normalizeIdentitySystem(play.caudalSystem),
      rivalSystem: normalizeIdentitySystem(play.rivalSystem),
    }
    : null
);

export const withExplicitTacticalSystemContext = (play, { caudalSystem, rivalSystem } = {}) => {
  const normalizedCaudalSystem = normalizeIdentitySystem(caudalSystem);
  const normalizedRivalSystem = normalizeIdentitySystem(rivalSystem);
  if (!normalizedCaudalSystem || !normalizedRivalSystem) return null;
  return {
    ...play,
    caudalSystem: normalizedCaudalSystem,
    rivalSystem: normalizedRivalSystem,
    systemContextVersion: TACTICAL_SYSTEM_CONTEXT_VERSION,
    systemContextSource: TACTICAL_SYSTEM_CONTEXT_SOURCE,
  };
};

const normalizeVariantParts = (variantParts) => (
  (Array.isArray(variantParts) ? variantParts : [variantParts])
    .filter((part) => part != null && String(part).trim())
    .map((part) => String(part).trim())
);

export const buildTacticalWorkspaceKey = ({
  caudalSystem,
  rivalSystem,
  macroPhase,
  situation,
  variantParts = [],
} = {}) => {
  const normalizedCaudalSystem = normalizeIdentitySystem(caudalSystem);
  const normalizedRivalSystem = normalizeIdentitySystem(rivalSystem);
  const normalizedMacroPhase = String(macroPhase || '').trim();
  const normalizedSituation = String(situation || '').trim();
  if (!normalizedCaudalSystem || !normalizedRivalSystem || !normalizedMacroPhase || !normalizedSituation) return '';
  return JSON.stringify([
    `systems-v${TACTICAL_SYSTEM_CONTEXT_VERSION}`,
    normalizedCaudalSystem,
    normalizedRivalSystem,
    normalizedMacroPhase,
    normalizedSituation,
    ...normalizeVariantParts(variantParts),
  ]);
};

export const getTacticalPlayWorkspaceContext = (play) => {
  const systems = getExplicitTacticalSystemContext(play);
  if (!systems) return null;
  if (play.phase === 'offensive' || play.offensiveSituation) {
    return {
      ...systems,
      macroPhase: 'offensive',
      situation: play.offensiveSituation,
      variantParts: [play.playStyle === 'direct' ? 'direct' : 'combinative'],
    };
  }
  if (play.phase === 'transition' || play.transitionType) {
    return {
      ...systems,
      macroPhase: 'transition',
      situation: play.transitionType,
      variantParts: [play.fieldZone, play.behaviour],
    };
  }
  if (play.defensiveSituation) {
    return {
      ...systems,
      macroPhase: 'defensive',
      situation: play.defensiveSituation,
      variantParts: [],
    };
  }
  return null;
};

export const getTacticalPlayWorkspaceKey = (play) => {
  const context = getTacticalPlayWorkspaceContext(play);
  return context ? buildTacticalWorkspaceKey(context) : '';
};

export const tacticalPlayMatchesWorkspaceContext = (play, context) => {
  const expectedKey = buildTacticalWorkspaceKey(context);
  return Boolean(expectedKey && getTacticalPlayWorkspaceKey(play) === expectedKey);
};

export const isLegacyUnclassifiedTacticalPlay = (play) => (
  Boolean(play) && !getTacticalPlayWorkspaceKey(play)
);

export const resolveTacticalActivePlayId = ({
  plays = [],
  activePlayIdByContext = {},
  context,
} = {}) => {
  const contextKey = buildTacticalWorkspaceKey(context);
  if (!contextKey) return '';
  const savedId = activePlayIdByContext?.[contextKey];
  const savedPlay = plays.find((play) => play.id === savedId);
  if (tacticalPlayMatchesWorkspaceContext(savedPlay, context)) return savedPlay.id;
  return plays.find((play) => tacticalPlayMatchesWorkspaceContext(play, context))?.id || '';
};

export const selectTacticalPlayInContext = (workspace, playId, context) => {
  const contextKey = buildTacticalWorkspaceKey(context);
  const plays = Array.isArray(workspace?.plays) ? workspace.plays : [];
  if (!contextKey || !plays.some((play) => play.id === playId && tacticalPlayMatchesWorkspaceContext(play, context))) {
    return workspace;
  }
  return {
    ...workspace,
    activePlayIdByContext: {
      ...(workspace?.activePlayIdByContext || {}),
      [contextKey]: playId,
    },
  };
};

export const addTacticalPlayToContext = (workspace, play) => {
  const contextKey = getTacticalPlayWorkspaceKey(play);
  if (!play?.id || !contextKey) return workspace;
  return {
    ...workspace,
    activePlayIdByContext: {
      ...(workspace?.activePlayIdByContext || {}),
      [contextKey]: play.id,
    },
    plays: [...(Array.isArray(workspace?.plays) ? workspace.plays : []), play],
  };
};

export const deleteTacticalPlayFromContext = (workspace, playId, context) => {
  const plays = Array.isArray(workspace?.plays) ? workspace.plays : [];
  const contextKey = buildTacticalWorkspaceKey(context);
  const target = plays.find((play) => play.id === playId);
  if (!contextKey || !tacticalPlayMatchesWorkspaceContext(target, context)) return workspace;
  const remainingPlays = plays.filter((play) => play.id !== playId);
  const nextPlayId = remainingPlays.find((play) => tacticalPlayMatchesWorkspaceContext(play, context))?.id || '';
  return {
    ...workspace,
    activePlayIdByContext: {
      ...(workspace?.activePlayIdByContext || {}),
      [contextKey]: nextPlayId,
    },
    plays: remainingPlays,
  };
};

export const resetTacticalPlayPositions = (play, playerPositions) => ({
  ...play,
  playerPositions,
});
