const ANALYSIS_RPCS = Object.freeze({
  overview: 'get_my_player_analysis_overview',
  live: 'get_my_player_analysis_live_stats',
  production: 'get_my_player_production_actions',
  history: 'get_my_player_match_history',
});

export const PLAYER_ANALYSIS_PAGE_SIZE = 25;

export const PLAYER_ANALYSIS_DEFAULT_FILTERS = Object.freeze({
  competitionScope: 'season',
  venue: 'all',
  liveWindow: 'last_5_event_matches',
});

const COMPETITION_SCOPES = new Set(['season', 'all', 'league', 'copa_rfef', 'playoff', 'friendly']);
const VENUES = new Set(['all', 'home', 'away']);
const LIVE_WINDOWS = new Set(['last_3_event_matches', 'last_5_event_matches', 'full_scope']);
const VIDEO_HOSTS = new Set(['youtu.be', 'youtube.com', 'www.youtube.com', 'm.youtube.com']);

export class PlayerAnalysisLoadError extends Error {
  constructor(domain, kind = 'network') {
    const messages = {
      invalid_session: 'La sesión ya no es válida.',
      identity_invalid: 'No se pudo resolver el análisis vinculado a esta cuenta.',
      network: 'No se pudo cargar este bloque de Mi análisis.',
    };
    super(messages[kind] || messages.network);
    this.name = 'PlayerAnalysisLoadError';
    this.domain = domain;
    this.kind = kind;
  }
}

const isInvalidSessionError = (error) => {
  const status = Number(error?.status || error?.statusCode);
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return status === 401
    || code === 'PGRST301'
    || message.includes('jwt expired')
    || message.includes('invalid jwt');
};

const cleanText = (value) => String(value ?? '').trim();

const normalizeNumber = (value, { integer = false, nullable = false } = {}) => {
  if (value === null || value === undefined || value === '') return nullable ? null : 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return nullable ? null : 0;
  return integer ? Math.trunc(parsed) : parsed;
};

const normalizeCoverage = (value) => (
  cleanText(value).toUpperCase() === 'COMPLETE' ? 'COMPLETE' : 'PARTIAL'
);

const normalizeEnum = (value, allowed, fallback) => {
  const normalized = cleanText(value).toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
};

export const normalizePlayerAnalysisFilters = (filters = {}) => ({
  competitionScope: normalizeEnum(
    filters.competitionScope,
    COMPETITION_SCOPES,
    PLAYER_ANALYSIS_DEFAULT_FILTERS.competitionScope,
  ),
  venue: normalizeEnum(filters.venue, VENUES, PLAYER_ANALYSIS_DEFAULT_FILTERS.venue),
  liveWindow: normalizeEnum(
    filters.liveWindow,
    LIVE_WINDOWS,
    PLAYER_ANALYSIS_DEFAULT_FILTERS.liveWindow,
  ),
});

export const isAllowedPlayerAnalysisVideo = (value) => {
  const candidate = cleanText(value);
  if (!candidate) return false;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' && VIDEO_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
};

export const normalizePlayerAnalysisOverview = (row = {}) => ({
  competitionScope: normalizeEnum(row.competition_scope, COMPETITION_SCOPES, 'season'),
  venue: normalizeEnum(row.venue, VENUES, 'all'),
  matchRecords: normalizeNumber(row.match_records, { integer: true }),
  matchesPlayed: normalizeNumber(row.matches_played, { integer: true }),
  minutes: normalizeNumber(row.minutes, { integer: true }),
  possibleMinutes: normalizeNumber(row.possible_minutes, { integer: true }),
  minutesPerMatch: normalizeNumber(row.minutes_per_match),
  starts: normalizeNumber(row.starts, { integer: true }),
  benchEntries: normalizeNumber(row.bench_entries, { integer: true }),
  participationPercentage: normalizeNumber(row.participation_percentage),
  goals: normalizeNumber(row.goals, { integer: true }),
  goalsCoverage: normalizeCoverage(row.goals_coverage),
  assists: normalizeNumber(row.assists, { integer: true }),
  assistsCoverage: normalizeCoverage(row.assists_coverage),
  goalContributions: normalizeNumber(row.goal_contributions, { integer: true }),
  goalContributionsCoverage: normalizeCoverage(row.goal_contributions_coverage),
  goalsPer90: normalizeNumber(row.goals_per_90),
  assistsPer90: normalizeNumber(row.assists_per_90),
  goalContributionsPer90: normalizeNumber(row.goal_contributions_per_90),
  yellowCards: normalizeNumber(row.yellow_cards, { integer: true }),
  redCards: normalizeNumber(row.red_cards, { integer: true }),
});

