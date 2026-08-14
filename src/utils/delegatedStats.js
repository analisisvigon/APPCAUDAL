import { DELEGATED_EVENT_STAT_EFFECTS } from './delegatedEventSaveFlow.js';
import { getDelegatedEventPlayerId, normalizeDelegatedPlayerName } from './delegatedEventIdentity.js';
import { getGoalAssistant, getGoalScorer, normalizeGoalParticipantName } from './goalEvents.js';
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

export const OFFICIAL_PLAYER_STAT_FIELDS = [
  { key: 'goals', label: 'Goles', short: 'G', source: 'official' },
  { key: 'assists', label: 'Asistencias', short: 'A', source: 'official' },
  { key: 'goalContributions', label: 'Goles + asistencias', short: 'G+A', source: 'official' },
];
export const DELEGATED_PLAYER_ACTION_FIELDS = DELEGATED_STAT_FIELDS.filter((field) => !field.teamOnly && field.key !== 'goals');
export const DELEGATED_PLAYER_STAT_FIELDS = [...OFFICIAL_PLAYER_STAT_FIELDS, ...DELEGATED_PLAYER_ACTION_FIELDS];
export const DELEGATED_PERIODS = ['0-15', '16-30', '31-45', '46-60', '61-75', '76-90+'];
export const DELEGATED_EVOLUTION_SCOPES = ['5', '10', 'season'];
export const DELEGATED_HALF_FIELDS = DELEGATED_STAT_FIELDS;
export const DELEGATED_TEMPORAL_FIELDS = DELEGATED_STAT_FIELDS;

const safeArray = (value) => (Array.isArray(value) ? value : []);
const safeObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};
const hasNumber = (value) => value !== '' && value != null && Number.isFinite(Number(value));
const getEventMatchId = (event = {}) => event.match?.id || event.partidoId || event.partido_id || '';
const sortMatchesAscending = (matches = []) => safeArray(matches).slice().sort((left, right) => (
  `${left.date || ''}T${left.time || ''}`.localeCompare(`${right.date || ''}T${right.time || ''}`)
));

export const formatDelegatedNumber = (value, mode = 'total') => {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const digits = mode === 'average' ? 1 : mode === 'per90' ? 2 : mode === 'percent' ? 1 : 0;
  return Number(value).toLocaleString('es-ES', { maximumFractionDigits: digits });
};

export const createEmptyDelegatedStats = () => DELEGATED_STAT_FIELDS.reduce(
  (stats, field) => ({ ...stats, [field.key]: 0 }),
  {},
);

