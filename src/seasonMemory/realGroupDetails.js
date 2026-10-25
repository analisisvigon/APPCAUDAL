import { buildGroupGoalMapModel, getTiedTopGoalBuckets } from '../utils/groupAnalysisStats.js';

// Son los seis tramos usados por Análisis Grupal para goles oficiales.
export const GOAL_TIME_BUCKETS = Object.freeze(['0-15', '15-30', '30-45', '45-60', '60-75', '75-90']);
export const FIELD_ZONES = Object.freeze([
  'finalizacion_izquierda', 'finalizacion_centro', 'finalizacion_derecha',
  'creacion_izquierda', 'creacion_centro', 'creacion_derecha',
  'inicio_izquierda', 'inicio_centro', 'inicio_derecha',
]);
export const GOAL_ZONES = Object.freeze([
  'alta_izquierda', 'alta_centro', 'alta_derecha',
  'media_izquierda', 'media_centro', 'media_derecha',
  'baja_izquierda', 'baja_centro', 'baja_derecha',
]);
const fieldAliases = {
  arriba_izquierda: FIELD_ZONES[0], arriba_centro: FIELD_ZONES[1], arriba_derecha: FIELD_ZONES[2],
  medio_izquierda: FIELD_ZONES[3], medio_centro: FIELD_ZONES[4], medio_derecha: FIELD_ZONES[5],
  bajo_izquierda: FIELD_ZONES[6], bajo_centro: FIELD_ZONES[7], bajo_derecha: FIELD_ZONES[8],
};
const goalAliases = {
  high_left: GOAL_ZONES[0], high_center: GOAL_ZONES[1], high_right: GOAL_ZONES[2],
  middle_left: GOAL_ZONES[3], middle_center: GOAL_ZONES[4], middle_right: GOAL_ZONES[5],
  low_left: GOAL_ZONES[6], low_center: GOAL_ZONES[7], low_right: GOAL_ZONES[8],
};
const token = (value) => String(value || '').trim().toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
export const fieldZone = (value) => {
  const key = token(value).replace(/^f_/, '');
  return FIELD_ZONES.includes(key) ? key : fieldAliases[key] || null;
};
export const goalZone = (value) => {
  const key = token(value);
  return GOAL_ZONES.includes(key) ? key : goalAliases[key] || null;
};
export const goalBucket = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const match = String(value).trim().match(/^(\d{1,3})(?:\+\d{1,2})?$/);
  if (!match) return null;
  const minute = Math.max(0, Math.min(90, Number(match[1])));
  return GOAL_TIME_BUCKETS[Math.min(5, Math.max(0, Math.ceil(minute / 15) - 1))];
};
const map = (goals, side, field, normalize) => buildGroupGoalMapModel({ goals, side, field, normalize });

export function buildRealGroupDetails(goals, matchCards = [], completeMatches = 0) {
  const intervals = GOAL_TIME_BUCKETS.map((range) => ({ range,
    forCount: goals.filter((goal) => goal.teamSide === 'for' && goalBucket(goal.minute) === range).length,
    againstCount: goals.filter((goal) => goal.teamSide === 'against' && goalBucket(goal.minute) === range).length,
  }));
  const withMinute = goals.filter((goal) => goalBucket(goal.minute)).length;
  const forGoals = goals.filter((goal) => goal.teamSide === 'for').length;
  const againstGoals = goals.length - forGoals;
  const setPieces = ['for', 'against'].map((side) => {
    const rows = goals.filter((goal) => goal.teamSide === side && goal.goalContext === 'ABP');
    const counts = new Map();
    rows.forEach((goal) => { const key = goal.subphase || 'Sin subtipo'; counts.set(key, (counts.get(key) || 0) + 1); });
    return { side, total: rows.length, rows: [...counts].map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es')) };
  });
  const systems = new Map();
  for (const card of matchCards) {
    if (!card.formation || !card.match.result) continue;
    const previous = systems.get(card.formation) || { system: card.formation, played: 0, wins: 0, draws: 0, losses: 0 };
    previous.played++;
    previous[card.match.outcome === 'win' ? 'wins' : card.match.outcome === 'draw' ? 'draws' : 'losses']++;
    systems.set(card.formation, previous);
  }
  const systemRows = [...systems.values()].sort((a, b) => b.played - a.played || a.system.localeCompare(b.system));
  const trends = completeMatches >= 3 && withMinute === goals.length
    ? ['forCount', 'againstCount'].flatMap((field) => getTiedTopGoalBuckets(intervals, field)
      .map((row) => ({ side: field === 'forCount' ? 'for' : 'against', range: row.range, count: row[field] }))) : [];
  return { intervals, withMinute, forGoals, againstGoals, setPieces, systems: systemRows,
    systemCoverage: { verified: systemRows.reduce((sum, row) => sum + row.played, 0),
      eligible: matchCards.filter((card) => card.match.result).length },
    trends,
    assist: { for: map(goals.filter((goal) => goal.assistant), 'for', 'creationZone', fieldZone),
      against: map(goals, 'against', 'creationZone', fieldZone) },
    finish: { for: map(goals, 'for', 'finishZone', fieldZone),
      against: map(goals, 'against', 'finishZone', fieldZone) },
    mouth: { for: map(goals, 'for', 'goalMouthZone', goalZone),
      against: map(goals, 'against', 'goalMouthZone', goalZone) },
  };
}
