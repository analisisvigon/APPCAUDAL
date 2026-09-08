import assert from 'node:assert/strict';
import {
  PLAYER_ANALYSIS_PAGE_SIZE,
  PLAYER_ANALYSIS_COMPETITION_MINUTE_SCOPES,
  PLAYER_ANALYSIS_DISTRIBUTION_PAGE_SIZE,
  PlayerAnalysisLoadError,
  appendUniquePlayerHistory,
  getMyPlayerAnalysisMatchStats,
  isAllowedPlayerAnalysisVideo,
  loadPlayerAnalysisLiveStats,
  loadPlayerAnalysisOverview,
  loadPlayerCompetitionMinutesDistribution,
  loadPlayerMatchHistoryPage,
  loadPlayerProductionActions,
  normalizePlayerMatchHistoryRow,
  normalizePlayerAnalysisMatchStats,
  normalizePlayerAnalysisFilters,
} from './playerAnalysisStore.js';

const overviewRow = {
  competition_scope: 'all', venue: 'home', match_records: '8', matches_played: '7',
  minutes: '462', possible_minutes: '720', minutes_per_match: '66', starts: '6',
  bench_entries: '1', participation_percentage: '64.17', goals: '2', goals_coverage: 'PARTIAL',
  assists: '3', assists_coverage: 'COMPLETE', goal_contributions: '5',
  goal_contributions_coverage: 'PARTIAL', goals_per_90: '0.39', assists_per_90: '0.58',
  goal_contributions_per_90: '0.97', yellow_cards: '2', red_cards: '0',
};
const liveRow = {
  competition_scope: 'all', venue: 'home', window: 'last_3_event_matches',
  matches_with_events: '3', event_count: '18', goals: '2', goals_per_match: '0.67',
  shots: '8', shots_per_match: '2.67', shots_on_target: '5', shots_on_target_per_match: '1.67',
  shot_accuracy_percentage: '62.5', crosses: '4', crosses_per_match: '1.33',
  turnovers: '9', turnovers_per_match: '3', steals: '6', steals_per_match: '2',
  fouls_committed: '3', fouls_committed_per_match: '1', fouls_received: '5',
  fouls_received_per_match: '1.67',
};
const matchStatsRows = [{
  match_id: '11111111-1111-4111-8111-111111111111', match_date: '2026-08-16',
  opponent: 'Rival', opponent_crest: 'https://assets.example/rival.png',
  competition_key: 'league', competition_name: 'Liga', is_home: true, minutes: '74',
  event_count: '12', goals: '1', shots: '4', shots_on_target: '2',
  shot_accuracy_percentage: '50', crosses: '3', turnovers: '5', steals: '6',
  fouls_committed: '2', fouls_received: '4',
}, {
  match_id: '22222222-2222-4222-8222-222222222222', match_date: '2026-08-23',
  opponent: 'Otro rival', opponent_crest: null, competition_key: 'league',
  competition_name: 'Liga', is_home: false, minutes: null, event_count: '1',
  goals: null, shots: null, shots_on_target: null, shot_accuracy_percentage: null,
  crosses: null, turnovers: null, steals: null, fouls_committed: null, fouls_received: null,
}];
const productionRows = [{
  action_type: 'goal', minute: '10', match_date: '2026-08-16', opponent: 'Rival',
  opponent_crest: '/crest.png', result: '1-1', competition_key: 'copa_rfef',
  competition_name: 'Copa RFEF', venue: 'home', phase: 'ABP', subphase: 'Córner',
  contact: 'Cabeza', shot_zone_key: 'finalizacion_centro', shot_zone_name: 'F. Finalización centro',
  assist_zone_key: null, assist_zone_name: null, goal_zone_key: 'alta_centro',
  goal_zone_name: 'Alta centro', counterpart_role: 'assistant', counterpart_name: 'Compañero',
  video_url: 'https://www.youtube.com/watch?v=ok', video_available: true,
}, {
  action_type: 'assist', minute: null, match_date: '2026-08-20', opponent: 'Otro rival',
  counterpart_role: 'scorer', counterpart_name: 'Otro compañero',
  assist_zone_key: 'creacion_derecha', assist_zone_name: 'F. Creación derecha',
  video_url: 'https://evil.example/video', video_available: true,
}];
const historyRows = [{
  match_date: '2026-08-16', opponent: 'Rival', opponent_crest: '/crest.png', result: '1-1',
  outcome: 'draw', competition_key: 'copa_rfef', competition_name: 'Copa RFEF',
  competition_logo_url: '/competition.png', venue: 'home', role: 'Titular', minutes: '90',
  goals: '1', goals_coverage: 'COMPLETE', assists: '0', assists_coverage: 'PARTIAL',
  yellow_cards: '1', red_cards: '0', has_allowed_video: true,
}];