const createEmptyPlayerStats = () => DELEGATED_PLAYER_STAT_FIELDS.reduce(
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

export const calculateDelegatedPerMatch = (stats = {}, matchesPlayed) => {
  if (!Number.isFinite(Number(matchesPlayed)) || Number(matchesPlayed) <= 0) return null;
  const fields = Object.prototype.hasOwnProperty.call(stats, 'assists')
    ? DELEGATED_PLAYER_STAT_FIELDS
    : DELEGATED_STAT_FIELDS;
  return fields.reduce((result, field) => ({
    ...result,
    [field.key]: round(Number(stats[field.key] || 0) / Number(matchesPlayed), 2),
  }), {});
};

export const calculateDelegatedPer90 = (stats = {}, minutes) => {
  if (!Number.isFinite(Number(minutes)) || Number(minutes) <= 0) return null;
  return DELEGATED_PLAYER_STAT_FIELDS.reduce((result, field) => ({
    ...result,
    [field.key]: round((Number(stats[field.key] || 0) / Number(minutes)) * 90, 2),
  }), {});
};

export const getDelegatedMatchCompetitionKey = (match = {}) => String(
  match.competitionKey || match.competition_key || 'other',
);

export const getDelegatedMatchVenue = (match = {}) => (
  Boolean(match.isHome ?? match.is_home) ? 'home' : 'away'
);

export const getDelegatedMatchResult = (match = {}) => {
  let goalsFor = match.goalsFor ?? match.goals_for;
  let goalsAgainst = match.goalsAgainst ?? match.goals_against;
  if (!hasNumber(goalsFor) || !hasNumber(goalsAgainst)) {
    const home = match.homeScore ?? match.home_score;
    const away = match.awayScore ?? match.away_score;
    if (!hasNumber(home) || !hasNumber(away)) return 'unknown';
    goalsFor = getDelegatedMatchVenue(match) === 'home' ? home : away;
    goalsAgainst = getDelegatedMatchVenue(match) === 'home' ? away : home;
  }
  if (Number(goalsFor) > Number(goalsAgainst)) return 'win';
  if (Number(goalsFor) < Number(goalsAgainst)) return 'loss';
  return 'draw';
};

export const filterDelegatedValidatedMatches = (matches = [], filters = {}) => {
  const contextual = safeArray(matches)
    .filter(isDelegatedDataValidated)
    .filter((match) => !filters.matchId || match.id === filters.matchId)
    .filter((match) => !filters.competitionKey || filters.competitionKey === 'all' || getDelegatedMatchCompetitionKey(match) === filters.competitionKey)
    .filter((match) => !filters.venue || filters.venue === 'all' || getDelegatedMatchVenue(match) === filters.venue)
    .filter((match) => !filters.result || filters.result === 'all' || getDelegatedMatchResult(match) === filters.result);
  const chronological = sortMatchesAscending(contextual);
  if (!filters.scope || filters.scope === 'season') return chronological;
  const limit = Number(filters.scope);
  return Number.isFinite(limit) && limit > 0 ? chronological.slice(-limit) : chronological;
};

export const buildDelegatedStatsDataset = ({ matches = [], filters = {} } = {}) => {
  const validatedMatches = filterDelegatedValidatedMatches(matches, filters);
  const validatedEvents = getValidatedDelegatedEvents(validatedMatches);
  const events = filterDelegatedValidatedEvents(validatedEvents, {
    team: filters.team || 'todos',
    playerId: filters.playerId || '',
    eventType: filters.eventType || 'todos',
    period: filters.period || 'todos',
  });
  const matchIds = new Set(validatedMatches.map((match) => match.id));
  return {
    matches: safeArray(matches).filter((match) => matchIds.has(match.id)),
    validatedMatches,
    sampleEvents: validatedEvents,
    events,
  };
};

export const aggregateDelegatedSides = (events = [], sampleEvents = events) => ({
  caudal: aggregateDelegatedStats(safeArray(events).filter((event) => getDelegatedEventSide(event) === 'caudal')),
  rival: aggregateDelegatedStats(safeArray(events).filter((event) => getDelegatedEventSide(event) === 'rival')),
  hasCaudal: safeArray(sampleEvents).some((event) => getDelegatedEventSide(event) === 'caudal'),
  hasRival: safeArray(sampleEvents).some((event) => getDelegatedEventSide(event) === 'rival'),
});

const getPlayerName = (player = {}) => String(player.name || player.playerName || player.player_name || '').trim();

const getOfficialGoalEvents = (matches = [], filters = {}) => {
  if (filters.eventType && !['todos', 'gol'].includes(filters.eventType)) return [];
  const rows = safeArray(matches).flatMap((match) => safeArray(match.statsGoalEvents)
    .filter((event) => ['Gol a favor', 'Gol en contra'].includes(event?.type))
    .filter((event) => !filters.period || filters.period === 'todos' || getDelegatedEventPeriod(event) === filters.period)
    .map((event, index) => ({
      ...event,
      match,
      matchId: match.id,
      _officialKey: `${match.id}:${event.id || `${event.type}:${event.minute || event.minuto || ''}:${index}`}`,
    })));
  return [...new Map(rows.map((event) => [event._officialKey, event])).values()];
};

const resolveOfficialParticipantId = (event, role, players = []) => {
  const participant = role === 'assistant' ? getGoalAssistant(event) : getGoalScorer(event);
  if (participant.id) {
    const player = safeArray(players).find((candidate) => String(candidate?.id || '') === String(participant.id));
    return player ? String(player.id) : '';
  }
  const normalizedName = normalizeGoalParticipantName(participant.name);
  if (!normalizedName) return '';
  const matches = safeArray(players).filter((player) => normalizeGoalParticipantName(getPlayerName(player)) === normalizedName);
  return matches.length === 1 ? String(matches[0].id) : '';
};

export const buildDelegatedOfficialPlayerProduction = ({ matches = [], players = [], filters = {} } = {}) => {
  const events = getOfficialGoalEvents(matches, filters).filter((event) => event.type === 'Gol a favor');
  const byPlayer = new Map();
  const ensure = (playerId) => {
    if (!byPlayer.has(playerId)) byPlayer.set(playerId, { goals: 0, assists: 0, goalContributions: 0, matchIds: [], byMatch: {} });
    return byPlayer.get(playerId);
  };
  events.forEach((event) => {
    const scorerId = resolveOfficialParticipantId(event, 'scorer', players);
    const assistantId = resolveOfficialParticipantId(event, 'assistant', players);
    [['goals', scorerId], ['assists', assistantId]].forEach(([key, playerId]) => {
      if (!playerId) return;
      const production = ensure(playerId);
      production[key] += 1;
      production.goalContributions += 1;
      if (!production.matchIds.includes(event.matchId)) production.matchIds.push(event.matchId);
      if (!production.byMatch[event.matchId]) production.byMatch[event.matchId] = { goals: 0, assists: 0, goalContributions: 0 };
      production.byMatch[event.matchId][key] += 1;
      production.byMatch[event.matchId].goalContributions += 1;
    });
  });
  return { events, byPlayer };
};

const getOfficialMatchScore = (match = {}) => {
  let caudal = match.goalsFor ?? match.goals_for;
  let rival = match.goalsAgainst ?? match.goals_against;
  if (!hasNumber(caudal) || !hasNumber(rival)) {
    const home = match.homeScore ?? match.home_score;
    const away = match.awayScore ?? match.away_score;
    if (hasNumber(home) && hasNumber(away)) {
      caudal = getDelegatedMatchVenue(match) === 'home' ? home : away;
      rival = getDelegatedMatchVenue(match) === 'home' ? away : home;
    }
  }
  if (!hasNumber(caudal) || !hasNumber(rival)) {
    const events = safeArray(match.statsGoalEvents);
    if (!events.length) return null;
    caudal = events.filter((event) => event.type === 'Gol a favor').length;
    rival = events.filter((event) => event.type === 'Gol en contra').length;
  }
  return { caudal: Number(caudal), rival: Number(rival) };
};

export const buildDelegatedOfficialTeamScore = (matches = []) => {
  const rows = safeArray(matches).flatMap((match) => {
    const score = getOfficialMatchScore(match);
    return score ? [{ match, ...score }] : [];
  });
  const totals = rows.reduce((result, row) => ({ caudal: result.caudal + row.caudal, rival: result.rival + row.rival }), { caudal: 0, rival: 0 });
  return {
    rows,
    matchCount: rows.length,
    reliable: rows.length > 0,
    totals,
    average: rows.length ? { caudal: round(totals.caudal / rows.length, 2), rival: round(totals.rival / rows.length, 2) } : { caudal: null, rival: null },
  };
};

export const buildDelegatedOfficialGoalEvents = (matches = [], filters = {}) => getOfficialGoalEvents(matches, filters).map((event) => ({
  ...event,
  tipoEvento: 'gol',
  equipo: event.type === 'Gol a favor' ? 'caudal' : 'rival',
  partidoId: event.matchId,
  minute: event.minute ?? event.minuto,
}));

export const getDelegatedMatchPlayerStatsEntry = (match = {}, player = {}) => {
  const playerId = String(player.id || player.playerId || player.jugadorId || '');
  const normalizedName = normalizeDelegatedPlayerName(getPlayerName(player));
  const entries = Object.entries(safeObject(match.statsPlayerData));
  const idMatch = entries.find(([, row]) => String(row?.jugadorId || row?.jugador_id || '') === playerId);
  if (idMatch) return idMatch[1];
  const nameMatches = entries.filter(([name]) => normalizeDelegatedPlayerName(name) === normalizedName);
  return nameMatches.length === 1 ? nameMatches[0][1] : null;
};

export const getDelegatedPlayerParticipation = (matches = [], player = {}, eventMatchIds = []) => {
  const requiredMatchIds = new Set(safeArray(eventMatchIds).filter(Boolean));
  const entries = safeArray(matches).flatMap((match) => {
    const row = getDelegatedMatchPlayerStatsEntry(match, player);
    if (!row) return [];
    const minutesReliable = hasNumber(row.minutes) && Number(row.minutes) >= 0;
    return [{ match, matchId: match.id, row, minutes: minutesReliable ? Number(row.minutes) : null, minutesReliable }];
  });
  const playedEntries = entries.filter((entry) => entry.minutesReliable && entry.minutes > 0);
  const playedIds = new Set(playedEntries.map((entry) => entry.matchId));
  const missingRequired = [...requiredMatchIds].filter((matchId) => !playedIds.has(matchId));
  const reliable = missingRequired.length === 0;
  return {
    matchesPlayed: playedEntries.length,
    minutes: playedEntries.reduce((sum, entry) => sum + entry.minutes, 0),
    reliable,
    minutesReliable: reliable && playedEntries.length > 0,
    playedMatchIds: [...playedIds],
    missingRequired,
    entries,
  };
};

export const getDelegatedPlayerMinutes = (matches = [], player = {}, eventMatchIds = []) => {
  const participation = getDelegatedPlayerParticipation(matches, player, eventMatchIds);
  return {
    value: participation.minutesReliable ? participation.minutes : null,
    reliable: participation.minutesReliable,
    matches: participation.matchesPlayed,
  };
};

const buildPlayerMatchRows = ({ matches, playerEvents, participation, officialByMatch = {} }) => (
  sortMatchesAscending(matches).flatMap((match) => {
    if (!participation.playedMatchIds.includes(match.id)) return [];
    const events = playerEvents.filter((event) => (event.match?.id || event.partidoId || event.partido_id) === match.id);
    return [{
      match,
      matchId: match.id,
      minutes: participation.entries.find((entry) => entry.matchId === match.id)?.minutes ?? null,
      stats: {
        ...aggregateDelegatedStats(events, { scope: 'player' }),
        goals: officialByMatch[match.id]?.goals || 0,
        assists: officialByMatch[match.id]?.assists || 0,
        goalContributions: officialByMatch[match.id]?.goalContributions || 0,
      },
    }];
  })
);

export const buildDelegatedRecentComparison = (matchRows = [], fields = DELEGATED_PLAYER_STAT_FIELDS, window = 5) => {
  const rows = safeArray(matchRows);
  if (rows.length < window) return { sufficient: false, sample: rows.length, window, rows: [] };
  const recent = rows.slice(-window);
  const seasonStats = rows.reduce((total, row) => {
    safeArray(fields).forEach((field) => { total[field.key] += Number(row.stats?.[field.key] || 0); });
    return total;
  }, createEmptyPlayerStats());
  const recentStats = recent.reduce((total, row) => {
    safeArray(fields).forEach((field) => { total[field.key] += Number(row.stats?.[field.key] || 0); });
    return total;
  }, createEmptyPlayerStats());
  return {
    sufficient: true,
    sample: rows.length,
    window,
    rows: safeArray(fields).map((field) => {
      const season = round(Number(seasonStats[field.key] || 0) / rows.length, 2);
      const recentValue = round(Number(recentStats[field.key] || 0) / recent.length, 2);
      const difference = round(recentValue - season, 2);
      return {
        key: field.key,
        label: field.label,
        short: field.short,
        season,
        recent: recentValue,
        difference,
        percentDifference: season ? round((difference / season) * 100, 1) : null,
      };
    }),
  };
};

export const buildDelegatedPlayerRows = ({ events = [], matches = [], players = [], selectedPlayerId = '', filters = {} } = {}) => {
  const ownEvents = safeArray(events).filter((event) => getDelegatedEventSide(event) === 'caudal');
  const singleMatch = Boolean(filters.matchId) && safeArray(matches).length === 1;
  const playersById = new Map(safeArray(players).map((player) => [String(player.id), player]));
  const includedIds = new Set(ownEvents.map(getDelegatedEventPlayerId).filter(Boolean));
  const officialProduction = buildDelegatedOfficialPlayerProduction({ matches, players, filters });
  officialProduction.byPlayer.forEach((value, playerId) => includedIds.add(playerId));
  safeArray(players).forEach((player) => {
    if (safeArray(matches).some((match) => {
      const row = getDelegatedMatchPlayerStatsEntry(match, player);
      return row && hasNumber(row.minutes) && Number(row.minutes) > 0;
    })) includedIds.add(String(player.id));
  });
  if (selectedPlayerId) includedIds.add(String(selectedPlayerId));

  return [...includedIds].flatMap((playerId) => {
    const player = playersById.get(playerId);
    if (!player || (selectedPlayerId && playerId !== String(selectedPlayerId))) return [];
    if (singleMatch) {
      const participationRow = getDelegatedMatchPlayerStatsEntry(matches[0], player);
      if (!participationRow || !hasNumber(participationRow.minutes) || Number(participationRow.minutes) <= 0) return [];
    }
    const playerEvents = ownEvents.filter((event) => getDelegatedEventPlayerId(event) === playerId);
    const official = officialProduction.byPlayer.get(playerId) || { goals: 0, assists: 0, goalContributions: 0, matchIds: [], byMatch: {} };
    const eventMatchIds = [...new Set([
      ...playerEvents.map((event) => event.match?.id || event.partidoId || event.partido_id),
      ...official.matchIds,
    ].filter(Boolean))];
    const delegatedStats = aggregateDelegatedStats(playerEvents, { scope: 'player' });
    const stats = {
      ...delegatedStats,
      goals: official.goals,
      assists: official.assists,
      goalContributions: official.goalContributions,
    };
    const participation = getDelegatedPlayerParticipation(matches, player, eventMatchIds);
    const matchRows = buildPlayerMatchRows({ matches, playerEvents, participation, officialByMatch: official.byMatch });
    const matchesPlayed = participation.reliable ? participation.matchesPlayed : null;
    return [{
      player,
      playerId,
      stats,
      derived: calculateDelegatedDerivedStats(stats),
      minutes: participation.minutesReliable ? participation.minutes : null,
      minutesReliable: participation.minutesReliable,
      participationReliable: participation.reliable,
      matchesPlayed,
      matches: matchesPlayed,
      average: participation.reliable ? calculateDelegatedPerMatch(stats, participation.matchesPlayed) : null,
      per90: participation.minutesReliable ? calculateDelegatedPer90(stats, participation.minutes) : null,
      validatedEvents: playerEvents.length,
      matchRows,
      recent: buildDelegatedRecentComparison(matchRows),
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

export const buildDelegatedTeamProfile = ({ events = [], matches = [], matchCount = 0, side = 'caudal', sampleEvents = events, filters = {} } = {}) => {
  const sideEvents = safeArray(events).filter((event) => getDelegatedEventSide(event) === side);
  const sideSampleEvents = safeArray(sampleEvents).filter((event) => getDelegatedEventSide(event) === side);
  const hasSample = sideSampleEvents.length > 0;
  const sampledMatches = new Set(sideSampleEvents.map(getEventMatchId).filter(Boolean)).size;
  const denominator = side === 'rival' ? sampledMatches : Number(matchCount || 0);
  const totals = aggregateDelegatedStats(sideEvents);
  const officialScore = buildDelegatedOfficialTeamScore(matches);
  const goalFilterActive = (filters.eventType && filters.eventType !== 'todos') || (filters.period && filters.period !== 'todos');
  const scopedOfficialGoals = buildDelegatedOfficialGoalEvents(matches, filters).filter((event) => getDelegatedEventSide(event) === side).length;
  if (officialScore.reliable) totals.goals = goalFilterActive ? scopedOfficialGoals : officialScore.totals[side];
  const delegatedAverage = hasSample ? calculateDelegatedPerMatch(totals, denominator) : null;
  const average = officialScore.reliable
    ? {
      ...DELEGATED_STAT_FIELDS.reduce((result, field) => ({ ...result, [field.key]: delegatedAverage?.[field.key] ?? null }), {}),
      goals: goalFilterActive ? round(totals.goals / officialScore.matchCount, 2) : officialScore.average[side],
    }
    : delegatedAverage;
  return {
    side,
    hasSample: hasSample || officialScore.reliable,
    hasActionSample: hasSample,
    matchCount: officialScore.reliable ? officialScore.matchCount : hasSample ? denominator : 0,
    totals,
    average,
    derived: hasSample ? calculateDelegatedDerivedStats(totals) : calculateDelegatedDerivedStats({}),
    officialScore,
  };
};

export const buildDelegatedTemporalDistribution = (events = [], statKey = 'shots', matchCount = 0, mode = 'total', sampleEvents = events) => {
  const caudalSample = safeArray(sampleEvents).filter((event) => getDelegatedEventSide(event) === 'caudal');
  const rivalSample = safeArray(sampleEvents).filter((event) => getDelegatedEventSide(event) === 'rival');
  const hasCaudal = caudalSample.length > 0;
  const hasRival = rivalSample.length > 0;
  const caudalDivisor = mode === 'average' && Number(matchCount) > 0 ? Number(matchCount) : 1;
  const rivalMatches = new Set(rivalSample.map(getEventMatchId).filter(Boolean)).size;
  const rivalDivisor = mode === 'average' && rivalMatches > 0 ? rivalMatches : 1;
  const rows = DELEGATED_PERIODS.map((period) => {
    const periodEvents = safeArray(events).filter((event) => getDelegatedEventPeriod(event) === period);
    return {
      period,
      caudal: round((aggregateDelegatedStats(periodEvents.filter((event) => getDelegatedEventSide(event) === 'caudal'))[statKey] || 0) / caudalDivisor, mode === 'average' ? 1 : 0),
      rival: round((aggregateDelegatedStats(periodEvents.filter((event) => getDelegatedEventSide(event) === 'rival'))[statKey] || 0) / rivalDivisor, mode === 'average' ? 1 : 0),
    };
  });
  return { rows, hasCaudal, hasRival, mode };
};

export const buildDelegatedTemporalMatrix = (events = [], matchCount = 0, mode = 'total', sampleEvents = events, officialGoalEvents = []) => ({
  periods: DELEGATED_PERIODS,
  rows: DELEGATED_TEMPORAL_FIELDS.map((field) => ({
    ...field,
    values: buildDelegatedTemporalDistribution(
      field.key === 'goals' ? officialGoalEvents : events,
      field.key,
      matchCount,
      mode,
      field.key === 'goals' ? officialGoalEvents : sampleEvents,
    ).rows,
  })),
  mode,
});

export const buildDelegatedHalfComparison = (events = [], side = 'caudal', sampleEvents = events, officialGoalEvents = []) => {
  const sideEvents = safeArray(events).filter((event) => getDelegatedEventSide(event) === side);
  const firstEvents = sideEvents.filter((event) => Number(event.minute ?? event.minuto ?? 0) <= 45);
  const secondEvents = sideEvents.filter((event) => Number(event.minute ?? event.minuto ?? 0) > 45);
  const first = aggregateDelegatedStats(firstEvents);
  const second = aggregateDelegatedStats(secondEvents);
  const officialSideEvents = safeArray(officialGoalEvents).filter((event) => getDelegatedEventSide(event) === side);
  if (officialSideEvents.length) {
    first.goals = aggregateDelegatedStats(officialSideEvents.filter((event) => Number(event.minute ?? event.minuto ?? 0) <= 45)).goals;
    second.goals = aggregateDelegatedStats(officialSideEvents.filter((event) => Number(event.minute ?? event.minuto ?? 0) > 45)).goals;
  }
  return {
    hasSample: safeArray(sampleEvents).some((event) => getDelegatedEventSide(event) === side) || officialSideEvents.length > 0,
    rows: DELEGATED_HALF_FIELDS.map((field) => {
      const total = Number(first[field.key] || 0) + Number(second[field.key] || 0);
      return {
        ...field,
        first: Number(first[field.key] || 0),
        second: Number(second[field.key] || 0),
        firstPercent: total ? round((Number(first[field.key] || 0) / total) * 100, 1) : null,
        secondPercent: total ? round((Number(second[field.key] || 0) / total) * 100, 1) : null,
      };
    }),
  };
};

const withoutContextDimension = (filters, dimension) => ({
  ...filters,
  ...(dimension === 'venue' ? { venue: 'all' } : {}),
  ...(dimension === 'result' ? { result: 'all' } : {}),
  ...(dimension === 'competition' ? { competitionKey: 'all' } : {}),
});

export const buildDelegatedContextComparison = ({ matches = [], filters = {}, dimension = 'venue' } = {}) => {
  const baseFilters = withoutContextDimension(filters, dimension);
  const baseMatches = filterDelegatedValidatedMatches(matches, baseFilters);
  const definitions = dimension === 'result'
    ? [['win', 'Victoria'], ['draw', 'Empate'], ['loss', 'Derrota']]
    : dimension === 'competition'
      ? [['league', 'Liga'], ['other', 'Otras']]
      : dimension === 'recent'
        ? [['season', 'Temporada'], ['recent5', 'Últimos 5']]
        : [['home', 'Local'], ['away', 'Visitante']];
  return definitions.map(([key, label]) => {
    const groupMatches = dimension === 'recent'
      ? (key === 'recent5' ? baseMatches.slice(-5) : baseMatches)
      : baseMatches.filter((match) => (
        dimension === 'venue' ? getDelegatedMatchVenue(match) === key
          : dimension === 'result' ? getDelegatedMatchResult(match) === key
            : key === 'league' ? getDelegatedMatchCompetitionKey(match) === 'league' : getDelegatedMatchCompetitionKey(match) !== 'league'
      ));
    const dataset = buildDelegatedStatsDataset({ matches: groupMatches, filters: { ...baseFilters, scope: 'season', venue: 'all', result: 'all', competitionKey: 'all' } });
    const profile = buildDelegatedTeamProfile({
      events: dataset.events,
      matches: groupMatches,
      sampleEvents: dataset.sampleEvents,
      matchCount: dataset.validatedMatches.length,
      side: filters.team === 'rival' ? 'rival' : 'caudal',
      filters,
    });
    return { key, label, matches: groupMatches, matchCount: groupMatches.length, ...profile };
  });
};

export const calculateDelegatedMovingAverage = (values = [], window = 5) => safeArray(values).map((value, index) => {
  if (index < window - 1) return null;
  const sample = values.slice(index - window + 1, index + 1);
  if (sample.some((item) => item == null || !Number.isFinite(Number(item)))) return null;
  return round(sample.reduce((sum, item) => sum + Number(item), 0) / window, 2);
});

export const buildDelegatedEvolution = ({
  matches = [],
  filters = {},
  scope = filters.scope || 'season',
  competitionKey = filters.competitionKey || 'all',
  metric = 'shots',
  mode = 'total',
  players = [],
} = {}) => {
  const player = safeArray(players).find((candidate) => String(candidate.id) === String(filters.playerId || ''));
  const selectedMatches = filterDelegatedValidatedMatches(matches, { ...filters, scope, competitionKey });
  const officialProduction = buildDelegatedOfficialPlayerProduction({ matches: selectedMatches, players, filters });
  const officialScore = buildDelegatedOfficialTeamScore(selectedMatches);
  const rows = selectedMatches.map((match) => {
    const unfiltered = buildDelegatedStatsDataset({ matches: [match], filters: { matchId: match.id, scope: 'season' } });
    const dataset = buildDelegatedStatsDataset({ matches: [match], filters: { ...filters, scope: 'season', matchId: match.id } });
    const caudalEvents = dataset.events.filter((event) => getDelegatedEventSide(event) === 'caudal');
    const rivalEvents = dataset.events.filter((event) => getDelegatedEventSide(event) === 'rival');
    const caudalStats = aggregateDelegatedStats(caudalEvents, { scope: filters.playerId ? 'player' : 'team' });
    const rivalStats = aggregateDelegatedStats(rivalEvents);
    const eventMatchIds = filters.playerId && caudalEvents.length ? [match.id] : [];
    const participation = player ? getDelegatedPlayerParticipation([match], player, eventMatchIds) : null;
    const playerPlayed = Boolean(participation?.minutesReliable && participation.matchesPlayed > 0);
    const hasCaudal = filters.playerId
      ? playerPlayed
      : unfiltered.sampleEvents.some((event) => getDelegatedEventSide(event) === 'caudal');
    const hasRival = unfiltered.sampleEvents.some((event) => getDelegatedEventSide(event) === 'rival');
    const minutes = playerPlayed ? participation.minutes : null;
    const playerOfficial = player ? officialProduction.byPlayer.get(String(player.id))?.byMatch?.[match.id] : null;
    const matchScore = officialScore.rows.find((row) => row.match.id === match.id);
    const officialMetric = ['goals', 'assists', 'goalContributions'].includes(metric);
    const caudalValue = metric === 'minutes'
      ? minutes
      : officialMetric
        ? (filters.playerId ? (playerPlayed ? Number(playerOfficial?.[metric] || 0) : null) : metric === 'goals' && matchScore ? matchScore.caudal : null)
        : (hasCaudal ? Number(caudalStats[metric] || 0) : null);
    const rivalValue = metric === 'minutes'
      ? null
      : metric === 'goals' && matchScore
        ? matchScore.rival
        : officialMetric
          ? null
          : (hasRival ? Number(rivalStats[metric] || 0) : null);
    let value = filters.team === 'rival' ? rivalValue : caudalValue;
    if (mode === 'per90' && filters.playerId && metric !== 'minutes') {
      value = minutes ? round((Number(caudalValue || 0) / minutes) * 90, 2) : null;
    }
    return {
      match,
      matchId: match.id,
      date: match.date || '',
      opponent: match.opponent || 'Rival',
      competitionKey: getDelegatedMatchCompetitionKey(match),
      events: dataset.events.length,
      minutes,
      value,
      caudalValue,
      rivalValue,
      hasCaudal,
      hasRival,
      normalized: mode === 'per90' && value != null,
    };
  });
  const moving = calculateDelegatedMovingAverage(rows.map((row) => row.value), 5);
  const caudalMoving = calculateDelegatedMovingAverage(rows.map((row) => row.caudalValue), 5);
  const rivalMoving = calculateDelegatedMovingAverage(rows.map((row) => row.rivalValue), 5);
  return rows.map((row, index) => ({
    ...row,
    movingAverage: moving[index],
    caudalMovingAverage: caudalMoving[index],
    rivalMovingAverage: rivalMoving[index],
  }));
};

export const buildDelegatedMatchSampleComparison = ({
  matches = [],
  filters = {},
  players = [],
  fields = filters.playerId ? DELEGATED_PLAYER_STAT_FIELDS : DELEGATED_STAT_FIELDS,
  minimumSample = 5,
} = {}) => {
  const matchId = String(filters.matchId || '');
  if (!matchId) return { matchId: '', match: null, sample: 0, sufficient: false, rows: [] };
  const match = safeArray(matches).find((candidate) => String(candidate.id) === matchId) || null;
  if (!match) return { matchId, match: null, sample: 0, sufficient: false, rows: [] };
  const sampleFilters = { ...filters, matchId: '' };
  const rows = safeArray(fields).map((field) => {
    const selected = buildDelegatedEvolution({
      matches,
      filters,
      scope: 'season',
      competitionKey: filters.competitionKey || 'all',
      metric: field.key,
      mode: 'total',
      players,
    }).find((row) => String(row.matchId) === matchId);
    const sampleRows = buildDelegatedEvolution({
      matches,
      filters: sampleFilters,
      scope: filters.scope || 'season',
      competitionKey: filters.competitionKey || 'all',
      metric: field.key,
      mode: 'total',
      players,
    }).filter((row) => row.value != null && Number.isFinite(Number(row.value)));
    const sufficient = sampleRows.length >= minimumSample;
    return {
      ...field,
      selected: selected?.value ?? null,
      sample: sampleRows.length,
      sufficient,
      average: sufficient ? round(sampleRows.reduce((sum, row) => sum + Number(row.value), 0) / sampleRows.length, 2) : null,
    };
  });
  return {
    matchId,
    match,
    sample: Math.max(0, ...rows.map((row) => row.sample)),
    sufficient: rows.some((row) => row.sufficient),
    rows,
  };
};

export const buildDelegatedEvolutionComparison = (evolution = []) => {
  const valid = safeArray(evolution).filter((row) => row.value != null && Number.isFinite(Number(row.value)));
  if (valid.length < 5) return { sufficient: false, sample: valid.length };
  const recent = valid.slice(-5);
  const season = round(valid.reduce((sum, row) => sum + Number(row.value), 0) / valid.length, 2);
  const recentAverage = round(recent.reduce((sum, row) => sum + Number(row.value), 0) / recent.length, 2);
  const difference = round(recentAverage - season, 2);
  return {
    sufficient: true,
    sample: valid.length,
    season,
    recent: recentAverage,
    difference,
    percentDifference: season ? round((difference / season) * 100, 1) : null,
  };
};

export const buildDelegatedDataReadings = ({ matches = [], filters = {} } = {}) => {
  const dataset = buildDelegatedStatsDataset({ matches, filters: { ...filters, scope: filters.scope || 'season' } });
  if (dataset.validatedMatches.length < 5) return [];
  const side = filters.team === 'rival' ? 'rival' : 'caudal';
  const sideEvents = dataset.events.filter((event) => getDelegatedEventSide(event) === side);
  const readings = [];
  const shots = sideEvents.filter((event) => ['gol', 'tiro', 'tiro_puerta'].includes(String(event.tipoEvento || event.tipo_evento || '').replace(/_rival$/i, '')));
  const secondHalfShots = shots.filter((event) => Number(event.minute ?? event.minuto ?? 0) > 45).length;
  if (shots.length && Math.max(secondHalfShots, shots.length - secondHalfShots) / shots.length >= 0.6) {
    readings.push({
      key: 'shots-half',
      source: 'TEMPORAL',
      text: `${Math.round((secondHalfShots / shots.length) * 100)}% de los tiros registrados se producen en la segunda parte.`,
    });
  }
  const lossesByPeriod = buildDelegatedTemporalDistribution(sideEvents, 'turnovers').rows;
  const maxLosses = Math.max(0, ...lossesByPeriod.map((row) => row[side]));
  const peakLosses = lossesByPeriod.filter((row) => row[side] === maxLosses);
  if (maxLosses > 0 && peakLosses.length === 1) {
    readings.push({ key: 'losses-period', source: 'TEMPORAL', text: `El tramo ${peakLosses[0].period} concentra el mayor número de pérdidas registradas.` });
  }
  const evolution = buildDelegatedEvolution({ matches, filters: { ...filters, team: side }, scope: filters.scope || 'season', metric: 'shots' });
  const recent = buildDelegatedEvolutionComparison(evolution);
  if (recent.sufficient && recent.sample > 5 && Math.abs(recent.difference) >= 0.1) {
    readings.push({
      key: 'recent-shots',
      source: 'RECIENTE',
      text: `Los últimos 5 partidos registran ${formatDelegatedNumber(recent.recent, 'average')} tiros/p frente a ${formatDelegatedNumber(recent.season, 'average')} en la muestra completa.`,
    });
  }
  const venue = buildDelegatedContextComparison({ matches, filters, dimension: 'venue' });
  const home = venue.find((item) => item.key === 'home');
  const away = venue.find((item) => item.key === 'away');
  if (home?.matchCount >= 2 && away?.matchCount >= 2 && home.average && away.average) {
    readings.push({
      key: 'venue-shots-on-target',
      source: 'LOCAL/VISITANTE',
      text: `Como local se registran ${formatDelegatedNumber(home.average.shotsOnTarget, 'average')} TAP/p frente a ${formatDelegatedNumber(away.average.shotsOnTarget, 'average')} como visitante.`,
    });
  }
  return readings.slice(0, 5);
};
