const rows = (value) => Array.isArray(value) ? value : [];
const clean = (value) => String(value ?? '').trim();

const countField = (actions, field) => {
  const counts = new Map();
  rows(actions).forEach((action) => {
    const value = clean(action?.[field]);
    if (!value) return;
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'es'));
};

export const buildPlayerBodyPartSummary = (goalActions = []) => {
  const actions = rows(goalActions);
  const values = countField(actions, 'contact');
  const known = values.reduce((total, row) => total + row.count, 0);
  return { values, known, missing: Math.max(0, actions.length - known), total: actions.length };
};

export const buildPlayerGoalTypeSummary = (goalActions = []) => ({
  phases: countField(goalActions, 'phase'),
  subphases: countField(goalActions, 'subphase'),
});

export const buildPlayerGoalTargetSummary = (goalActions = []) => {
  const actions = rows(goalActions);
  const values = countField(actions, 'goalZone');
  const known = values.reduce((total, row) => total + row.count, 0);
  return { values, known, missing: Math.max(0, actions.length - known), total: actions.length };
};

export const buildPlayerConnectionRows = ({ goalActions = [], assistActions = [], filter = 'Todos' } = {}) => {
  const includeGoals = filter !== 'Asistencias';
  const includeAssists = filter !== 'Goles';
  const connections = new Map();
  const ensure = (name) => {
    if (!connections.has(name)) connections.set(name, { name, given: 0, received: 0, total: 0 });
    return connections.get(name);
  };

  if (includeGoals) {
    rows(goalActions).forEach((action) => {
      const name = clean(action?.assistant);
      if (!name) return;
      const row = ensure(name);
      row.received += 1;
      row.total += 1;
    });
  }
  if (includeAssists) {
    rows(assistActions).forEach((action) => {
      const name = clean(action?.scorer);
      if (!name) return;
      const row = ensure(name);
      row.given += 1;
      row.total += 1;
    });
  }

  return [...connections.values()]
    .sort((left, right) => right.total - left.total || left.name.localeCompare(right.name, 'es'));
};

export const getPlayerInfluenceActions = ({ goalActions = [], assistActions = [], filter = 'Todos' } = {}) => {
  if (filter === 'Goles') return rows(goalActions);
  if (filter === 'Asistencias') return rows(assistActions);
  return [...rows(goalActions), ...rows(assistActions)];
};

export const buildPlayerProductionAction = (action = {}) => ({
  ...action,
  type: clean(action.type || action.action),
  minute: clean(action.minute),
  opponent: clean(action.opponent || action.match?.opponent),
  competition: clean(action.competition),
  date: clean(action.date),
  result: clean(action.result),
  phase: clean(action.phase),
  subphase: clean(action.subphase),
  shotZone: clean(action.shotZone),
  assistZone: clean(action.assistZone),
  goalZone: clean(action.goalZone),
  contact: clean(action.contact),
  scorer: clean(action.scorer),
  assistant: clean(action.assistant),
  videoUrl: clean(action.videoUrl || action.url),
  createdAt: clean(action.createdAt),
});