const calls = [];
const responses = {
  get_my_player_analysis_overview: [overviewRow],
  get_my_player_analysis_live_stats: [liveRow],
  get_my_player_analysis_match_stats: matchStatsRows,
  get_my_player_production_actions: productionRows,
  get_my_player_match_history: historyRows,
};
const client = {
  async rpc(name, payload) {
    calls.push([name, payload]);
    return { data: responses[name], error: null };
  },
};

const filters = { competitionScope: 'all', venue: 'home', liveWindow: 'last_3_event_matches' };
const [overview, live, matchStats, production, history] = await Promise.all([
  loadPlayerAnalysisOverview(client, filters),
  loadPlayerAnalysisLiveStats(client, filters),
  getMyPlayerAnalysisMatchStats(client, filters),
  loadPlayerProductionActions(client, filters),
  loadPlayerMatchHistoryPage(client, filters, { limit: 25, offset: 25 }),
]);

assert.deepEqual(calls, [
  ['get_my_player_analysis_overview', { p_competition_scope: 'all', p_venue: 'home' }],
  ['get_my_player_analysis_live_stats', { p_competition_scope: 'all', p_venue: 'home', p_window: 'last_3_event_matches' }],
  ['get_my_player_analysis_match_stats', { p_competition_scope: 'all', p_venue: 'home', p_window: 'last_3_event_matches' }],
  ['get_my_player_production_actions', { p_competition_scope: 'all', p_venue: 'home' }],
  ['get_my_player_match_history', { p_competition_scope: 'all', p_venue: 'home', p_limit: 25, p_offset: 25 }],
], 'Las cinco RPC reciben únicamente filtros deportivos y paginación.');
for (const [, payload] of calls) {
  assert.equal(Object.keys(payload).some((key) => /jugador|user|membership|player.*id/i.test(key)), false);
}

assert.equal(overview.matchesPlayed, 7);
assert.equal(overview.minutesPerMatch, 66);
assert.equal(overview.goalsCoverage, 'PARTIAL');
assert.equal(live.matchesWithEvents, 3);
assert.equal(live.shotAccuracyPercentage, 62.5);
assert.deepEqual(matchStats, [{
  matchId: '11111111-1111-4111-8111-111111111111', matchDate: '2026-08-16',
  opponent: 'Rival', opponentCrest: 'https://assets.example/rival.png',
  competitionKey: 'league', competitionName: 'Liga', isHome: true, minutes: 74,
  eventCount: 12, goals: 1, shots: 4, shotsOnTarget: 2, shotAccuracyPercentage: 50,
  crosses: 3, turnovers: 5, steals: 6, foulsCommitted: 2, foulsReceived: 4,
}, {
  matchId: '22222222-2222-4222-8222-222222222222', matchDate: '2026-08-23',
  opponent: 'Otro rival', opponentCrest: '', competitionKey: 'league',
  competitionName: 'Liga', isHome: false, minutes: null, eventCount: 1,
  goals: 0, shots: 0, shotsOnTarget: 0, shotAccuracyPercentage: null,
  crosses: 0, turnovers: 0, steals: 0, foulsCommitted: 0, foulsReceived: 0,
}], 'El DTO por partido conserva identidad, orden backend, métricas cero y nulls independientes.');
assert.equal(production.length, 2);
assert.equal(production[0].counterpartName, 'Compañero');
assert.equal(production[0].videoAvailable, true);
assert.equal(production[1].videoAvailable, false, 'El frontend vuelve a cerrar un host no permitido.');
assert.equal(production[1].videoUrl, '');
assert.deepEqual(history, {
  rows: [{
    matchDate: '2026-08-16', opponent: 'Rival', opponentCrest: '/crest.png', result: '1-1',
    outcome: 'draw', competitionKey: 'copa_rfef', competitionName: 'Copa RFEF',
    competitionLogoUrl: '/competition.png', venue: 'home', role: 'Titular', minutes: 90,
    goals: 1, goalsCoverage: 'COMPLETE', assists: 0, assistsCoverage: 'PARTIAL',
    yellowCards: 1, redCards: 0, hasAllowedVideo: true,
  }],
  offset: 25,
  nextOffset: 26,
  hasMore: false,
});

