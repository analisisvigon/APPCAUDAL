import { hasGoalAssistant } from './goalEvents.js';

export const GROUP_GOAL_CONTEXTS = Object.freeze([
  'Juego combinativo',
  'Juego directo',
  'Transición',
  'ABP',
]);

export const splitGroupGoals = (goals = []) => {
  const allGoals = Array.isArray(goals) ? goals.filter(Boolean) : [];
  const goalsFor = allGoals.filter((goal) => goal.teamSide === 'for');
  const goalsAgainst = allGoals.filter((goal) => goal.teamSide === 'against');
  return { goalsFor, goalsAgainst, allGoals };
};

export const buildGroupGoalTypeRows = (goals = []) => {
  const { goalsFor, goalsAgainst } = splitGroupGoals(goals);
  return [...GROUP_GOAL_CONTEXTS, 'Sin clasificar'].map((context) => {
    const matchesContext = (goal) => (goal.goalContext || 'Sin clasificar') === context;
    return {
      context,
      forCount: goalsFor.filter(matchesContext).length,
      againstCount: goalsAgainst.filter(matchesContext).length,
    };
  });
};

export const countGroupGoalZones = (goals = [], field, normalize = (value) => value) =>
  (Array.isArray(goals) ? goals : []).reduce((counts, goal) => {
    const value = goal?.[field];
    if (!value) return counts;
    const normalized = normalize(value);
    if (!normalized) return counts;
    counts[normalized] = (counts[normalized] || 0) + 1;
    return counts;
  }, {});

export const buildGroupGoalMapModel = ({ goals = [], side = 'for', field, normalize = (value) => value } = {}) => {
  const selectedGoals = (Array.isArray(goals) ? goals : []).filter((goal) => goal?.teamSide === side);
  const counts = countGroupGoalZones(selectedGoals, field, normalize);
  const withZone = Object.values(counts).reduce((sum, count) => sum + Number(count || 0), 0);
  return {
    side,
    field,
    goals: selectedGoals,
    counts,
    total: selectedGoals.length,
    withZone,
    missing: Math.max(0, selectedGoals.length - withZone),
  };
};

export const buildGroupGoalCoverage = (goals = []) => {
  const { goalsFor, goalsAgainst, allGoals } = splitGroupGoals(goals);
  return {
    total: allGoals.length,
    withContext: allGoals.filter((goal) => goal.goalContext).length,
    withFinishZone: allGoals.filter((goal) => goal.finishZone).length,
    withGoalZone: allGoals.filter((goal) => goal.goalMouthZone).length,
    withAssist: goalsFor.filter(hasGoalAssistant).length,
    forGoals: goalsFor.length,
    againstGoals: goalsAgainst.length,
  };
};

const SET_PIECE_ORDER = Object.freeze([
  'Córner',
  'Falta directa',
  'Falta con remate',
  'Penalti',
  'Segunda jugada',
  'Sin subtipo',
]);

export const buildGroupSetPieceSummary = (goals = []) => {
  const setPieceGoals = (Array.isArray(goals) ? goals : []).filter((goal) => goal.goalContext === 'ABP');
  const counts = setPieceGoals.reduce((acc, goal) => {
    const subtype = String(goal.subphase || '').trim() || 'Sin subtipo';
    acc[subtype] = (acc[subtype] || 0) + 1;
    return acc;
  }, {});
  const visibleLabels = Array.from(new Set(['Córner', 'Falta directa', 'Penalti', ...Object.keys(counts)]));
  const subtypeRows = visibleLabels
    .map((label) => ({ label, count: counts[label] || 0 }))
    .sort((a, b) => {
      const indexA = SET_PIECE_ORDER.indexOf(a.label);
      const indexB = SET_PIECE_ORDER.indexOf(b.label);
      const orderA = indexA === -1 ? SET_PIECE_ORDER.length : indexA;
      const orderB = indexB === -1 ? SET_PIECE_ORDER.length : indexB;
      return orderA - orderB || a.label.localeCompare(b.label);
    });
  return {
    total: setPieceGoals.length,
    subtypeRows,
    subtypeTotal: subtypeRows.reduce((sum, row) => sum + row.count, 0),
  };
};

export const getTiedTopGoalBuckets = (rows = [], field) => {
  const populated = (Array.isArray(rows) ? rows : []).filter((row) => Number(row?.[field] || 0) > 0);
  if (!populated.length) return [];
  const max = Math.max(...populated.map((row) => Number(row[field] || 0)));
  return populated.filter((row) => Number(row[field] || 0) === max);
};

export const buildScoringEfficiencyRows = (rows = [], minimumMinutes = 90) =>
  (Array.isArray(rows) ? rows : [])
    .filter((row) => Number(row.minutes || 0) >= minimumMinutes && Number(row.goals || 0) > 0)
    .map((row) => ({
      ...row,
      minutesPerGoal: Number(row.minutes) / Number(row.goals),
      goalsPer90: (Number(row.goals) / Number(row.minutes)) * 90,
    }))
    .sort((a, b) => b.goalsPer90 - a.goalsPer90 || a.minutesPerGoal - b.minutesPerGoal)
    .slice(0, 5);

export const getGroupGoalInvariantReport = (goals = []) => {
  const { goalsFor, goalsAgainst, allGoals } = splitGroupGoals(goals);
  const typeRows = buildGroupGoalTypeRows(allGoals);
  return {
    goalsFor: goalsFor.length,
    goalsAgainst: goalsAgainst.length,
    allGoals: allGoals.length,
    typesFor: typeRows.reduce((sum, row) => sum + row.forCount, 0),
    typesAgainst: typeRows.reduce((sum, row) => sum + row.againstCount, 0),
    valid:
      allGoals.length === goalsFor.length + goalsAgainst.length
      && typeRows.reduce((sum, row) => sum + row.forCount, 0) === goalsFor.length
      && typeRows.reduce((sum, row) => sum + row.againstCount, 0) === goalsAgainst.length,
  };
};
