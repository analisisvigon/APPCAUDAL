import { DELEGATED_EVENT_STAT_EFFECTS } from './delegatedEventSaveFlow.js';
import { getDelegatedEventPlayerId, normalizeDelegatedPlayerName } from './delegatedEventIdentity.js';
import {
  DELEGATED_EVENT_CATALOG,
  filterDelegatedValidatedEvents,
  getDelegatedEventPeriod,
  getDelegatedEventSide,
  getValidatedDelegatedEvents,
  isDelegatedDataValidated,
} from './delegatedMatchValidation.js';

export const DELEGATED_STAT_FIELDS = [
  { key: 'goals', label: 'Goles', short: 'G' },
  { key: 'shots', label: 'Tiros', short: 'T' },
  { key: 'shotsOnTarget', label: 'Tiros a puerta', short: 'TAP' },
  { key: 'dribbles', label: 'Regates', short: 'REG' },
  { key: 'crosses', label: 'Centros', short: 'CEN' },
  { key: 'turnovers', label: 'Pérdidas', short: 'PER' },
  { key: 'steals', label: 'Robos', short: 'ROB' },
  { key: 'recoveries', label: 'Recuperaciones', short: 'REC' },
  { key: 'corners', label: 'Córners', short: 'COR', teamOnly: true },
  { key: 'foulsCommitted', label: 'Faltas realizadas', short: 'FR' },
  { key: 'foulsReceived', label: 'Faltas recibidas', short: 'FREC' },
];

export const DELEGATED_PLAYER_STAT_FIELDS = DELEGATED_STAT_FIELDS.filter((field) => !field.teamOnly);
export const DELEGATED_PERIODS = ['0-15', '16-30', '31-45', '46-60', '61-75', '76-90+'];
export const DELEGATED_EVOLUTION_SCOPES = ['5', '10', 'season'];

const safeArray = (value) => (Array.isArray(value) ? value : []);
const safeObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

export const createEmptyDelegatedStats = () => DELEGATED_STAT_FIELDS.reduce(
  (stats, field) => ({ ...stats, [field.key]: 0 }),
  {},
);

export const aggregateDelegatedStats = (events = [], { scope = 'team' } = {}) => {
  const stats = createEmptyDelegatedStats();
  safeArray(events).forEach((event) => {
    const eventType = DELEGATED_EVENT_CATALOG.find((item) => item.type === (
      event.tipoEvento || event.tipo_evento || ''
    ).replace(/_rival$/i, ''))?.type;
    const effects = eventType ? DELEGATED_EVENT_STAT_EFFECTS[eventType]?.[scope] : null;
    Object.entries(safeObject(effects)).forEach(([key, value]) => {
      stats[key] = (Number(stats[key]) || 0) + (Number(value) || 0);
    });
  });
  return stats;
};

export const calculateDelegatedDerivedStats = (stats = {}) => ({
  shotAccuracy: Number(stats.shots) > 0 ? round((Number(stats.shotsOnTarget) / Number(stats.shots)) * 100) : null,
  shotEffectiveness: Number(stats.shots) > 0 ? round((Number(stats.goals) / Number(stats.shots)) * 100) : null,
  onTargetEffectiveness: Number(stats.shotsOnTarget) > 0
    ? round((Number(stats.goals) / Number(stats.shotsOnTarget)) * 100)
    : null,
  registeredDefensiveActions: Number(stats.steals || 0) + Number(stats.recoveries || 0),
  recoveryBalance: Number(stats.steals || 0) + Number(stats.recoveries || 0) - Number(stats.turnovers || 0),
});

export const buildDelegatedStatsDataset = ({ matches = [], filters = {} } = {}) => {
  const scopedMatches = safeArray(matches).filter((match) => !filters.matchId || match.id === filters.matchId);
  const validatedMatches = scopedMatches.filter(isDelegatedDataValidated);
  const validatedEvents = getValidatedDelegatedEvents(validatedMatches);
  const events = filterDelegatedValidatedEvents(validatedEvents, {
    team: filters.team || 'todos',
    playerId: filters.playerId || '',
    eventType: filters.eventType || 'todos',
    period: filters.period || 'todos',
  });
  return { matches: scopedMatches, validatedMatches, events };
};

