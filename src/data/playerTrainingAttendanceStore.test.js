import assert from 'node:assert/strict';
import { loadPlayerTrainingAttendance } from './plannedSessionsStore.js';

const queryLog = [];
const rows = {
  planned_training_sessions: [
    { id: 'past-a', club_team_season_id: 'active-cts', session_date: '2026-10-01', planning_state: 'confirmed' },
    { id: 'past-b', club_team_season_id: 'active-cts', session_date: '2026-10-02', planning_state: 'confirmed' },
    { id: 'past-draft', club_team_season_id: 'active-cts', session_date: '2026-10-03', planning_state: 'draft' },
    { id: 'future', club_team_season_id: 'active-cts', session_date: '2026-10-20', planning_state: 'confirmed' },
    { id: 'other-cts', club_team_season_id: 'other-cts', session_date: '2026-10-01', planning_state: 'confirmed' },
  ],
  planned_session_player_roster: [
    { session_id: 'past-a', player_id: 'player-a' },
    { session_id: 'past-a', player_id: 'player-a' },
    { session_id: 'past-b', player_id: 'player-a' },
    { session_id: 'past-b', player_id: 'player-b' },
    { session_id: 'past-draft', player_id: 'player-a' },
    { session_id: 'future', player_id: 'player-a' },
    { session_id: 'other-cts', player_id: 'player-a' },
  ],
  planned_session_player_availability: [
    { session_id: 'past-b', player_id: 'player-a', status: 'injured' },
    { session_id: 'past-b', player_id: 'player-b', status: 'absent' },
  ],
};

const client = {
  from(table) {
    const filters = [];
    const query = {
      select(columns) {
        queryLog.push({ table, columns });
        return this;
      },
      eq(column, value) { filters.push((row) => row[column] === value); return this; },
      lt(column, value) { filters.push((row) => row[column] < value); return this; },
      is(column, value) { filters.push((row) => row[column] === value); return this; },
      in(column, values) { filters.push((row) => values.includes(row[column])); return this; },
      then(resolve, reject) {
        const result = (rows[table] || []).filter((row) => filters.every((filter) => filter(row)));
        return Promise.resolve({ data: result, error: null }).then(resolve, reject);
      },
    };
    return query;
  },
};

const summary = await loadPlayerTrainingAttendance(client, 'player-a', 'active-cts', '2026-10-19');
assert.equal(summary.total, 2, 'solo sesiones pasadas confirmadas del CTS activo con roster del jugador');
assert.equal(summary.states.find(({ key }) => key === 'available').count, 1,
  'una fila de disponibilidad ausente cuenta como disponible');
assert.equal(summary.states.find(({ key }) => key === 'injured').count, 1);
assert.ok(queryLog.some(({ table }) => table === 'planned_session_player_roster'));
assert.ok(queryLog.some(({ table }) => table === 'planned_session_player_availability'));

const empty = await loadPlayerTrainingAttendance(client, 'player-a', 'missing-cts', '2026-10-19');
assert.equal(empty.total, 0);
await assert.rejects(loadPlayerTrainingAttendance(client, 'player-a', 'active-cts', '19/10/2026'),
  /fecha de corte.*no es válida/i);

rows.planned_session_player_availability[0].status = 'absent';
const updatedSummary = await loadPlayerTrainingAttendance(client, 'player-a', 'active-cts', '2026-10-19');
assert.equal(updatedSummary.states.find(({ key }) => key === 'absent').count, 1,
  'una recarga refleja el estado de disponibilidad modificado');
assert.equal(updatedSummary.states.find(({ key }) => key === 'injured').count, 0);

console.log('player training attendance store tests passed');
