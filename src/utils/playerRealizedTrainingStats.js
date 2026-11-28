import { PLAYER_STATUSES } from './plannedSessionPlayers.js';

export const PLAYER_REALIZED_TRAINING_COLORS = {
  available: '#34d399',
  adapted: '#fbbf24',
  absent: '#94a3b8',
  injured: '#fb7185',
  first_team: '#60a5fa',
};

export const summarizePlayerRealizedTraining = (rows = []) => {
  const statusBySession = new Map();
  const knownStatuses = new Set(PLAYER_STATUSES.map(({ key }) => key));

  for (const row of rows) {
    if (!row.session_id) continue;
    if (!knownStatuses.has(row.status)) {
      throw new Error(`Estado final de sesión no reconocido: ${row.status}`);
    }
    const previousStatus = statusBySession.get(row.session_id);
    if (previousStatus && previousStatus !== row.status) {
      throw new Error('Hay más de un estado final para una sesión del jugador.');
    }
    statusBySession.set(row.session_id, row.status);
  }

  const counts = Object.fromEntries(PLAYER_STATUSES.map(({ key }) => [key, 0]));
  for (const status of statusBySession.values()) counts[status] += 1;
  const total = statusBySession.size;
  const states = PLAYER_STATUSES.map(({ key, label }) => ({
    key,
    label,
    count: counts[key],
    percentage: total ? (counts[key] / total) * 100 : 0,
    color: PLAYER_REALIZED_TRAINING_COLORS[key],
  }));
  const completed = counts.available + counts.adapted;

  return {
    total,
    completed,
    participationPercentage: total ? (completed / total) * 100 : 0,
    states,
  };
};

export const summarizeSessionRealizedPlayers = (rows = []) => {
  const statusByPlayer = new Map();
  const knownStatuses = new Set(PLAYER_STATUSES.map(({ key }) => key));

  for (const row of rows) {
    if (!row.player_id) continue;
    if (!knownStatuses.has(row.status)) {
      throw new Error(`Estado final de sesión no reconocido: ${row.status}`);
    }
    const previousStatus = statusByPlayer.get(row.player_id);
    if (previousStatus && previousStatus !== row.status) {
      throw new Error('Hay más de un estado final para un jugador de la sesión.');
    }
    statusByPlayer.set(row.player_id, row.status);
  }

  const counts = Object.fromEntries(PLAYER_STATUSES.map(({ key }) => [key, 0]));
  for (const status of statusByPlayer.values()) counts[status] += 1;
  const total = statusByPlayer.size;
  const states = PLAYER_STATUSES.map(({ key, label }) => ({
    key,
    label,
    count: counts[key],
    percentage: total ? (counts[key] / total) * 100 : 0,
    color: PLAYER_REALIZED_TRAINING_COLORS[key],
  }));
  const completed = counts.available + counts.adapted;

  return {
    total,
    completed,
    participationPercentage: total ? (completed / total) * 100 : 0,
    states,
  };
};