assert.equal(PLAYER_ANALYSIS_PAGE_SIZE, 25);
assert.equal(PLAYER_ANALYSIS_DISTRIBUTION_PAGE_SIZE, 50);
assert.deepEqual(PLAYER_ANALYSIS_COMPETITION_MINUTE_SCOPES, ['league', 'copa_rfef', 'playoff', 'friendly']);
assert.deepEqual(normalizePlayerAnalysisFilters({ competitionScope: 'bad', venue: 'bad', liveWindow: 'bad' }), {
  competitionScope: 'season', venue: 'all', liveWindow: 'last_5_event_matches',
});
assert.equal(isAllowedPlayerAnalysisVideo('https://youtu.be/abc'), true);
assert.equal(isAllowedPlayerAnalysisVideo('http://youtube.com/watch?v=x'), false);
assert.equal(isAllowedPlayerAnalysisVideo('https://youtube.com.evil.example/x'), false);
assert.equal(
  normalizePlayerMatchHistoryRow({ role: 'Fuera', minutes: null }).minutes,
  null,
  'Fuera conserva minutos desconocidos/no aplicables para que la UI muestre un guion.',
);
assert.deepEqual(
  normalizePlayerAnalysisMatchStats({ match_id: 'match', is_home: 'true', minutes: -1, shot_accuracy_percentage: '' }),
  {
    matchId: 'match', matchDate: '', opponent: '', opponentCrest: '', competitionKey: '',
    competitionName: '', isHome: null, minutes: null, eventCount: 0, goals: 0, shots: 0,
    shotsOnTarget: 0, shotAccuracyPercentage: null, crosses: 0, turnovers: 0,
    steals: 0, foulsCommitted: 0, foulsReceived: 0,
  },
  'La normalización no inventa localía, minutos ni precisión ausentes.',
);

const unique = appendUniquePlayerHistory(history.rows, [...history.rows, { ...history.rows[0], opponent: 'Nuevo rival' }]);
assert.equal(unique.length, 2, 'La paginación no duplica filas ya cargadas.');

assert.equal(await loadPlayerAnalysisOverview({ rpc: async () => ({ data: [], error: null }) }), null);
assert.deepEqual(await loadPlayerProductionActions({ rpc: async () => ({ data: [], error: null }) }), []);
await assert.rejects(
  () => loadPlayerAnalysisOverview({ rpc: async () => ({ data: [overviewRow, overviewRow], error: null }) }),
  (error) => error instanceof PlayerAnalysisLoadError && error.domain === 'overview' && error.kind === 'identity_invalid',
);
await assert.rejects(
  () => loadPlayerAnalysisLiveStats({ rpc: async () => ({ data: null, error: { message: 'offline' } }) }),
  (error) => error instanceof PlayerAnalysisLoadError && error.domain === 'live' && error.kind === 'network',
);
await assert.rejects(
  () => getMyPlayerAnalysisMatchStats({ rpc: async () => ({ data: null, error: { message: 'offline' } }) }),
  (error) => error instanceof PlayerAnalysisLoadError && error.domain === 'match_stats' && error.kind === 'network',
);
await assert.rejects(
  () => loadPlayerProductionActions({ rpc: async () => { throw Object.assign(new Error('JWT expired'), { status: 401 }); } }),
  (error) => error instanceof PlayerAnalysisLoadError && error.domain === 'production' && error.kind === 'invalid_session',
);
await assert.rejects(
  () => loadPlayerMatchHistoryPage(null),
  (error) => error instanceof PlayerAnalysisLoadError && error.domain === 'history' && error.kind === 'invalid_session',
);

