import { isCanonicalPlayerId } from './delegatedEventIdentity.js';

export const DELEGATED_DATA_STATUSES = ['Sin revisar', 'Revisado', 'Validado', 'Descartado'];
export const DELEGATED_DATA_FILTERS = ['Todos', ...DELEGATED_DATA_STATUSES];

export const DELEGATED_EVENT_CATALOG = [
  { type: 'gol', label: 'Goles', statKey: 'goals', icon: 'GOL', requiresPlayer: true },
  { type: 'tiro', label: 'Tiros', statKey: 'shots', icon: 'TIR', requiresPlayer: true },
  { type: 'tiro_puerta', label: 'Tiros a puerta', statKey: 'shotsOnTarget', icon: 'TAP', requiresPlayer: true },
  { type: 'regate', label: 'Regates', statKey: 'dribbles', icon: 'REG', requiresPlayer: true },
  { type: 'centro', label: 'Centros', statKey: 'crosses', icon: 'CEN', requiresPlayer: true },
  { type: 'perdida', label: 'Pérdidas', statKey: 'turnovers', icon: 'PER', requiresPlayer: true },
  { type: 'robo', label: 'Robos', statKey: 'steals', icon: 'ROB', requiresPlayer: true },
  { type: 'recuperacion', label: 'Recuperaciones', statKey: 'recoveries', icon: 'REC', requiresPlayer: true },
  { type: 'falta_realizada', label: 'Faltas realizadas', statKey: 'foulsCommitted', icon: 'FR', requiresPlayer: true },
  { type: 'falta_recibida', label: 'Faltas recibidas', statKey: 'foulsReceived', icon: 'FREC', requiresPlayer: true },
  { type: 'corner', label: 'Córners', statKey: 'corners', icon: 'COR', requiresPlayer: false },
];

const EVENT_CONTRACT_BY_TYPE = new Map(DELEGATED_EVENT_CATALOG.map((event) => [event.type, event]));
const safeArray = (value) => (Array.isArray(value) ? value : []);

export const getDelegatedEventBaseType = (eventOrType = '') => {
  const rawType = typeof eventOrType === 'string'
    ? eventOrType
    : eventOrType?.tipoEvento || eventOrType?.tipo_evento || '';
  return String(rawType).replace(/_rival$/i, '');
};

export const getDelegatedEventSide = (event = {}) => (
  event.equipo === 'rival' || /_rival$/i.test(String(event.tipoEvento || event.tipo_evento || ''))
    ? 'rival'
    : 'caudal'
);

export const isDelegatedRegistryEvent = (event = {}) => EVENT_CONTRACT_BY_TYPE.has(getDelegatedEventBaseType(event));

export const delegatedEventRequiresPlayer = (event = {}) => (
  getDelegatedEventSide(event) === 'caudal'
  && Boolean(EVENT_CONTRACT_BY_TYPE.get(getDelegatedEventBaseType(event))?.requiresPlayer)
);

export const isDelegatedEventResolvable = (event = {}) => (
  isDelegatedRegistryEvent(event)
  && (!delegatedEventRequiresPlayer(event) || isCanonicalPlayerId(
    event.playerId || event.jugadorId || event.jugador_id,
  ))
);

export const getDelegatedDataStatus = (match = {}) => {
  const quickEvents = safeArray(match.quickEvents);
  if (!quickEvents.some(isDelegatedRegistryEvent)) return 'Sin registro';
  if (DELEGATED_DATA_STATUSES.includes(match.delegatedDataStatus)) return match.delegatedDataStatus;
  return quickEvents.some((event) => isDelegatedRegistryEvent(event) && !event.reviewed) ? 'Sin revisar' : 'Revisado';
};

export const isDelegatedDataValidated = (match = {}) => getDelegatedDataStatus(match) === 'Validado';

export const getDelegatedMatchAudit = (match = {}) => {
  const events = safeArray(match.quickEvents).filter(isDelegatedRegistryEvent);
  const validated = events.filter((event) => Boolean(event.reviewed)).length;
  const pending = events.length - validated;
  const unidentifiedEvents = events.filter((event) => delegatedEventRequiresPlayer(event) && !isDelegatedEventResolvable(event));
  return {
    events,
    validated,
    pending,
    unidentified: unidentifiedEvents.length,
    unidentifiedEvents,
    validatedPercent: events.length ? Math.round((validated / events.length) * 1000) / 10 : 0,
  };
};

export const applyDelegatedMatchStatus = (match = {}, status, reviewedAt = '') => {
  if (!DELEGATED_DATA_STATUSES.includes(status)) return match;
  const shouldValidate = status === 'Validado';
  return {
    ...match,
    delegatedDataStatus: status,
    delegatedReviewedAt: status === 'Sin revisar' ? '' : reviewedAt || match.delegatedReviewedAt || '',
    quickEvents: safeArray(match.quickEvents).map((event) => (
      { ...event, reviewed: shouldValidate && isDelegatedEventResolvable(event) }
    )),
  };
};

export const getValidatedDelegatedEvents = (matches = []) => safeArray(matches)
  .filter(isDelegatedDataValidated)
  .flatMap((match) => safeArray(match.quickEvents)
    .filter((event) => isDelegatedRegistryEvent(event) && event.reviewed)
    .map((event) => ({ ...event, match })));

export const getDelegatedEventPeriod = (event = {}) => {
  const minute = Number(event.minute ?? event.minuto ?? 0);
  if (minute <= 15) return '0-15';
  if (minute <= 30) return '16-30';
  if (minute <= 45) return '31-45';
  if (minute <= 60) return '46-60';
  if (minute <= 75) return '61-75';
  return '76-90+';
};

export const filterDelegatedValidatedEvents = (events = [], {
  team = 'todos',
  playerId = '',
  eventType = 'todos',
  period = 'todos',
} = {}) => safeArray(events)
  .filter((event) => team === 'todos' || getDelegatedEventSide(event) === team)
  .filter((event) => !playerId || (event.playerId || event.jugadorId || event.jugador_id) === playerId)
  .filter((event) => eventType === 'todos' || getDelegatedEventBaseType(event) === eventType)
  .filter((event) => period === 'todos' || getDelegatedEventPeriod(event) === period);

export const getDelegatedRegistryQuality = (matches = []) => {
  const events = safeArray(matches).flatMap((match) => safeArray(match.quickEvents)
    .filter(isDelegatedRegistryEvent)
    .map((event) => ({ ...event, match })));
  const discarded = events.filter((event) => getDelegatedDataStatus(event.match) === 'Descartado').length;
  const validated = events.filter((event) => (
    getDelegatedDataStatus(event.match) === 'Validado' && event.reviewed
  )).length;
  const pending = events.filter((event) => (
    getDelegatedDataStatus(event.match) !== 'Descartado'
    && !(getDelegatedDataStatus(event.match) === 'Validado' && event.reviewed)
  )).length;
  const denominator = validated + pending;
  return {
    registered: events.length,
    validated,
    pending,
    discarded,
    percent: denominator ? Math.round((validated / denominator) * 1000) / 10 : 0,
  };
};

export const runDelegatedMatchStatusBatch = async (matchIds = [], updateMatch) => {
  const succeeded = [];
  const failed = [];
  for (const matchId of safeArray(matchIds)) {
    const result = await updateMatch(matchId);
    (result?.ok ? succeeded : failed).push(matchId);
  }
  return { succeeded, failed };
};
