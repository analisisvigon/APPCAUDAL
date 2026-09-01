import assert from 'node:assert/strict';
import { PLAYER_HOME_PERFORMANCE_LIMIT, loadPlayerHomeDashboard } from './playerHomeStore.js';

const overview = {
  competition_scope: 'season', venue: 'all', match_records: 4, matches_played: 4,
  minutes: 347, starts: 4, goal_contributions: 1, goal_contributions_coverage: 'COMPLETE',
};
const match = {
  partido_id: 'm1', match_date: '2026-08-31', is_home: true,
  home_team: 'Caudal', away_team: 'Rival', home_score: 2, away_score: 0,
};
const tableRows = {
  wellness_entries: [{ id: 'w1', entry_date: '2026-09-01', health_ratio: 7.8 }],
  rpe_entries: [{ id: 'r1', entry_date: '2026-09-01', rpe: 1 }],
};
const calls = [];
const client = {
  rpc(name, payload) {
    calls.push(['rpc', name, payload]);
    if (name === 'get_my_player_analysis_overview') return Promise.resolve({ data: [overview], error: null });
    if (name === 'get_my_player_matches') return Promise.resolve({ data: [match], error: null });
    return Promise.resolve({ data: null, error: { message: 'RPC no permitida' } });
  },
  from(table) {
    calls.push(['from', table]);
    return {
      select(columns) { calls.push(['select', table, columns]); return this; },
      order() { return this; },
      range(start, end) {
        calls.push(['range', table, start, end]);
        return Promise.resolve({ data: tableRows[table] || [], error: null });
      },
    };
  },
};

const result = await loadPlayerHomeDashboard(client);
assert.equal(PLAYER_HOME_PERFORMANCE_LIMIT, 1);
assert.equal(result.analysis.status, 'ready');
assert.equal(result.analysis.data.minutes, 347);
assert.equal(result.matches.status, 'ready');
assert.equal(result.matches.data[0].partidoId, 'm1');
assert.equal(result.performance.status, 'ready');
assert.equal(result.performance.data.wellness[0].health_ratio, 7.8);
assert.equal(result.performance.data.rpe[0].rpe, 1);
assert.deepEqual(calls.filter(([kind]) => kind === 'rpc'), [
  ['rpc', 'get_my_player_analysis_overview', { p_competition_scope: 'season', p_venue: 'all' }],
  ['rpc', 'get_my_player_matches', undefined],
]);
assert.deepEqual(calls.filter(([kind]) => kind === 'from').map(([, table]) => table), ['wellness_entries', 'rpe_entries']);
assert.deepEqual(calls.filter(([kind]) => kind === 'range'), [
  ['range', 'wellness_entries', 0, 1],
  ['range', 'rpe_entries', 0, 1],
]);

const partialClient = {
  ...client,
  rpc(name) {
    if (name === 'get_my_player_analysis_overview') return Promise.resolve({ data: null, error: { message: 'offline' } });
    return Promise.resolve({ data: [], error: null });
  },
};
const partial = await loadPlayerHomeDashboard(partialClient);
assert.equal(partial.analysis.status, 'error');
assert.equal(partial.matches.status, 'ready', 'Un fallo de análisis no oculta los otros dominios seguros.');
assert.equal(partial.performance.status, 'ready');

console.log('playerHomeStore: solo fuentes PLAYER, carga mínima y fallos parciales validados.');
