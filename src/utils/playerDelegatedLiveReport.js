import {
  aggregateDelegatedStats,
  calculateDelegatedPerMatch,
} from './delegatedStats.js';
import {
  delegatedEventMatchesPlayer,
  getCanonicalPlayerId,
} from './delegatedEventIdentity.js';
import {
  getDelegatedEventSide,
  isDelegatedDataValidated,
} from './delegatedMatchValidation.js';

const rows = (value) => Array.isArray(value) ? value : [];
const getMatchId = (event = {}) => event.match?.id || event.partidoId || event.partido_id || '';
const getMatchFromIndex = (matchesById, matchId) => (
  matchesById instanceof Map ? matchesById.get(matchId) : matchesById?.[matchId]
);
const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

export const PLAYER_DELEGATED_LIVE_FIELDS = Object.freeze([
  { key: 'goals' },
  { key: 'shots' },
  { key: 'shotsOnTarget' },
  { key: 'crosses' },
  { key: 'turnovers' },
  { key: 'steals' },
  { key: 'foulsCommitted' },
  { key: 'foulsReceived' },
]);

export const buildPlayerDelegatedLivePresentationInput = (summary = {}) => ({
  matchesWithEvents: Number(summary.matchesWithEvents || 0),
  registryScope: 'all_records',
  goalsPerMatch: summary.perMatch?.goals ?? null,
  shotsPerMatch: summary.perMatch?.shots ?? null,
  shotsOnTargetPerMatch: summary.perMatch?.shotsOnTarget ?? null,
  shotAccuracyPercentage: summary.shotAccuracyPercentage ?? null,
  crossesPerMatch: summary.perMatch?.crosses ?? null,
  turnoversPerMatch: summary.perMatch?.turnovers ?? null,
  stealsPerMatch: summary.perMatch?.steals ?? null,
  foulsCommittedPerMatch: summary.perMatch?.foulsCommitted ?? null,
  foulsReceivedPerMatch: summary.perMatch?.foulsReceived ?? null,
});

const scopeLimit = (quickScope) => {
  if (quickScope === 'Últimos 3 partidos') return 3;
  if (quickScope === 'Últimos 5 partidos') return 5;
  return null;
};

const matchVenueAllowed = (match, venue) => (
  venue === 'Todos'
  || venue === 'all'
  || (venue === 'Local' || venue === 'home' ? Boolean(match.isHome ?? match.is_home) : !Boolean(match.isHome ?? match.is_home))
);

export const buildPlayerDelegatedLiveSummary = ({
  events = [],
  matchesById = {},
  player = null,
  players = [],
  quickScope = 'Temporada completa',
  delegatedScope = 'Todos los registros',
  venue = 'Todos',
  matchAllowed = () => true,
} = {}) => {
  const playerId = getCanonicalPlayerId(player);
  const emptyStats = aggregateDelegatedStats([], { scope: 'player' });
  if (!playerId) {
    return {
      ...emptyStats,
      losses: 0,
      fouls: 0,
      shotAccuracy: 'No disponible',
      shotAccuracyPercentage: null,
      perMatch: null,
      events: [],
      matchStats: [],
      matchesWithEvents: 0,
      readings: [],
      alerts: [],
      per90: {},
    };
  }

  const sourceEvents = rows(events);
  const eventsByMatch = sourceEvents.reduce((byMatch, event) => {
    const matchId = getMatchId(event);
    if (matchId) byMatch.set(matchId, [...(byMatch.get(matchId) || []), event]);
    return byMatch;
  }, new Map());
  const scopedEvents = sourceEvents
    .map((event) => {
      const matchId = getMatchId(event);
      const match = event.match || getMatchFromIndex(matchesById, matchId);
      return {
        ...event,
        match: match && rows(match.quickEvents).length === 0
          ? { ...match, quickEvents: eventsByMatch.get(matchId) || [] }
          : match,
      };
    })
    .filter((event) => event.match)
    .filter((event) => delegatedScope === 'Todos los registros' || isDelegatedDataValidated(event.match))
    .filter((event) => delegatedEventMatchesPlayer(event, player, players))
    .filter((event) => getDelegatedEventSide(event) === 'caudal')
    .filter((event) => matchAllowed(event.match))
    .filter((event) => matchVenueAllowed(event.match, venue));

  const orderedMatchIds = [...new Map(
    scopedEvents
      .slice()
      .sort((left, right) => `${right.match?.date || ''}:${getMatchId(right)}`.localeCompare(`${left.match?.date || ''}:${getMatchId(left)}`))
      .map((event) => [getMatchId(event), event.match])
  ).keys()];
  const limit = scopeLimit(quickScope);
  const visibleMatchIds = limit ? new Set(orderedMatchIds.slice(0, limit)) : null;
  const visibleEvents = visibleMatchIds
    ? scopedEvents.filter((event) => visibleMatchIds.has(getMatchId(event)))
    : scopedEvents;
  const summary = aggregateDelegatedStats(visibleEvents, { scope: 'player' });
  const matchesWithEvents = new Set(visibleEvents.map(getMatchId).filter(Boolean)).size;
  const perMatch = calculateDelegatedPerMatch(summary, matchesWithEvents, PLAYER_DELEGATED_LIVE_FIELDS);
  const shotAccuracyPercentage = summary.shots > 0
    ? round((summary.shotsOnTarget / summary.shots) * 100)
    : null;
  const shotAccuracy = shotAccuracyPercentage === null ? 'No disponible' : `${shotAccuracyPercentage}%`;
  const matchStats = [...new Map(visibleEvents.map((event) => [getMatchId(event), event.match])).entries()]
    .map(([matchId, match]) => {
      const matchEvents = visibleEvents.filter((event) => getMatchId(event) === matchId);
      const stats = aggregateDelegatedStats(matchEvents, { scope: 'player' });
      return {
        match,
        matchId,
        matchDate: match?.date || '',
        eventCount: matchEvents.length,
        ...stats,
        shotAccuracyPercentage: stats.shots > 0 ? round((stats.shotsOnTarget / stats.shots) * 100) : null,
      };
    })
    .sort((left, right) => `${left.matchDate}:${left.matchId}`.localeCompare(`${right.matchDate}:${right.matchId}`));
  const readings = [
    summary.recoveries >= 5 ? 'Alto volumen de recuperaciones' : null,
    summary.turnovers > summary.recoveries && summary.turnovers >= 3 ? 'Muchas pérdidas respecto a recuperaciones' : null,
    summary.shots >= 3 ? 'Participa en finalización' : null,
    summary.shots >= 3 && Number(shotAccuracyPercentage || 0) >= 50 ? 'Buena precisión de tiro' : null,
    limit && visibleEvents.length <= 2 ? 'Poca participación reciente' : null,
  ].filter(Boolean);

  return {
    ...summary,
    losses: summary.turnovers,
    fouls: summary.foulsCommitted,
    shotAccuracy,
    shotAccuracyPercentage,
    perMatch,
    events: visibleEvents,
    matchStats,
    matchesWithEvents,
    readings,
    alerts: readings,
    per90: {},
  };
};

export const buildPlayerDelegatedSeasonExportSummary = (input = {}) => buildPlayerDelegatedLiveSummary({
  ...input,
  quickScope: 'Temporada completa',
  delegatedScope: 'Todos los registros',
});
