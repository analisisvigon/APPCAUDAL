export const DEFAULT_GOAL_PHASE = 'Juego combinativo';

export const GOAL_PHASE_OPTIONS = {
  'Juego combinativo': ['Dentro del área', 'Fuera del área'],
  'Juego directo': ['Centro al área', 'Segunda jugada'],
  Transición: ['Tras robo', 'Tras ABP'],
  ABP: ['Córner', 'Falta directa', 'Falta con remate', 'Saque de banda', 'Penalti', 'Segunda jugada'],
};

export const getGoalSubphaseOptions = (phase) => GOAL_PHASE_OPTIONS[String(phase || '')] || [];

export const normalizeGoalTacticalContext = (context = {}, fallbackPhase = DEFAULT_GOAL_PHASE) => {
  const phase = String(context.phase || fallbackPhase || '');
  const options = getGoalSubphaseOptions(phase);
  const subphase = options.includes(context.subphase) ? context.subphase : '';
  return { phase, subphase };
};

export const updateGoalPrimaryContext = (context = {}, phase = '') => {
  const options = getGoalSubphaseOptions(phase);
  return {
    ...context,
    phase,
    subphase: options.includes(context.subphase) ? context.subphase : '',
  };
};

const numericMinute = (event) => {
  const minute = Number(event?.minute);
  return Number.isFinite(minute) ? minute : -1;
};

const eventTimestamp = (event) => {
  const timestamp = Date.parse(event?.created_at || event?.createdAt || event?.updated_at || event?.updatedAt || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const getLatestExistingGoalEvent = (events = []) => [...events]
  .filter((event) => event?.id)
  .sort((left, right) => (
    numericMinute(right) - numericMinute(left)
    || eventTimestamp(right) - eventTimestamp(left)
    || String(right.id).localeCompare(String(left.id))
  ))[0] || null;

export const getGoalModalSummaryEvent = ({ events = [], editingGoalEventId = '', draft = {} } = {}) => {
  if (!editingGoalEventId) return getLatestExistingGoalEvent(events);
  return events.some((event) => event?.id === editingGoalEventId) ? draft : null;
};