export const aggregateDelegatedSides = (events = []) => ({
  caudal: aggregateDelegatedStats(safeArray(events).filter((event) => getDelegatedEventSide(event) === 'caudal')),
  rival: aggregateDelegatedStats(safeArray(events).filter((event) => getDelegatedEventSide(event) === 'rival')),
  hasCaudal: safeArray(events).some((event) => getDelegatedEventSide(event) === 'caudal'),
  hasRival: safeArray(events).some((event) => getDelegatedEventSide(event) === 'rival'),
});

const getPlayerName = (player = {}) => String(player.name || player.playerName || player.player_name || '').trim();

const getMatchPlayerStatsEntry = (match = {}, player = {}) => {
  const playerId = String(player.id || player.playerId || player.jugadorId || '');
  const normalizedName = normalizeDelegatedPlayerName(getPlayerName(player));
  const entries = Object.entries(safeObject(match.statsPlayerData));
  const idMatch = entries.find(([, row]) => String(row?.jugadorId || row?.jugador_id || '') === playerId);
  if (idMatch) return idMatch[1];
  const nameMatches = entries.filter(([name]) => normalizeDelegatedPlayerName(name) === normalizedName);
  return nameMatches.length === 1 ? nameMatches[0][1] : null;
};

export const getDelegatedPlayerMinutes = (matches = [], player = {}, eventMatchIds = []) => {
  const requiredMatchIds = new Set(safeArray(eventMatchIds).filter(Boolean));
  const entries = safeArray(matches).flatMap((match) => {
    const row = getMatchPlayerStatsEntry(match, player);
    if (!row) return [];
    return [{ matchId: match.id, minutes: row.minutes }];
  });
  const entryIds = new Set(entries.map((entry) => entry.matchId));
  const missingRequiredEntry = [...requiredMatchIds].some((matchId) => !entryIds.has(matchId));
  const unreliableEntry = entries.some((entry) => (
    entry.minutes === '' || entry.minutes == null || !Number.isFinite(Number(entry.minutes)) || Number(entry.minutes) < 0
  ));
  if (!entries.length || missingRequiredEntry || unreliableEntry) {
    return { value: null, reliable: false, matches: entries.length };
  }
  return {
    value: entries.reduce((sum, entry) => sum + Number(entry.minutes), 0),
    reliable: true,
    matches: entries.length,
  };
};

export const calculateDelegatedPer90 = (stats = {}, minutes) => {
  if (!Number.isFinite(Number(minutes)) || Number(minutes) <= 0) return null;
  return DELEGATED_PLAYER_STAT_FIELDS.reduce((result, field) => ({
    ...result,
    [field.key]: field.key === 'goals'
      ? Number(stats[field.key] || 0)
      : round((Number(stats[field.key] || 0) / Number(minutes)) * 90, 2),
  }), {});
};

export const buildDelegatedPlayerRows = ({ events = [], matches = [], players = [], selectedPlayerId = '' } = {}) => {
  const ownEvents = safeArray(events).filter((event) => getDelegatedEventSide(event) === 'caudal');
  const playersById = new Map(safeArray(players).map((player) => [String(player.id), player]));
  const includedIds = new Set(ownEvents.map(getDelegatedEventPlayerId).filter(Boolean));
  safeArray(players).forEach((player) => {
    if (safeArray(matches).some((match) => getMatchPlayerStatsEntry(match, player))) includedIds.add(String(player.id));
  });
  if (selectedPlayerId) includedIds.add(String(selectedPlayerId));

  return [...includedIds].flatMap((playerId) => {
    const player = playersById.get(playerId);
    if (!player || (selectedPlayerId && playerId !== String(selectedPlayerId))) return [];
    const playerEvents = ownEvents.filter((event) => getDelegatedEventPlayerId(event) === playerId);
    const eventMatchIds = [...new Set(playerEvents.map((event) => event.match?.id || event.partidoId || event.partido_id).filter(Boolean))];
    const stats = aggregateDelegatedStats(playerEvents, { scope: 'player' });
    const minutes = getDelegatedPlayerMinutes(matches, player, eventMatchIds);
    return [{
      player,
      playerId,
      stats,
      derived: calculateDelegatedDerivedStats(stats),
      minutes: minutes.value,
      minutesReliable: minutes.reliable,
      per90: calculateDelegatedPer90(stats, minutes.value),
      matches: new Set(eventMatchIds).size,
      validatedEvents: playerEvents.length,
    }];
  });
};