export const normalizePlayerAnalysisLiveStats = (row = {}) => ({
  competitionScope: normalizeEnum(row.competition_scope, COMPETITION_SCOPES, 'season'),
  venue: normalizeEnum(row.venue, VENUES, 'all'),
  window: normalizeEnum(row.window, LIVE_WINDOWS, 'last_5_event_matches'),
  matchesWithEvents: normalizeNumber(row.matches_with_events, { integer: true }),
  eventCount: normalizeNumber(row.event_count, { integer: true }),
  goals: normalizeNumber(row.goals, { integer: true }),
  goalsPerMatch: normalizeNumber(row.goals_per_match),
  shots: normalizeNumber(row.shots, { integer: true }),
  shotsPerMatch: normalizeNumber(row.shots_per_match),
  shotsOnTarget: normalizeNumber(row.shots_on_target, { integer: true }),
  shotsOnTargetPerMatch: normalizeNumber(row.shots_on_target_per_match),
  shotAccuracyPercentage: normalizeNumber(row.shot_accuracy_percentage),
  crosses: normalizeNumber(row.crosses, { integer: true }),
  crossesPerMatch: normalizeNumber(row.crosses_per_match),
  turnovers: normalizeNumber(row.turnovers, { integer: true }),
  turnoversPerMatch: normalizeNumber(row.turnovers_per_match),
  steals: normalizeNumber(row.steals, { integer: true }),
  stealsPerMatch: normalizeNumber(row.steals_per_match),
  foulsCommitted: normalizeNumber(row.fouls_committed, { integer: true }),
  foulsCommittedPerMatch: normalizeNumber(row.fouls_committed_per_match),
  foulsReceived: normalizeNumber(row.fouls_received, { integer: true }),
  foulsReceivedPerMatch: normalizeNumber(row.fouls_received_per_match),
});

export const normalizePlayerProductionAction = (row = {}) => {
  const actionType = normalizeEnum(row.action_type, new Set(['goal', 'assist']), '');
  if (!actionType) return null;
  const videoUrl = row.video_available === true && isAllowedPlayerAnalysisVideo(row.video_url)
    ? cleanText(row.video_url)
    : '';
  return {
    actionType,
    minute: normalizeNumber(row.minute, { integer: true, nullable: true }),
    matchDate: cleanText(row.match_date),
    opponent: cleanText(row.opponent),
    opponentCrest: cleanText(row.opponent_crest),
    result: cleanText(row.result),
    competitionKey: cleanText(row.competition_key),
    competitionName: cleanText(row.competition_name),
    venue: normalizeEnum(row.venue, new Set(['home', 'away']), ''),
    phase: cleanText(row.phase),
    subphase: cleanText(row.subphase),
    contact: cleanText(row.contact),
    shotZoneKey: cleanText(row.shot_zone_key),
    shotZoneName: cleanText(row.shot_zone_name),
    assistZoneKey: cleanText(row.assist_zone_key),
    assistZoneName: cleanText(row.assist_zone_name),
    goalZoneKey: cleanText(row.goal_zone_key),
    goalZoneName: cleanText(row.goal_zone_name),
    counterpartRole: normalizeEnum(row.counterpart_role, new Set(['assistant', 'scorer']), ''),
    counterpartName: cleanText(row.counterpart_name),
    videoUrl,
    videoAvailable: Boolean(videoUrl),
  };
};

