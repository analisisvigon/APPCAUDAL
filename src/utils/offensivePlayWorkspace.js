const safePlays = (workspace) => (Array.isArray(workspace?.plays) ? workspace.plays : []);

export const normalizeOffensivePlayStyle = (value) => (
  value === 'direct' ? 'direct' : 'combinative'
);

export const getOffensivePlayContextKey = (situation, playStyle) => (
  `${String(situation || '')}:${normalizeOffensivePlayStyle(playStyle)}`
);

export const offensivePlayMatchesContext = (play, situation, playStyle) => (
  Boolean(play)
  && play.offensiveSituation === situation
  && normalizeOffensivePlayStyle(play.playStyle) === normalizeOffensivePlayStyle(playStyle)
);

export const resolveOffensiveActivePlayId = ({
  plays = [],
  activePlayIdByContext = {},
  activePlayIdBySituation = {},
  situation,
  playStyle,
} = {}) => {
  const contextKey = getOffensivePlayContextKey(situation, playStyle);
  const candidates = [
    activePlayIdByContext?.[contextKey],
    activePlayIdBySituation?.[situation],
  ];
  const matchingPlay = candidates
    .map((playId) => plays.find((play) => play.id === playId))
    .find((play) => offensivePlayMatchesContext(play, situation, playStyle));
  return matchingPlay?.id
    || plays.find((play) => offensivePlayMatchesContext(play, situation, playStyle))?.id
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
} = {}) => {
  const plays = safePlays(workspace);
  if (!plays.some((play) => play.id === playId && offensivePlayMatchesContext(play, situation, playStyle))) {
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
      [getOffensivePlayContextKey(situation, normalizedStyle)]: playId,
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
  return {
    ...workspace,
    activePlayStyleBySituation: {
      ...(workspace?.activePlayStyleBySituation || {}),
      [normalizedPlay.offensiveSituation]: playStyle,
    },
    activePlayIdByContext: {
      ...(workspace?.activePlayIdByContext || {}),
      [getOffensivePlayContextKey(normalizedPlay.offensiveSituation, playStyle)]: normalizedPlay.id,
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
} = {}) => {
  const plays = safePlays(workspace);
  const target = plays.find((play) => (
    play.id === playId && offensivePlayMatchesContext(play, situation, playStyle)
  ));
  if (!target) return workspace;
  const remainingPlays = plays.filter((play) => play.id !== playId);
  const nextPlayId = remainingPlays.find((play) => (
    offensivePlayMatchesContext(play, situation, playStyle)
  ))?.id || '';
  return {
    ...workspace,
    activePlayIdByContext: {
      ...(workspace?.activePlayIdByContext || {}),
      [getOffensivePlayContextKey(situation, playStyle)]: nextPlayId,
    },
    activePlayIdBySituation: {
      ...(workspace?.activePlayIdBySituation || {}),
      [situation]: nextPlayId,
    },
    plays: remainingPlays,
  };
};
