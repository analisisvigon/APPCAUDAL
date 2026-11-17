import assert from 'node:assert/strict';
import { summarizePlayerTrainingAttendance } from './playerTrainingAttendance.js';

const rosterRows = [
  { session_id: 'available-session' },
  { session_id: 'absent-session' },
  { session_id: 'injured-session' },
  { session_id: 'adapted-session' },
  { session_id: 'first-team-session' },
  { session_id: 'available-session' },
];
const availabilityRows = [
  { session_id: 'absent-session', status: 'absent' },
  { session_id: 'injured-session', status: 'injured' },
  { session_id: 'adapted-session', status: 'adapted' },
  { session_id: 'first-team-session', status: 'first_team' },
  { session_id: 'not-in-roster', status: 'absent' },
];
const summary = summarizePlayerTrainingAttendance(rosterRows, availabilityRows);
assert.equal(summary.total, 5, 'una sesión se cuenta una sola vez por jugador');
assert.deepEqual(summary.states.map(({ key, count, percentage }) => [key, count, percentage]), [
  ['available', 1, 20],
  ['absent', 1, 20],
  ['injured', 1, 20],
  ['adapted', 1, 20],
  ['first_team', 1, 20],
]);

const allAvailable = summarizePlayerTrainingAttendance([
  { session_id: 'one' }, { session_id: 'two' }, { session_id: 'three' },
]);
assert.equal(allAvailable.total, 3);
assert.equal(allAvailable.states[0].percentage, 100);
assert.ok(allAvailable.states.slice(1).every(({ count, percentage }) => count === 0 && percentage === 0));

const empty = summarizePlayerTrainingAttendance();
assert.equal(empty.total, 0);
assert.ok(empty.states.every(({ percentage }) => percentage === 0));

assert.throws(() => summarizePlayerTrainingAttendance(
  [{ session_id: 'one' }], [{ session_id: 'one', status: 'unknown' }],
), /Estado de disponibilidad no reconocido/);
assert.throws(() => summarizePlayerTrainingAttendance(
  [{ session_id: 'one' }],
  [{ session_id: 'one', status: 'absent' }, { session_id: 'one', status: 'injured' }],
), /más de un estado/);

console.log('player training attendance summary tests passed');