export const normalizePlayerMatchHistoryRow = (row = {}) => ({
  matchDate: cleanText(row.match_date),
  opponent: cleanText(row.opponent),
  opponentCrest: cleanText(row.opponent_crest),
  result: cleanText(row.result),
  outcome: normalizeEnum(row.outcome, new Set(['win', 'draw', 'loss']), ''),
  competitionKey: cleanText(row.competition_key),
  competitionName: cleanText(row.competition_name),
  competitionLogoUrl: cleanText(row.competition_logo_url),
  venue: normalizeEnum(row.venue, new Set(['home', 'away']), ''),
  role: cleanText(row.role),
  minutes: normalizeNumber(row.minutes, { integer: true }),
  goals: normalizeNumber(row.goals, { integer: true }),
  goalsCoverage: normalizeCoverage(row.goals_coverage),
  assists: normalizeNumber(row.assists, { integer: true }),
  assistsCoverage: normalizeCoverage(row.assists_coverage),
  yellowCards: normalizeNumber(row.yellow_cards, { integer: true }),
  redCards: normalizeNumber(row.red_cards, { integer: true }),
  hasAllowedVideo: row.has_allowed_video === true,
});

const historyRowKey = (row) => [
  row.matchDate,
  row.opponent,
  row.result,
  row.competitionKey,
  row.venue,
  row.role,
  row.minutes,
  row.goals,
  row.assists,
  row.yellowCards,
  row.redCards,
].join('|');

export const appendUniquePlayerHistory = (current = [], incoming = []) => {
  const seen = new Set(current.map(historyRowKey));
  return [...current, ...incoming.filter((row) => {
    const key = historyRowKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })];
};

const executeRpc = async (client, domain, rpcName, payload) => {
  if (!client || typeof client.rpc !== 'function') {
    throw new PlayerAnalysisLoadError(domain, 'invalid_session');
  }
  let response;
  try {
    response = await client.rpc(rpcName, payload);
  } catch (error) {
    throw new PlayerAnalysisLoadError(
      domain,
      isInvalidSessionError(error) ? 'invalid_session' : 'network',
    );
  }
  if (response?.error) {
    throw new PlayerAnalysisLoadError(
      domain,
      isInvalidSessionError(response.error) ? 'invalid_session' : 'network',
    );
  }
  if (!Array.isArray(response?.data)) {
    throw new PlayerAnalysisLoadError(domain, 'identity_invalid');
  }
  return response.data;
};

const readSingleRow = (rows, domain, normalizer) => {
  if (rows.length === 0) return null;
  if (rows.length !== 1 || !rows[0] || typeof rows[0] !== 'object') {
    throw new PlayerAnalysisLoadError(domain, 'identity_invalid');
  }
  return normalizer(rows[0]);
};

const rpcFilters = (filters) => {
  const normalized = normalizePlayerAnalysisFilters(filters);
  return {
    p_competition_scope: normalized.competitionScope,
    p_venue: normalized.venue,
  };
};

export async function loadPlayerAnalysisOverview(client, filters = {}) {
  const rows = await executeRpc(client, 'overview', ANALYSIS_RPCS.overview, rpcFilters(filters));
  return readSingleRow(rows, 'overview', normalizePlayerAnalysisOverview);
}

export async function loadPlayerAnalysisLiveStats(client, filters = {}) {
  const normalized = normalizePlayerAnalysisFilters(filters);
  const rows = await executeRpc(client, 'live', ANALYSIS_RPCS.live, {
    p_competition_scope: normalized.competitionScope,
    p_venue: normalized.venue,
    p_window: normalized.liveWindow,
  });
  return readSingleRow(rows, 'live', normalizePlayerAnalysisLiveStats);
}

export async function loadPlayerProductionActions(client, filters = {}) {
  const rows = await executeRpc(client, 'production', ANALYSIS_RPCS.production, rpcFilters(filters));
  return rows.map(normalizePlayerProductionAction).filter(Boolean);
}

export async function loadPlayerMatchHistoryPage(
  client,
  filters = {},
  { limit = PLAYER_ANALYSIS_PAGE_SIZE, offset = 0 } = {},
) {
  const safeLimit = Math.min(50, Math.max(1, Math.trunc(Number(limit) || PLAYER_ANALYSIS_PAGE_SIZE)));
  const safeOffset = Math.max(0, Math.trunc(Number(offset) || 0));
  const rows = await executeRpc(client, 'history', ANALYSIS_RPCS.history, {
    ...rpcFilters(filters),
    p_limit: safeLimit,
    p_offset: safeOffset,
  });
  const normalizedRows = rows.map(normalizePlayerMatchHistoryRow);
  return {
    rows: normalizedRows,
    offset: safeOffset,
    nextOffset: safeOffset + rows.length,
    hasMore: rows.length === safeLimit,
  };
}
