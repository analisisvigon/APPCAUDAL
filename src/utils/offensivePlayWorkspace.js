import {
  buildTacticalWorkspaceKey,
  hasCompleteSystemPair,
  hasExplicitTacticalSystemContext,
  tacticalPlayMatchesWorkspaceContext,
} from './tacticalWorkspaceContext.js';

const safePlays = (workspace) => (Array.isArray(workspace?.plays) ? workspace.plays : []);

export const normalizeOffensivePlayStyle = (value) => (
  value === 'direct' ? 'direct' : 'combinative'
);

const getOffensiveSystemContext = (situation, playStyle, { caudalSystem, rivalSystem } = {}) => ({
  caudalSystem,
  rivalSystem,
  macroPhase: 'offensive',
  situation,
  variantParts: [normalizeOffensivePlayStyle(playStyle)],
});

export const getOffensivePlayContextKey = (situation, playStyle, systems = {}) => (
  hasCompleteSystemPair(systems)
    ? buildTacticalWorkspaceKey(getOffensiveSystemContext(situation, playStyle, systems))
    : `${String(situation || '')}:${normalizeOffensivePlayStyle(playStyle)}`
);

export const offensivePlayMatchesContext = (play, situation, playStyle, systems = {}) => (
  hasCompleteSystemPair(systems)
    ? tacticalPlayMatchesWorkspaceContext(play, getOffensiveSystemContext(situation, playStyle, systems))
    : Boolean(play)
      && play.offensiveSituation === situation
      && normalizeOffensivePlayStyle(play.playStyle) === normalizeOffensivePlayStyle(playStyle)
);

export const resolveOffensiveActivePlayId = ({
  plays = [],
  activePlayIdByContext = {},
  activePlayIdBySituation = {},
  situation,
  playStyle,
  caudalSystem,
  rivalSystem,
} = {}) => {
  const systems = { caudalSystem, rivalSystem };
  const systemAware = hasCompleteSystemPair(systems);
  const contextKey = getOffensivePlayContextKey(situation, playStyle, systems);
  const candidates = systemAware
    ? [activePlayIdByContext?.[contextKey]]
    : [activePlayIdByContext?.[contextKey], activePlayIdBySituation?.[situation]];
  const matchingPlay = candidates
    .map((playId) => plays.find((play) => play.id === playId))
    .find((play) => offensivePlayMatchesContext(play, situation, playStyle, systems));
  return matchingPlay?.id
    || plays.find((play) => offensivePlayMatchesContext(play, situation, playStyle, systems))?.id
    || '';
};

export const navigateOffensivePlayStyle = (workspace, situation, playStyle) => ({
  ...workspace,
  activePlayStyleBySituation: {
    ...(workspace?.activePlayStyleBySituation || {}),
    [situation]: normalizeOffensivePlayStyle(playStyle),
  },
});

export const selectOffensivePlayInWorkspace = (workspace, {
  situation,
  playStyle,
  playId,
  caudalSystem,
  rivalSystem,
} = {}) => {
  const plays = safePlays(workspace);
  const systems = { caudalSystem, rivalSystem };
  if (!plays.some((play) => play.id === playId && offensivePlayMatchesContext(play, situation, playStyle, systems))) {
    return workspace;
  }
  const normalizedStyle = normalizeOffensivePlayStyle(playStyle);
  return {
    ...workspace,
    activePlayStyleBySituation: {
      ...(workspace?.activePlayStyleBySituation || {}),
      [situation]: normalizedStyle,
    },
    activePlayIdByContext: {
      ...(workspace?.activePlayIdByContext || {}),
      [getOffensivePlayContextKey(situation, normalizedStyle, systems)]: playId,
    },
    activePlayIdBySituation: {
      ...(workspace?.activePlayIdBySituation || {}),
      [situation]: playId,
    },
  };
};

export const addOffensivePlayToWorkspace = (workspace, play) => {
  if (!play?.id || !play.offensiveSituation) return workspace;
  const playStyle = normalizeOffensivePlayStyle(play.playStyle);
  const normalizedPlay = { ...play, phase: 'offensive', playStyle };
  const systems = { caudalSystem: normalizedPlay.caudalSystem, rivalSystem: normalizedPlay.rivalSystem };
  const contextKey = getOffensivePlayContextKey(
    normalizedPlay.offensiveSituation,
    playStyle,
    hasExplicitTacticalSystemContext(normalizedPlay) ? systems : {}
  );
  return {
    ...workspace,
    activePlayStyleBySituation: {
      ...(workspace?.activePlayStyleBySituation || {}),
      [normalizedPlay.offensiveSituation]: playStyle,
    },
    activePlayIdByContext: {
      ...(workspace?.activePlayIdByContext || {}),
      [contextKey]: normalizedPlay.id,
    },
    activePlayIdBySituation: {
      ...(workspace?.activePlayIdBySituation || {}),
      [normalizedPlay.offensiveSituation]: normalizedPlay.id,
    },
    plays: [...safePlays(workspace), normalizedPlay],
  };
};

export const cloneOffensivePlay = (play, {
  playId,
  createArrowId,
  timestamp = new Date().toISOString(),
} = {}) => {
  if (!play || !playId) return null;
  return {
    ...play,
    id: playId,
    phase: 'offensive',
    playStyle: normalizeOffensivePlayStyle(play.playStyle),
    name: `${play.name} · copia`,
    playerPositions: Object.fromEntries(
      Object.entries(play.playerPositions || {}).map(([key, position]) => [key, { ...position }])
    ),
    arrows: (play.arrows || []).map((arrow) => ({
      ...arrow,
      id: createArrowId ? createArrowId() : arrow.id,
      start: { ...arrow.start },
      end: { ...arrow.end },
      ...(arrow.controlPoint ? { controlPoint: { ...arrow.controlPoint } } : {}),
    })),
    ballStartPosition: play.ballStartPosition ? { ...play.ballStartPosition } : null,
    tags: Array.isArray(play.tags) ? [...play.tags] : play.tags,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

export const deleteOffensivePlayFromWorkspace = (workspace, {
  situation,
  playStyle,
  playId,
  caudalSystem,
  rivalSystem,
} = {}) => {
  const plays = safePlays(workspace);
  const systems = { caudalSystem, rivalSystem };
  const target = plays.find((play) => (
    play.id === playId && offensivePlayMatchesContext(play, situation, playStyle, systems)
  ));
  if (!target) return workspace;
  const remainingPlays = plays.filter((play) => play.id !== playId);
  const nextPlayId = remainingPlays.find((play) => (
    offensivePlayMatchesContext(play, situation, playStyle, systems)
  ))?.id || '';
  return {
    ...workspace,
    activePlayIdByContext: {
      ...(workspace?.activePlayIdByContext || {}),
      [getOffensivePlayContextKey(situation, playStyle, systems)]: nextPlayId,
    },
    activePlayIdBySituation: {
      ...(workspace?.activePlayIdBySituation || {}),
      [situation]: nextPlayId,
    },
    plays: remainingPlays,
  };
};
