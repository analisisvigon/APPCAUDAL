import { getPlayerPositionModel } from '../constants/playerPositions.js';
import { createDiagramElementId } from './diagramEditorState.js';

export const TRAINING_TASK_TEAM_KEYS = Object.freeze(['team-1', 'team-2', 'team-3', 'neutral']);
export const DEFAULT_TRAINING_TASK_TEAM_COLORS = Object.freeze({
  'team-1': 'blue', 'team-2': 'red', 'team-3': 'yellow', neutral: 'green',
});

const clean = (value) => String(value ?? '').trim();
const nullable = (value) => clean(value) || null;

export const createTrainingTaskPlayerRef = (player = {}) => ({
  globalPlayerId: nullable(player.globalPlayerId ?? player.global_player_id),
  legacyPlayerId: clean(player.id),
  snapshot: {
    name: clean(player.name || player.fullName || player.shirtName) || 'Jugador',
    number: clean(player.number),
    position: clean(player.position),
    specificPosition: clean(player.specificPosition ?? player.specific_position),
  },
});

export const getTrainingTaskPlayerRefKey = (ref = {}) => {
  const globalId = nullable(ref.globalPlayerId);
  if (globalId) return `global:${globalId}`;
  const legacyId = clean(ref.legacyPlayerId);
  return legacyId ? `legacy:${legacyId}` : '';
};

export const trainingTaskPlayerRefsMatch = (left = {}, right = {}) => {
  const leftGlobal = nullable(left.globalPlayerId); const rightGlobal = nullable(right.globalPlayerId);
  if (leftGlobal && rightGlobal && leftGlobal === rightGlobal) return true;
  const leftLegacy = clean(left.legacyPlayerId); const rightLegacy = clean(right.legacyPlayerId);
  return Boolean(leftLegacy && rightLegacy && leftLegacy === rightLegacy);
};

export const createTrainingTaskPlayerLookup = (players = []) => ({
  byGlobal: new Map(players.map((player) => [clean(player.globalPlayerId ?? player.global_player_id), player]).filter(([key]) => key)),
  byLegacy: new Map(players.map((player) => [clean(player.id), player]).filter(([key]) => key)),
});

export const resolveTrainingTaskPlayerRef = (ref = {}, players = []) => {
  const globalId = nullable(ref.globalPlayerId);
  const legacyId = clean(ref.legacyPlayerId);
  const lookup = Array.isArray(players) ? null : players;
  const player = (globalId && (lookup?.byGlobal?.get(globalId) || players.find?.((entry) => clean(entry.globalPlayerId ?? entry.global_player_id) === globalId)))
    || (legacyId && (lookup?.byLegacy?.get(legacyId) || players.find?.((entry) => clean(entry.id) === legacyId))) || null;
  const source = player || ref.snapshot || {};
  return {
    player,
    unavailable: !player,
    display: {
      name: clean(source.name || source.fullName || source.shirtName) || 'Jugador no disponible',
      number: clean(source.number),
      position: clean(source.position),
      specificPosition: clean(source.specificPosition ?? source.specific_position),
      image: player ? clean(player.image || player.photoUrl || player.avatarUrl) : '',
    },
  };
};

export const isTrainingTaskGoalkeeper = (player = {}) => getPlayerPositionModel(player).primaryNaturalPosition === 'goalkeeper';

export const normalizeTrainingTaskAssignments = (value = {}) => ({
  ...value,
  teamColors: { ...DEFAULT_TRAINING_TASK_TEAM_COLORS, ...(value.teamColors || {}) },
  players: Array.isArray(value.players) ? value.players.filter((entry) => entry?.playerRef) : [],
});

export const getTrainingTaskAssignment = (assignments, ref) => normalizeTrainingTaskAssignments(assignments).players
  .find((entry) => trainingTaskPlayerRefsMatch(entry.playerRef, ref)) || null;

export const assignTrainingTaskPlayer = (assignments, player, teamKey) => {
  const normalized = normalizeTrainingTaskAssignments(assignments);
  const currentRef = createTrainingTaskPlayerRef(player);
  const existing = getTrainingTaskAssignment(normalized, currentRef);
  const playerRef = existing?.playerRef || currentRef;
  if (!getTrainingTaskPlayerRefKey(playerRef) || !TRAINING_TASK_TEAM_KEYS.includes(teamKey)) return normalized;
  const role = teamKey === 'neutral' ? 'neutral' : isTrainingTaskGoalkeeper(player) ? 'goalkeeper' : 'player';
  const next = { playerRef, teamKey, role, colorKey: normalized.teamColors[teamKey] };
  return { ...normalized, players: [...normalized.players.filter((entry) => !trainingTaskPlayerRefsMatch(entry.playerRef, playerRef)), next] };
};

export const removeTrainingTaskAssignment = (assignments, ref) => {
  const normalized = normalizeTrainingTaskAssignments(assignments);
  return { ...normalized, players: normalized.players.filter((entry) => !trainingTaskPlayerRefsMatch(entry.playerRef, ref)) };
};

export const setTrainingTaskTeamColor = (assignments, teamKey, colorKey) => {
  const normalized = normalizeTrainingTaskAssignments(assignments);
  return {
    ...normalized,
    teamColors: { ...normalized.teamColors, [teamKey]: colorKey },
    players: normalized.players.map((entry) => entry.teamKey === teamKey ? { ...entry, colorKey } : entry),
  };
};

export const syncTrainingTaskPlacedPlayers = (elements = [], assignments) => {
  const normalized = normalizeTrainingTaskAssignments(assignments);
  return elements.map((element) => {
    if (!element.playerRef) return element;
    const assignment = getTrainingTaskAssignment(normalized, element.playerRef);
    return assignment ? { ...element, teamKey: assignment.teamKey, role: assignment.role, colorKey: assignment.colorKey } : element;
  });
};

export const isTrainingTaskPlayerPlaced = (elements = [], ref) => elements.some((element) => element.playerRef && trainingTaskPlayerRefsMatch(element.playerRef, ref));
export const removeTrainingTaskPlayerFromBoard = (elements = [], ref) => elements.filter((element) => !element.playerRef || !trainingTaskPlayerRefsMatch(element.playerRef, ref));

export const createTrainingTaskRosterParticipant = (assignment, point = { x: 50, y: 36 }) => ({
  id: createDiagramElementId('participant'), type: 'participant', x: point.x, y: point.y,
  teamKey: assignment.teamKey, role: assignment.role, colorKey: assignment.colorKey,
  label: clean(assignment.playerRef?.snapshot?.number), playerRef: { ...assignment.playerRef, snapshot: { ...assignment.playerRef.snapshot } },
});
