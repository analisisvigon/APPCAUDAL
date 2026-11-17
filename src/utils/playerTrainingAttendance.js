import { PLAYER_STATUSES } from './plannedSessionPlayers.js';

export const PLAYER_TRAINING_ATTENDANCE_COLORS = {
  available: '#34d399',
  absent: '#94a3b8',
  injured: '#fb7185',
  adapted: '#fbbf24',
  first_team: '#60a5fa',
};

export const summarizePlayerTrainingAttendance = (rosterRows = [], availabilityRows = []) => {
  const sessionIds = new Set(rosterRows.map((row) => row.session_id).filter(Boolean));
  const statusBySession = new Map();
  const knownStatuses = new Set(PLAYER_STATUSES.map((status) => status.key));

  for (const row of availabilityRows) {
    if (!sessionIds.has(row.session_id)) continue;
    if (!knownStatuses.has(row.status)) {
      throw new Error(`Estado de disponibilidad no reconocido: ${row.status}`);
    }
    const previousStatus = statusBySession.get(row.session_id);
    if (previousStatus && previousStatus !== row.status) {
      throw new Error('Hay más de un estado de disponibilidad para una sesión del jugador.');
    }
    statusBySession.set(row.session_id, row.status);
  }

  const total = sessionIds.size;
  const counts = Object.fromEntries(PLAYER_STATUSES.map(({ key }) => [key, 0]));
  for (const sessionId of sessionIds) {
    const status = statusBySession.get(sessionId) || 'available';
    counts[status] += 1;
  }

  return {
    total,
    states: PLAYER_STATUSES.map(({ key, label }) => ({
      key,
      label,
      count: counts[key],
      percentage: total ? (counts[key] / total) * 100 : 0,
      color: PLAYER_TRAINING_ATTENDANCE_COLORS[key],
    })),
  };
};
