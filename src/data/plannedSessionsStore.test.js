import assert from 'node:assert/strict';
import {
  confirmPlannedSession,
  createPlannedDraft,
  loadPlannedContexts,
  listPlannedSessions,
  savePlannedSession,
} from './plannedSessionsStore.js';

const calls = [];
const rows = {
  club_team_seasons: [{ id: 'cts-id', club_id: 'club-id', team_id: 'team-id', season_id: 'season-id' }],
  club_seasons: [{ id: 'season-id', club_id: 'club-id', label: '2026/2027',
    starts_on: '2026-07-01', ends_on: '2027-06-30', is_active: true, status: 'open' }],
  club_teams: [{ id: 'team-id', club_id: 'club-id', code: 'caudal' }],
  equipos_rivales: [{ id: 'team-id', name: 'C.D. Caudal' }],
  planned_training_sessions: [{ id: 'session-id', club_team_season_id: 'cts-id',
    session_date: '2026-10-18', morphology_pattern: 'MD-3' }],
  planned_session_slots: [{ session_id: 'session-id', duration_minutes: 15 }],
};
const selects = [];
const client = {
  from(table) {
    const query = {
      select(columns) { selects.push([table, columns]); return this; },
      eq() { return this; },
      in() { return this; },
      order() { return this; },
      then(resolve) { resolve({ data: rows[table], error: null }); },
    };
    return query;
  },
  async rpc(name, args) {
    calls.push({ name, args });
    return { data: name === 'create_planned_session_draft' ? 'session-id' : 2, error: null };
  },
};

const contexts = await loadPlannedContexts(client, 'club-id');
assert.equal(contexts.length, 1);
assert.equal(contexts[0].id, 'cts-id', 'la clave seleccionada es CTS, no season_id');
assert.equal(contexts[0].team_name, 'C.D. Caudal');
assert.equal(contexts[0].label, '2026/2027');
const listed = await listPlannedSessions(client, 'cts-id');
assert.equal(listed[0].morphology_pattern, 'MD-3');
assert.equal(listed[0].total_minutes, 15);
assert.ok(selects.find(([table, columns]) => table === 'planned_training_sessions' &&
  columns.split(',').includes('morphology_pattern')), 'el listado y calendario consultan el MD persistido');
assert.equal(await createPlannedDraft(client, 'cts-id', '2026-10-18'), 'session-id');
assert.equal(await savePlannedSession(client, { p_session_id: 'session-id' }), 2);
assert.equal(await confirmPlannedSession(client, 'session-id', 2), 2);
assert.deepEqual(calls.map((call) => call.name), [
  'create_planned_session_draft', 'save_planned_session', 'confirm_planned_session',
]);
assert.deepEqual(calls[0].args, {
  p_club_team_season_id: 'cts-id', p_session_date: '2026-10-18',
});
assert.deepEqual(calls[2].args, { p_session_id: 'session-id', p_expected_revision: 2 });

console.log('planned sessions store tests passed');
