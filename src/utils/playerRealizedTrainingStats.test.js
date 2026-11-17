import assert from 'node:assert/strict';
import { summarizePlayerRealizedTraining } from './playerRealizedTrainingStats.js';

const summary = summarizePlayerRealizedTraining([
  { session_id: 'available', status: 'available' },
  { session_id: 'adapted', status: 'adapted' },
  { session_id: 'absent', status: 'absent' },
  { session_id: 'injured', status: 'injured' },
  { session_id: 'first-team', status: 'first_team' },
  { session_id: 'available', status: 'available' },
]);

assert.equal(summary.total, 5);
assert.equal(summary.completed, 2, 'Disponible y trabajo adaptado cuentan como entrenamiento realizado');
assert.equal(summary.participationPercentage, 40);
assert.deepEqual(summary.states.map(({ key, count }) => [key, count]), [
  ['available', 1],
  ['absent', 1],
  ['injured', 1],
  ['adapted', 1],
  ['first_team', 1],
]);
assert.equal(summarizePlayerRealizedTraining().total, 0);
assert.equal(summarizePlayerRealizedTraining().participationPercentage, 0);
assert.throws(() => summarizePlayerRealizedTraining([{ session_id: 'one', status: 'unknown' }]),
  /Estado final de sesión no reconocido/);

console.log('player realized training stats tests passed');
