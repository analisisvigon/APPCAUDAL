import assert from 'node:assert/strict';
import {
  checkPlannedSessionRealizationReady,
  confirmPlannedSessionRealization,
  loadPlannedSessionRealization,
  loadPlayerRealizedTrainingStats,
} from './plannedSessionsStore.js';

const rpcCalls = [];
const queryCalls = [];
let ready = true;
let tableRows = {};

class Query {
  constructor(table) {
    this.table = table;
  }
  select(columns) { queryCalls.push([this.table, 'select', columns]); return this; }
  eq(column, value) { queryCalls.push([this.table, 'eq', column, value]); return this; }
  lte(column, value) { queryCalls.push([this.table, 'lte', column, value]); return this; }
  is(column, value) { queryCalls.push([this.table, 'is', column, value]); return this; }
  in(column, values) { queryCalls.push([this.table, 'in', column, values]); return this; }
  maybeSingle() {
    return Promise.resolve({ data: tableRows[this.table]?.[0] || null, error: null });
  }
  then(resolve) { resolve({ data: tableRows[this.table] || [], error: null }); }
}

const client = {
  from(table) { return new Query(table); },
  async rpc(name, args) {
    rpcCalls.push({ name, args });
    if (name === 'planned_session_realization_ready_v1') return { data: ready, error: null };
    if (name === 'confirm_planned_training_session_realized_v1') return { data: { session_id: args.p_session_id }, error: null };
    throw new Error(`RPC inesperada: ${name}`);
  },
};

assert.equal(await checkPlannedSessionRealizationReady(client), true);
ready = false;
assert.equal(await checkPlannedSessionRealizationReady(client), false);
ready = true;
await assert.rejects(confirmPlannedSessionRealization(client, 'session-a', 4, false),
  /revisaste toda la lista/);
await confirmPlannedSessionRealization(client, 'session-a', 4, true);
assert.deepEqual(rpcCalls.at(-1), {
  name: 'confirm_planned_training_session_realized_v1',
  args: { p_session_id: 'session-a', p_expected_revision: 4, p_review_acknowledged: true },
});

tableRows = {
  planned_session_realizations: [{
    session_id: 'session-a', realized_at: '2026-03-10T18:00:00Z',
    realized_by_membership_id: 'membership-a', roster_count: 2,
    default_available_count: 1, initial_status_hash: 'a'.repeat(32),
  }],
  planned_session_realized_player_statuses: [
    { session_id: 'session-a', player_id: 'player-a', status: 'available', status_source: 'default' },
    { session_id: 'session-a', player_id: 'player-b', status: 'adapted', status_source: 'explicit' },
  ],
};
const realization = await loadPlannedSessionRealization(client, 'session-a');
assert.equal(realization.players.length, 2);
tableRows.planned_session_realized_player_statuses.pop();
await assert.rejects(loadPlannedSessionRealization(client, 'session-a'), /no coincide con la plantilla/);

tableRows = {
  planned_training_sessions: [
    { id: 'session-a' }, { id: 'session-a' }, { id: 'session-b' },
  ],
  planned_session_realized_player_statuses: [
    { session_id: 'session-a', status: 'available' },
    { session_id: 'session-b', status: 'adapted' },
    { session_id: 'session-b', status: 'adapted' },
  ],
};
queryCalls.length = 0;
const loaded = await loadPlayerRealizedTrainingStats(client, 'player-a', 'cts-a', '2026-03-10');
assert.equal(loaded.ready, true);
assert.equal(loaded.summary.total, 2, 'cada sesión se cuenta una sola vez');
assert.equal(loaded.summary.completed, 2);
assert.equal(loaded.summary.participationPercentage, 100);
assert.ok(queryCalls.some((call) => call[0] === 'planned_training_sessions' &&
  call[1] === 'eq' && call[2] === 'club_team_season_id' && call[3] === 'cts-a'));
assert.ok(queryCalls.some((call) => call[0] === 'planned_training_sessions' &&
  call[1] === 'lte' && call[2] === 'session_date' && call[3] === '2026-03-10'));
assert.ok(queryCalls.some((call) => call[0] === 'planned_training_sessions' &&
  call[1] === 'is' && call[2] === 'cancelled_at' && call[3] === null));
assert.ok(queryCalls.some((call) => call[0] === 'planned_training_sessions' &&
  call[1] === 'is' && call[2] === 'retired_at' && call[3] === null));
assert.ok(queryCalls.some((call) => call[0] === 'planned_session_realized_player_statuses' &&
  call[1] === 'eq' && call[2] === 'player_id' && call[3] === 'player-a'));

tableRows.planned_training_sessions = [];
const empty = await loadPlayerRealizedTrainingStats(client, 'player-a', 'cts-a', '2026-03-10');
assert.equal(empty.summary.total, 0);

console.log('player realized training store tests passed');
