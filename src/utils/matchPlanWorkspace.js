export const MATCH_PLAN_PHASES = Object.freeze([
  { key: 'with_ball', label: 'Con balón', boardPhase: 'offensive' },
  { key: 'without_ball', label: 'Sin balón', boardPhase: 'defensive' },
  { key: 'transition', label: 'Transición', boardPhase: 'transition' },
  { key: 'set_piece', label: 'ABP', boardPhase: 'set_piece' },
]);

const clean = (value) => String(value ?? '').trim();
const safeArray = (value) => Array.isArray(value) ? value : [];

const stableHash = (value) => {
  let hash = 0;
  for (const character of String(value || '')) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return Math.abs(hash).toString(36);
};

const stableCardId = (phase, action, index) => `plan-${phase}-${stableHash(`${action}:${index}`)}`;

const sourceTypeLabel = (type) => ({
  tactical_play: 'Pizarra',
  tactical_play_description: 'Pizarra',
  board_evidence: 'Pizarra',
  tactical_connection: 'Conexiones',
  player_profile: 'Perfil',
  collective_profile: 'Perfil',
  evidence: 'Evidencias',
  video: 'Vídeo',
  staff: 'Staff',
  tactical_question: 'Staff',
}[clean(type).toLowerCase()] || 'Evidencias');

const normalizeSources = (sources, fallback = ['Staff']) => {
  const rows = safeArray(sources).map((source) => (
    source && typeof source === 'object' ? sourceTypeLabel(source.type) : clean(source)
  )).filter(Boolean);
  return [...new Set(rows.length ? rows : fallback)];
};

const normalizeCard = (card, phase, index, defaults = {}) => {
  const source = typeof card === 'string' ? { action: card } : (card || {});
  const action = clean(source.action || source.text || source.title) || 'Nueva consigna';
  return {
    id: clean(source.id) || stableCardId(phase, action, index),
    action,
    priority: ['Crítica', 'Importante', 'Opcional'].includes(source.priority) ? source.priority : 'Importante',
    impact: clean(source.impact || defaults.impact),
    explanation: clean(source.explanation || defaults.explanation),
    sources: normalizeSources(source.sources, defaults.sources),
    status: ['draft', 'confirmed', 'discarded'].includes(source.status) ? source.status : 'draft',
    plan: source.plan === 'B' ? 'B' : 'A',
    playId: clean(source.playId),
    executed: Boolean(source.executed),
  };
};

const normalizeChecklist = (rows) => safeArray(rows).map((row, index) => {
  const source = typeof row === 'string' ? { text: row } : (row || {});
  const text = clean(source.text || source.label) || 'Nuevo punto';
  return {
    id: clean(source.id) || `check-${stableHash(`${text}:${index}`)}`,
    text,
    checked: Boolean(source.checked),
  };
});

const defaultChecklist = [
  'Objetivo principal validado',
  'Prioridades comunicadas al equipo',
  'ABP revisada',
  'Plan B preparado',
];

export const createMatchPlanWorkspace = ({ stored, seed = {} } = {}) => {
  const hasStoredWorkspace = stored && typeof stored === 'object' && Number(stored.version) === 1;
  const source = hasStoredWorkspace ? stored : {};
  const seedExecutive = seed.executive || {};
  const sourceExecutive = source.executive || {};
  const insights = seed.insights || {};
  const phases = Object.fromEntries(MATCH_PLAN_PHASES.map(({ key, label }) => {
    const insight = insights[label] || {};
    const defaults = {
      impact: clean(insight.proposedAction),
      explanation: /información insuficiente/i.test(clean(insight.conclusion)) ? '' : clean(insight.conclusion),
      sources: normalizeSources(insight.sources),
    };
    const rows = hasStoredWorkspace ? source.phases?.[key] : seed.phases?.[key];
    return [key, safeArray(rows).map((card, index) => normalizeCard(card, key, index, defaults))];
  }));

  return {
    version: 1,
    executive: {
      objective: clean(sourceExecutive.objective ?? seedExecutive.objective),
      attackPriority: clean(sourceExecutive.attackPriority ?? seedExecutive.attackPriority),
      defensePriority: clean(sourceExecutive.defensePriority ?? seedExecutive.defensePriority),
      mainRisk: clean(sourceExecutive.mainRisk ?? seedExecutive.mainRisk),
    },
    phases,
    checklist: normalizeChecklist(hasStoredWorkspace ? source.checklist : (seed.checklist || defaultChecklist)),
    live: {
      planBActive: Boolean(source.live?.planBActive),
    },
    updatedAt: clean(source.updatedAt),
  };
};

export const moveMatchPlanCard = (workspace, fromPhase, cardId, toPhase, targetId = '') => {
  if (!workspace?.phases?.[fromPhase] || !workspace?.phases?.[toPhase]) return workspace;
  const sourceRows = [...workspace.phases[fromPhase]];
  const sourceIndex = sourceRows.findIndex((card) => card.id === cardId);
  if (sourceIndex < 0) return workspace;
  const [sourceCard] = sourceRows.splice(sourceIndex, 1);
  const card = fromPhase === toPhase ? sourceCard : { ...sourceCard, playId: '' };
  const destinationRows = fromPhase === toPhase ? sourceRows : [...workspace.phases[toPhase]];
  const targetIndex = targetId ? destinationRows.findIndex((row) => row.id === targetId) : -1;
  destinationRows.splice(targetIndex < 0 ? destinationRows.length : targetIndex, 0, card);
  return {
    ...workspace,
    phases: {
      ...workspace.phases,
      [fromPhase]: fromPhase === toPhase ? destinationRows : sourceRows,
      [toPhase]: destinationRows,
    },
  };
};

export const serializeMatchPlanLegacyFields = (workspace) => {
  const activeActions = (phase) => safeArray(workspace?.phases?.[phase])
    .filter((card) => card.status !== 'discarded')
    .map((card) => clean(card.action))
    .filter(Boolean)
    .join('\n');
  return {
    planObjetivo: clean(workspace?.executive?.objective),
    planConBalon: activeActions('with_ball'),
    planSinBalon: activeActions('without_ball'),
    planTransiciones: activeActions('transition'),
    prePlanAvoid: clean(workspace?.executive?.mainRisk),
  };
};
