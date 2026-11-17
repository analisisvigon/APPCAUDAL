import assert from 'node:assert/strict';
import { summarizePlayerSessionAvailability } from './playerSessionAvailability.js';

const rosterRows = [
  { session_id: 'available-session' },
  { session_id: 'explicit-available-session' },
  { session_id: 'absent-session' },
  { session_id: 'injured-session' },
  { session_id: 'adapted-session' },
  { session_id: 'first-team-session' },
  { session_id: 'available-session' },
];
const availabilityRows = [
  { session_id: 'absent-session', status: 'absent' },
  { session_id: 'explicit-available-session', status: 'available' },
  { session_id: 'injured-session', status: 'injured' },
  { session_id: 'adapted-session', status: 'adapted' },
  { session_id: 'first-team-session', status: 'first_team' },
  { session_id: 'not-in-roster', status: 'absent' },
];
const summary = summarizePlayerSessionAvailability(rosterRows, availabilityRows);
assert.equal(summary.total, 6, 'una sesión se cuenta una sola vez por jugador');
assert.equal(summary.explicitAvailableCount, 1);
assert.equal(summary.defaultAvailableCount, 1,
  'una fila de disponibilidad ausente se identifica como disponible por defecto');
assert.deepEqual(summary.states.map(({ key, count }) => [key, count]), [
  ['available', 2],
  ['absent', 1],
  ['injured', 1],
  ['adapted', 1],
  ['first_team', 1],
]);
assert.ok(Math.abs(summary.states[0].percentage - 100 / 3) < 1e-10);
assert.ok(summary.states.slice(1).every(({ percentage }) => Math.abs(percentage - 100 / 6) < 1e-10));

const allAvailable = summarizePlayerSessionAvailability([
  { session_id: 'one' }, { session_id: 'two' }, { session_id: 'three' },
]);
assert.equal(allAvailable.total, 3);
assert.equal(allAvailable.states[0].percentage, 100);
assert.equal(allAvailable.defaultAvailableCount, 3);
assert.equal(allAvailable.explicitAvailableCount, 0);
assert.ok(allAvailable.states.slice(1).every(({ count, percentage }) => count === 0 && percentage === 0));

const empty = summarizePlayerSessionAvailability();
assert.equal(empty.total, 0);
assert.ok(empty.states.every(({ percentage }) => percentage === 0));

assert.throws(() => summarizePlayerSessionAvailability(
  [{ session_id: 'one' }], [{ session_id: 'one', status: 'unknown' }],
), /Estado de disponibilidad no reconocido/);
assert.throws(() => summarizePlayerSessionAvailability(
  [{ session_id: 'one' }],
  [{ session_id: 'one', status: 'absent' }, { session_id: 'one', status: 'injured' }],
), /más de un estado/);

console.log('player session availability summary tests passed');
