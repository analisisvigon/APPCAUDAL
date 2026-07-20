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

export const normalizeGoalParticipantName = normalizeIdentityText;
