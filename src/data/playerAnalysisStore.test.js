import assert from 'node:assert/strict';
import {
  PLAYER_ANALYSIS_PAGE_SIZE,
  PlayerAnalysisLoadError,
  appendUniquePlayerHistory,
  isAllowedPlayerAnalysisVideo,
  loadPlayerAnalysisLiveStats,
  loadPlayerAnalysisOverview,
  loadPlayerMatchHistoryPage,
  loadPlayerProductionActions,
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
const [overview, live, production, history] = await Promise.all([
  loadPlayerAnalysisOverview(client, filters),
  loadPlayerAnalysisLiveStats(client, filters),
  loadPlayerProductionActions(client, filters),
  loadPlayerMatchHistoryPage(client, filters, { limit: 25, offset: 25 }),
]);

assert.deepEqual(calls, [
  ['get_my_player_analysis_overview', { p_competition_scope: 'all', p_venue: 'home' }],
  ['get_my_player_analysis_live_stats', { p_competition_scope: 'all', p_venue: 'home', p_window: 'last_3_event_matches' }],
  ['get_my_player_production_actions', { p_competition_scope: 'all', p_venue: 'home' }],
  ['get_my_player_match_history', { p_competition_scope: 'all', p_venue: 'home', p_limit: 25, p_offset: 25 }],
], 'Las cuatro RPC reciben únicamente filtros deportivos y paginación.');
for (const [, payload] of calls) {
  assert.equal(Object.keys(payload).some((key) => /jugador|user|membership|player.*id/i.test(key)), false);
}

assert.equal(overview.matchesPlayed, 7);
assert.equal(overview.minutesPerMatch, 66);
assert.equal(overview.goalsCoverage, 'PARTIAL');
assert.equal(live.matchesWithEvents, 3);
assert.equal(live.shotAccuracyPercentage, 62.5);
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
assert.deepEqual(normalizePlayerAnalysisFilters({ competitionScope: 'bad', venue: 'bad', liveWindow: 'bad' }), {
  competitionScope: 'season', venue: 'all', liveWindow: 'last_5_event_matches',
});
assert.equal(isAllowedPlayerAnalysisVideo('https://youtu.be/abc'), true);
assert.equal(isAllowedPlayerAnalysisVideo('http://youtube.com/watch?v=x'), false);
assert.equal(isAllowedPlayerAnalysisVideo('https://youtube.com.evil.example/x'), false);

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
  () => loadPlayerProductionActions({ rpc: async () => { throw Object.assign(new Error('JWT expired'), { status: 401 }); } }),
  (error) => error instanceof PlayerAnalysisLoadError && error.domain === 'production' && error.kind === 'invalid_session',
);
await assert.rejects(
  () => loadPlayerMatchHistoryPage(null),
  (error) => error instanceof PlayerAnalysisLoadError && error.domain === 'history' && error.kind === 'invalid_session',
);

console.log('playerAnalysisStore: cuatro RPC, filtros, normalización, vídeo, errores y paginación validados.');
