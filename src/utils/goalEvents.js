const normalizeIdentityText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const firstText = (...values) => values
  .map((value) => String(value ?? '').trim())
  .find(Boolean) || '';

const firstId = (...values) => firstText(...values) || null;

export const GOAL_ASSISTANCE_STATUS = Object.freeze({
  pending: 'pending',
  none: 'none',
  player: 'player',
});

export const GOAL_ASSISTANCE_SELECT_VALUE = Object.freeze({
  pending: '__assist_pending__',
  none: '__no_assistance__',
});

export const getGoalScorer = (event = {}) => ({
  id: firstId(event.scorerId, event.scorer_id, event.goalScorerId, event.goal_scorer_id),
  name: firstText(event.scorerName, event.scorer, event.goalScorer, event.goal_scorer),
});

export const getGoalAssistant = (event = {}) => ({
  id: firstId(
    event.assistantId,
    event.assistant_id,
    event.assistId,
    event.assist_id,
    event.assistedById,
    event.assisted_by_id
  ),
  name: firstText(
    event.assistantName,
    event.assistant,
    event.assistName,
    event.assist,
    event.assistedBy,
    event.assisted_by
  ),
});

export const hasGoalAssistant = (event = {}) => {
  const assistant = getGoalAssistant(event);
  return Boolean(assistant.id || assistant.name);
};

export const getPersistedGoalAssistanceStatus = (event = {}) => (
  hasGoalAssistant(event) ? GOAL_ASSISTANCE_STATUS.player : GOAL_ASSISTANCE_STATUS.none
);

export const getGoalAssistantSelectValue = (draft = {}) => {
  if (draft.assistantStatus === GOAL_ASSISTANCE_STATUS.pending) return GOAL_ASSISTANCE_SELECT_VALUE.pending;
  if (draft.assistantStatus === GOAL_ASSISTANCE_STATUS.none) return GOAL_ASSISTANCE_SELECT_VALUE.none;
  const assistant = getGoalAssistant(draft);
  return assistant.name || GOAL_ASSISTANCE_SELECT_VALUE.pending;
};

export const createGoalAssistantDraftPatch = (selection, players = []) => {
  if (selection === GOAL_ASSISTANCE_SELECT_VALUE.pending) {
    return { assistant: '', assistantId: null, assistantStatus: GOAL_ASSISTANCE_STATUS.pending };
  }
  if (selection === GOAL_ASSISTANCE_SELECT_VALUE.none) {
    return { assistant: '', assistantId: null, assistantStatus: GOAL_ASSISTANCE_STATUS.none };
  }
  const assistant = String(selection || '').trim();
  const player = players.find((candidate) => candidate?.name === assistant) || null;
  return {
    assistant,
    assistantId: player?.id || null,
    assistantStatus: assistant ? GOAL_ASSISTANCE_STATUS.player : GOAL_ASSISTANCE_STATUS.pending,
  };
};

export const resolveGoalParticipant = (event = {}, role, players = []) => {
  const participant = role === 'assistant' ? getGoalAssistant(event) : getGoalScorer(event);
  const byId = participant.id
    ? players.find((player) => String(player?.id || '') === String(participant.id))
    : null;
  if (byId) return byId;
  const normalizedName = normalizeIdentityText(participant.name);
  return normalizedName
    ? players.find((player) => normalizeIdentityText(player?.name) === normalizedName) || null
    : null;
};

export const goalParticipantMatchesPlayer = (event = {}, role, player = {}) => {
  const participant = role === 'assistant' ? getGoalAssistant(event) : getGoalScorer(event);
  if (participant.id && player?.id && String(participant.id) === String(player.id)) return true;
  const participantName = normalizeIdentityText(participant.name);
  const playerName = normalizeIdentityText(player?.name);
  return Boolean(participantName && playerName && participantName === playerName);
};

export const normalizeGoalParticipants = (event = {}) => {
  const scorer = getGoalScorer(event);
  const assistant = getGoalAssistant(event);
  return {
    scorer: scorer.name,
    scorerId: scorer.id,
    assistant: assistant.name,
    assistantId: assistant.id,
  };
};

export const createGoalParticipantDbFields = (event = {}) => {
  const scorer = getGoalScorer(event);
  const assistant = getGoalAssistant(event);
  return {
    scorer: scorer.name || null,
    scorer_id: scorer.id || null,
    assistant: assistant.name || null,
    assistant_id: assistant.id || null,
  };
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const getStablePlayerIds = (player = {}) => [
  player.id,
  player.jugadorRivalId,
  player.jugador_rival_id,
  player.globalPlayerId,
  player.global_player_id,
  player.membershipId,
  player.membership_id,
  player.legacyId,
  player.legacy_id,
].map((value) => String(value || '').trim()).filter(Boolean);

export const getGoalTimelineParticipantName = (
  event = {},
  role,
  players = [],
  formatPlayerName = (player) => player?.name
) => {
  const participant = role === 'assistant' ? getGoalAssistant(event) : getGoalScorer(event);
  const participantId = String(participant.id || '').trim();
  const linkedPlayer = participantId
    ? (Array.isArray(players) ? players : [])
      .find((player) => getStablePlayerIds(player).includes(participantId))
    : null;
  if (linkedPlayer) {
    const visibleName = String(formatPlayerName(linkedPlayer) || linkedPlayer.name || '').trim();
    if (visibleName && !UUID_PATTERN.test(visibleName)) return visibleName;
  }
  const storedName = String(participant.name || '').trim();
  return storedName && !UUID_PATTERN.test(storedName) ? storedName : '';
};

export const buildRivalGoalTimelinePresentation = (
  event = {},
  {
    teamName = 'Rival',
    rivalPlayers = [],
    formatPlayerName,
  } = {}
) => {
  const visibleTeamName = String(teamName || '').trim() || 'Rival';
  const scorerName = getGoalTimelineParticipantName(
    event,
    'scorer',
    rivalPlayers,
    formatPlayerName
  );
  const assistantName = getGoalTimelineParticipantName(
    event,
    'assistant',
    rivalPlayers,
    formatPlayerName
  );
  return {
    label: scorerName ? `${scorerName} · ${visibleTeamName}` : visibleTeamName,
    assist: assistantName,
  };
};

export const normalizeGoalParticipantName = normalizeIdentityText;