const distributionCalls = [];
const pendingDistributionCalls = [];
const distributionMinutes = { league: 300, copa_rfef: 120, playoff: 0, friendly: 45 };
const distributionHistory = [{
  match_date: '2026-08-20', opponent: 'Rival Liga', competition_key: 'league',
  competition_name: 'Liga Segunda Federación', competition_logo_url: 'https://assets.example/league.png',
  venue: 'away', minutes: 90,
}, {
  match_date: '2026-08-10', opponent: 'Rival Copa', competition_key: 'copa_rfef',
  competition_name: 'Copa RFEF', competition_logo_url: 'https://assets.example/cup.png',
  venue: 'away', minutes: 120,
}];
const distributionClient = {
  rpc(name, payload) {
    distributionCalls.push([name, payload]);
    return new Promise((resolve) => pendingDistributionCalls.push(() => {
      if (name === 'get_my_player_analysis_overview') {
        resolve({ data: [{ ...overviewRow, competition_scope: payload.p_competition_scope, venue: payload.p_venue, minutes: distributionMinutes[payload.p_competition_scope] }], error: null });
        return;
      }
      resolve({ data: distributionHistory, error: null });
    }));
  },
};
const distributionPromise = loadPlayerCompetitionMinutesDistribution(distributionClient, {
  competitionScope: 'season',
  venue: 'away',
});
await Promise.resolve();
await Promise.resolve();
assert.equal(distributionCalls.length, 5, 'Los cuatro Overview y el historial seguro arrancan en paralelo.');
pendingDistributionCalls.forEach((resolve) => resolve());
const distribution = await distributionPromise;
assert.deepEqual(distributionCalls.slice(0, 4), PLAYER_ANALYSIS_COMPETITION_MINUTE_SCOPES.map((scope) => [
  'get_my_player_analysis_overview',
  { p_competition_scope: scope, p_venue: 'away' },
]));
assert.deepEqual(distributionCalls[4], [
  'get_my_player_match_history',
  { p_competition_scope: 'season', p_venue: 'away', p_limit: 50, p_offset: 0 },
]);
assert.equal(distribution.enabled, true);
assert.deepEqual(distribution.scopeMinutes, [
  { key: 'league', minutes: 300 },
  { key: 'copa_rfef', minutes: 120 },
  { key: 'playoff', minutes: 0 },
  { key: 'friendly', minutes: 45 },
]);
assert.equal(distribution.historyRows[0].competitionName, 'Liga Segunda Federación');
distributionCalls.forEach(([, payload]) => {
  assert.equal(Object.keys(payload).some((key) => /jugador|user|membership|player.*id/i.test(key)), false);
});

let concreteScopeCalls = 0;
const concreteScope = await loadPlayerCompetitionMinutesDistribution({
  rpc() { concreteScopeCalls += 1; throw new Error('No debe ejecutarse'); },
}, { competitionScope: 'league', venue: 'home' });
assert.equal(concreteScopeCalls, 0, 'Un filtro concreto no dispara ninguna RPC de reparto.');
assert.deepEqual(concreteScope, {
  enabled: false,
  competitionScope: 'league',
  venue: 'home',
  scopeMinutes: [],
  historyRows: [],
});

await assert.rejects(
  () => loadPlayerCompetitionMinutesDistribution({ rpc: async () => ({ data: null, error: { message: 'offline' } }) }, { competitionScope: 'all' }),
  (error) => error instanceof PlayerAnalysisLoadError
    && error.domain === 'competition_minutes'
    && error.kind === 'network',
  'Un fallo del reparto conserva un dominio independiente.',
);

console.log('playerAnalysisStore: RPC, reparto paralelo por competición, filtros, errores y paginación validados.');
