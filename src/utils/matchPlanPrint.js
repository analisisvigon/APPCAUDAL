import {
  cloneSetPieceElementsWithFreshIds,
  createDefaultSetPieceTacticalMeta,
  getSetPieceTacticalMeta,
  setSetPieceTacticalMeta,
} from './setPieceProfessional.js';

export const MATCH_PLAN_PHASES = Object.freeze({
  WITHOUT_BALL: 'sin_balon',
  WITH_BALL: 'con_balon',
});

export const MATCH_PLAN_TYPES = Object.freeze({
  [MATCH_PLAN_PHASES.WITHOUT_BALL]: 'plan_partido_sin_balon',
  [MATCH_PLAN_PHASES.WITH_BALL]: 'plan_partido_con_balon',
});

export const MATCH_PLAN_TACTICAL_LABELS = Object.freeze([
  'POR', 'LD', 'DFC', 'LI', 'CAD', 'CAI', 'MCD', 'MC', 'MP', 'ED', 'EI', 'DC',
]);

export const MATCH_PLAN_TYPE_VALUES = Object.freeze(Object.values(MATCH_PLAN_TYPES));

const createId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
};

export const getMatchPlanPhase = (situation = {}) => (
  situation.phase
  || Object.entries(MATCH_PLAN_TYPES).find(([, type]) => type === situation.tipo)?.[0]
  || MATCH_PLAN_PHASES.WITHOUT_BALL
);

export const getMatchPlanPhaseLabel = (situation = {}) => (
  getMatchPlanPhase(situation) === MATCH_PLAN_PHASES.WITH_BALL ? 'CON BALÓN' : 'SIN BALÓN'
);

const createMatchPlanMeta = () => ({
  ...createDefaultSetPieceTacticalMeta(),
  printIdentityMode: 'abbreviation',
  displayLayers: {
    dorsals: false,
    abbreviations: true,
    roles: false,
    chronology: false,
    zones: true,
    texts: true,
  },
  objective: '',
  collectiveInstructions: [],
});

export const createMatchPlanSituation = ({ phase = MATCH_PLAN_PHASES.WITHOUT_BALL, order = 1, title = '' } = {}) => ({
  id: createId(),
  partido_id: '',
  tipo: MATCH_PLAN_TYPES[phase] || MATCH_PLAN_TYPES[MATCH_PLAN_PHASES.WITHOUT_BALL],
  phase,
  orden: order,
  titulo: title,
  consigna: '',
  elements: setSetPieceTacticalMeta([], createMatchPlanMeta()),
  persisted: false,
});

export const normalizeMatchPlanSituations = (situations = [], partidoId = '') => (
  (Array.isArray(situations) ? situations : [])
    .filter((situation) => MATCH_PLAN_TYPE_VALUES.includes(situation?.tipo))
    .map((situation, index) => ({
      ...situation,
      id: situation.id || createId(),
      partido_id: situation.partido_id || partidoId,
      phase: getMatchPlanPhase(situation),
      orden: Number(situation.orden || index + 1),
      titulo: String(situation.titulo || '').trim(),
      consigna: String(situation.consigna || ''),
      elements: setSetPieceTacticalMeta(situation.elements, getSetPieceTacticalMeta(situation.elements)),
      persisted: Boolean(situation.persisted ?? situation.id),
    }))
    .sort((a, b) => a.orden - b.orden || String(a.id).localeCompare(String(b.id)))
    .map((situation, index) => ({ ...situation, orden: index + 1 }))
);

export const updateMatchPlanSituationMeta = (situation, patch) => {
  const current = getSetPieceTacticalMeta(situation?.elements);
  return {
    ...situation,
    elements: setSetPieceTacticalMeta(situation?.elements, { ...current, ...patch }),
  };
};

export const getMatchPlanInstructions = (situation) => getSetPieceTacticalMeta(situation?.elements).collectiveInstructions;

export const duplicateMatchPlanSituation = (situation, order) => ({
  ...situation,
  id: createId(),
  orden: order,
  titulo: `${situation.titulo || 'Situación táctica'} copia`,
  elements: cloneSetPieceElementsWithFreshIds(situation.elements),
  created_at: undefined,
  updated_at: undefined,
  persisted: false,
});

export const reorderMatchPlanSituations = (situations = [], id, direction) => {
  const ordered = normalizeMatchPlanSituations(situations);
  const index = ordered.findIndex((situation) => situation.id === id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) return ordered;
  const next = [...ordered];
  const [situation] = next.splice(index, 1);
  next.splice(nextIndex, 0, situation);
  return next.map((item, itemIndex) => ({ ...item, orden: itemIndex + 1 }));
};

export const buildMatchPlanPages = (situations = []) => {
  const ordered = normalizeMatchPlanSituations(situations);
  const pages = [];
  for (let index = 0; index < ordered.length; index += 2) {
    pages.push({ pageNumber: pages.length + 1, situations: ordered.slice(index, index + 2) });
  }
  return pages;
};

export const getMatchPlanPageCount = (situations = []) => buildMatchPlanPages(situations).length;

export const buildMatchPlanPersistencePayload = (situation, partidoId, order) => ({
  ...(situation.id ? { id: situation.id } : {}),
  partido_id: partidoId,
  tipo: MATCH_PLAN_TYPES[getMatchPlanPhase(situation)],
  titulo: String(situation.titulo || '').trim() || null,
  consigna: null,
  orden: order,
  elements: Array.isArray(situation.elements) ? situation.elements : [],
});

export const buildMatchPrintPlanSnapshot = (situations = [], partidoId = '') => ({
  p_partido_id: partidoId,
  p_situations: normalizeMatchPlanSituations(situations, partidoId).map((situation, index) => (
    buildMatchPlanPersistencePayload(situation, partidoId, index + 1)
  )),
});
