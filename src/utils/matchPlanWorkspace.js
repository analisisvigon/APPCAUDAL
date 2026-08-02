export const MATCH_PLAN_PHASES = Object.freeze([
  { key: 'with_ball', label: 'Con balón', boardPhase: 'offensive' },
  { key: 'without_ball', label: 'Sin balón', boardPhase: 'defensive' },
  { key: 'transition', label: 'Transición', boardPhase: 'transition' },
  { key: 'set_piece', label: 'ABP', boardPhase: 'set_piece' },
]);

export const MATCH_PLAN_PRIORITIES = Object.freeze(['Crítica', 'Alta', 'Media', 'Baja']);
export const MATCH_PLAN_EXECUTIVE_FIELDS = Object.freeze(['objective', 'attackPriority', 'defensePriority', 'mainRisk']);

const clean = (value) => String(value ?? '').trim();
const safeArray = (value) => Array.isArray(value) ? value : [];

const stableHash = (value) => {
  let hash = 0;
  for (const character of String(value || '')) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return Math.abs(hash).toString(36);
};

const stableCardId = (phase, action, index) => `plan-${phase}-${stableHash(`${action}:${index}`)}`;

const normalizePriority = (value) => ({
  Importante: 'Alta',
  Opcional: 'Baja',
}[value] || (MATCH_PLAN_PRIORITIES.includes(value) ? value : 'Media'));

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

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const normalizeCard = (card, phase, index, defaults = {}) => {
  const source = typeof card === 'string' ? { action: card } : (card || {});
  const action = clean(source.action || source.text || source.title) || 'Nueva consigna';
  return {
    id: clean(source.id) || stableCardId(phase, action, index),
    action,
    priority: normalizePriority(source.priority),
    impact: clean(hasOwn(source, 'impact') ? source.impact : defaults.impact),
    explanation: clean(hasOwn(source, 'explanation') ? source.explanation : defaults.explanation),
    sources: normalizeSources(hasOwn(source, 'sources') ? source.sources : undefined, hasOwn(source, 'sources') ? [] : defaults.sources),
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
  const sourceExecutiveStates = source.executiveStates || {};
  const storedCardExecution = source.live?.cardExecution && typeof source.live.cardExecution === 'object'
    ? source.live.cardExecution
    : {};
  const legacyExecutedCards = MATCH_PLAN_PHASES.flatMap(({ key }) => phases[key])
    .filter((card) => card.executed)
    .map((card) => [card.id, { executed: true, priority: '', observation: '', updatedAt: '' }]);
  const cardExecution = Object.fromEntries([
    ...legacyExecutedCards,
    ...Object.entries(storedCardExecution).map(([cardId, execution]) => [cardId, {
      executed: Boolean(execution?.executed),
      priority: execution?.priority ? normalizePriority(execution.priority) : '',
      observation: clean(execution?.observation),
      updatedAt: clean(execution?.updatedAt),
    }]),
  ]);

  return {
    version: 1,
    executive: {
      objective: clean(sourceExecutive.objective ?? seedExecutive.objective),
      attackPriority: clean(sourceExecutive.attackPriority ?? seedExecutive.attackPriority),
      defensePriority: clean(sourceExecutive.defensePriority ?? seedExecutive.defensePriority),
      mainRisk: clean(sourceExecutive.mainRisk ?? seedExecutive.mainRisk),
    },
    executiveStates: Object.fromEntries(MATCH_PLAN_EXECUTIVE_FIELDS.map((field) => [
      field,
      ['pending', 'validated', 'discarded'].includes(sourceExecutiveStates[field]) ? sourceExecutiveStates[field] : 'pending',
    ])),
    phases,
    checklist: normalizeChecklist(hasStoredWorkspace ? source.checklist : (seed.checklist || defaultChecklist)),
    live: {
      planBActive: Boolean(source.live?.planBActive),
      cardExecution,
    },
    updatedAt: clean(source.updatedAt),
  };
};

export const moveMatchPlanChecklistItem = (workspace, itemId, targetId) => {
  const rows = safeArray(workspace?.checklist);
  const sourceIndex = rows.findIndex((item) => item.id === itemId);
  const targetIndex = rows.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return workspace;
  const nextRows = [...rows];
  const [item] = nextRows.splice(sourceIndex, 1);
  nextRows.splice(targetIndex, 0, item);
  return { ...workspace, checklist: nextRows };
};

const importOriginLabel = (type) => {
  const normalized = clean(type).toLowerCase();
  if (normalized === 'player_profile') return 'Jugadores';
  if (normalized === 'collective_profile') return 'Rival';
  if (['tactical_play', 'tactical_play_description', 'board_evidence', 'tactical_connection'].includes(normalized)) return 'Pizarra';
  return 'Evidencias';
};

export const buildMatchPlanImportCandidates = ({ phase, insight = {}, plays = [] } = {}) => {
  const candidates = [];
  const proposedAction = clean(insight.proposedAction);
  if (proposedAction && !/registrar y validar|información insuficiente/i.test(proposedAction)) {
    const sourceRows = safeArray(insight.sources);
    candidates.push({
      id: `recommendation-${stableHash(`${phase}:${proposedAction}`)}`,
      action: proposedAction,
      impact: clean(insight.conclusion),
      explanation: safeArray(insight.evidence).map(clean).filter(Boolean).join(' · '),
      sources: normalizeSources(sourceRows, ['Evidencias']),
      origins: [...new Set(sourceRows.length ? sourceRows.map((source) => importOriginLabel(source?.type)) : ['Evidencias'])],
      playId: '',
    });
  }
  safeArray(plays).forEach((play) => {
    const action = clean(play.description || play.name || play.title);
    if (!action) return;
    candidates.push({
      id: `play-${clean(play.id) || stableHash(`${phase}:${action}`)}`,
      action,
      impact: '',
      explanation: '',
      sources: ['Pizarra'],
      origins: ['Pizarra'],
      playId: clean(play.id),
    });
  });
  return candidates.filter((candidate, index, rows) => (
    rows.findIndex((row) => row.action.toLocaleLowerCase('es') === candidate.action.toLocaleLowerCase('es') && row.playId === candidate.playId) === index
  ));
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

export const moveMatchPlanCardByOffset = (workspace, phase, cardId, offset) => {
  const rows = workspace?.phases?.[phase];
  if (!Array.isArray(rows) || !Number.isInteger(offset) || offset === 0) return workspace;
  const sourceIndex = rows.findIndex((card) => card.id === cardId);
  if (sourceIndex < 0) return workspace;
  const sourcePlan = rows[sourceIndex].plan;
  const visibleIndexes = rows.reduce((indexes, card, index) => (
    card.plan === sourcePlan ? [...indexes, index] : indexes
  ), []);
  const visibleIndex = visibleIndexes.indexOf(sourceIndex);
  const targetIndex = visibleIndexes[visibleIndex + offset];
  if (targetIndex === undefined) return workspace;
  const nextRows = [...rows];
  [nextRows[sourceIndex], nextRows[targetIndex]] = [nextRows[targetIndex], nextRows[sourceIndex]];
  return { ...workspace, phases: { ...workspace.phases, [phase]: nextRows } };
};

export const duplicateMatchPlanCard = (workspace, phase, cardId, duplicateId) => {
  const rows = workspace?.phases?.[phase];
  if (!Array.isArray(rows)) return workspace;
  const sourceIndex = rows.findIndex((card) => card.id === cardId);
  if (sourceIndex < 0 || !clean(duplicateId) || rows.some((card) => card.id === duplicateId)) return workspace;
  const sourceCard = rows[sourceIndex];
  const duplicate = {
    ...sourceCard,
    id: duplicateId,
    action: `${sourceCard.action} (copia)`,
    status: 'draft',
    playId: '',
    executed: false,
  };
  const nextRows = [...rows];
  nextRows.splice(sourceIndex + 1, 0, duplicate);
  return { ...workspace, phases: { ...workspace.phases, [phase]: nextRows } };
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
