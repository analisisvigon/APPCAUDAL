export const GOAL_ATOMIC_OPERATIONS = Object.freeze(['create', 'update', 'delete']);

export const buildGoalAtomicRpcArgs = ({ operation, matchId, goalId = null, goal = null, matchPatch = {} } = {}) => ({
  p_operation: operation,
  p_partido_id: matchId,
  p_goal_id: goalId || null,
  p_goal: goal || {},
  p_match_patch: matchPatch || {},
});

export const normalizeGoalAtomicResult = (data = {}) => {
  const score = data?.score && typeof data.score === 'object' ? data.score : {};
  return {
    goal: data?.goal || null,
    deletedGoalId: data?.deleted_goal_id || '',
    events: Array.isArray(data?.events) ? data.events : [],
    score: {
      goalsFor: String(score.goals_for ?? '0'),
      goalsAgainst: String(score.goals_against ?? '0'),
      homeScore: String(score.home_score ?? '0'),
      awayScore: String(score.away_score ?? '0'),
    },
  };
};

export const isGoalMutationResponseCurrent = ({ requestedMatchId, currentMatchId, requestId, latestRequestId }) => (
  String(requestedMatchId || '') === String(currentMatchId || '')
  && Number(requestId) === Number(latestRequestId)
);