export const buildDelegatedRankings = (playerRows = []) => [
  ['goals', 'Máximo goleador'],
  ['shots', 'Más tiros'],
  ['shotsOnTarget', 'Más tiros a puerta'],
  ['dribbles', 'Más regates'],
  ['crosses', 'Más centros'],
  ['recoveries', 'Más recuperaciones'],
  ['steals', 'Más robos'],
  ['foulsReceived', 'Más faltas recibidas'],
].flatMap(([key, label]) => {
  const max = Math.max(0, ...safeArray(playerRows).map((row) => Number(row.stats?.[key] || 0)));
  if (!max) return [];
  return [{ key, label, value: max, leaders: safeArray(playerRows).filter((row) => Number(row.stats?.[key] || 0) === max) }];
});

export const buildDelegatedTemporalDistribution = (events = [], statKey = 'shots') => {
  const rows = DELEGATED_PERIODS.map((period) => {
    const periodEvents = safeArray(events).filter((event) => getDelegatedEventPeriod(event) === period);
    return {
      period,
      caudal: aggregateDelegatedStats(periodEvents.filter((event) => getDelegatedEventSide(event) === 'caudal'))[statKey] || 0,
      rival: aggregateDelegatedStats(periodEvents.filter((event) => getDelegatedEventSide(event) === 'rival'))[statKey] || 0,
    };
  });
  return {
    rows,
    hasCaudal: safeArray(events).some((event) => getDelegatedEventSide(event) === 'caudal'),
    hasRival: safeArray(events).some((event) => getDelegatedEventSide(event) === 'rival'),
  };
};

export const getDelegatedMatchCompetitionKey = (match = {}) => String(
  match.competitionKey || match.competition_key || 'other',
);

export const buildDelegatedEvolution = ({
  matches = [],
  filters = {},
  scope = '5',
  competitionKey = 'all',
  metric = 'shots',
  mode = 'total',
  players = [],
} = {}) => {
  const player = safeArray(players).find((candidate) => String(candidate.id) === String(filters.playerId || ''));
  const competitionMatches = safeArray(matches)
    .filter(isDelegatedDataValidated)
    .filter((match) => !filters.matchId || match.id === filters.matchId)
    .filter((match) => competitionKey === 'all' || getDelegatedMatchCompetitionKey(match) === competitionKey)
    .sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')));
  const limited = scope === 'season' ? competitionMatches : competitionMatches.slice(0, Number(scope) || 5);
  return limited.reverse().map((match) => {
    const dataset = buildDelegatedStatsDataset({ matches: [match], filters });
    const caudalEvents = dataset.events.filter((event) => getDelegatedEventSide(event) === 'caudal');
    const rivalEvents = dataset.events.filter((event) => getDelegatedEventSide(event) === 'rival');
    const caudalStats = aggregateDelegatedStats(caudalEvents, { scope: filters.playerId ? 'player' : 'team' });
    const rivalStats = aggregateDelegatedStats(rivalEvents);
    const minutes = player ? getDelegatedPlayerMinutes([match], player, dataset.events.length ? [match.id] : []) : null;
    const caudalValue = metric === 'minutes' ? minutes?.value ?? null : Number(caudalStats[metric] || 0);
    const rivalValue = metric === 'minutes' ? null : Number(rivalStats[metric] || 0);
    let value = filters.team === 'rival' ? rivalValue : caudalValue;
    let normalized = false;
    if (mode === 'per90' && filters.playerId && metric !== 'goals' && metric !== 'minutes') {
      value = minutes?.reliable && Number(minutes.value) > 0 ? round((value / minutes.value) * 90, 2) : null;
      normalized = value != null;
    }
    const hasCaudal = caudalEvents.length > 0;
    const hasRival = rivalEvents.length > 0;
    const hasSideData = filters.team === 'rival' ? hasRival : hasCaudal;
    if (!filters.playerId && !hasSideData) value = null;
    return {
      match,
      matchId: match.id,
      date: match.date || '',
      opponent: match.opponent || 'Rival',
      competitionKey: getDelegatedMatchCompetitionKey(match),
      events: dataset.events.length,
      minutes: minutes?.value ?? null,
      value,
      caudalValue: hasCaudal ? caudalValue : null,
      rivalValue: hasRival ? rivalValue : null,
      hasCaudal,
      hasRival,
      normalized,
    };
  });
};
