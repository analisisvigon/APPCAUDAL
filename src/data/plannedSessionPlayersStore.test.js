import assert from 'node:assert/strict';
import { freezePlannedRoster, loadPlannedRosterCandidates, loadPlannedSessionPlayers,
  reconcilePlannedDate, savePlannedAvailability } from './plannedSessionsStore.js';

const calls = [];
const rows = {
  club_team_season_players: [{ id: 'membership-1', club_team_season_id: 'cts-1', player_id: 'player-1',
    joined_on: null, left_on: null, has_departed: false }],
  players_database: [{ id: 'player-1', name: 'Nombre real' }],
  player_positions: [{ player_id: 'player-1', position_key: 'goalkeeper', position_type: 'natural', is_primary: true }],
  planned_session_player_roster: [{ session_id: 'session-1', player_id: 'player-1',
    source_membership_id: 'membership-1', player_name_snapshot: 'Nombre histórico', position_key_snapshot: 'goalkeeper' }],
  planned_session_player_availability: [{ session_id: 'session-1', player_id: 'player-1',
    status: 'injured', observation: 'Observación propia de esta sesión' }],
};
const client = {
  from(table) {
    calls.push({ table });
    return { select() { return this; }, eq(column, value) { calls.push({ table, column, value }); return this; },
      is() { return this; }, in() { return this; },
      then(resolve) { resolve({ data: rows[table], error: null }); } };
  },
  async rpc(name, args) { calls.push({ name, args }); return { data: 5, error: null }; },
};

const candidates = await loadPlannedRosterCandidates(client, 'cts-1');
assert.deepEqual(candidates.map((row) => [row.id, row.player_id, row.name, row.position_key]),
  [['membership-1', 'player-1', 'Nombre real', 'goalkeeper']]);
assert.ok(calls.some((call) => call.table === 'club_team_season_players' &&
  call.column === 'club_team_season_id' && call.value === 'cts-1'));
const loaded = await loadPlannedSessionPlayers(client, 'session-1');
assert.equal(loaded.roster[0].player_name_snapshot, 'Nombre histórico', 'se usa el snapshot, no el nombre actual');
assert.equal(loaded.availability[0].status, 'injured');
assert.ok(calls.every((call) => !call.name), 'abrir la plantilla no llama RPC de escritura');

await freezePlannedRoster(client, 'session-1', 4, ['membership-1'], true, true);
await savePlannedAvailability(client, 'session-1', 5,
  [{ player_id: 'player-1', status: 'adapted', observation: null }]);
await reconcilePlannedDate(client, 'session-1', 6, '2026-10-26', ['membership-1'], true);
assert.deepEqual(calls.slice(-3), [
  { name: 'freeze_planned_session_roster_04b', args: {
    p_session_id: 'session-1', p_expected_revision: 4, p_source_membership_ids: ['membership-1'],
    p_confirm_uncertain_dates: true, p_confirm_existing_session: true,
  } },
  { name: 'save_planned_session_availability_04b', args: {
    p_session_id: 'session-1', p_expected_revision: 5,
    p_changes: [{ player_id: 'player-1', status: 'adapted', observation: null }],
  } },
  { name: 'reconcile_planned_session_date_04b', args: {
    p_session_id: 'session-1', p_expected_revision: 6, p_new_date: '2026-10-26',
    p_confirmed_source_membership_ids: ['membership-1'], p_confirm_uncertain_dates: true,
  } },
]);
await assert.rejects(savePlannedAvailability({ rpc: async () => ({ data: null,
  error: { code: '40001', message: 'CAS obsoleto' } }) }, 'session-1', 4, []),
{ code: '40001' }, 'una revisión obsoleta nunca se presenta como guardada');
console.log('planned session players store tests passed');
