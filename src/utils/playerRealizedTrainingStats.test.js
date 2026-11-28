import assert from 'node:assert/strict';
import {
  summarizePlayerRealizedTraining,
  summarizeSessionRealizedPlayers,
} from './playerRealizedTrainingStats.js';

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

const realizedSession = summarizeSessionRealizedPlayers([
  { session_id: 'session-a', player_id: 'player-a', status: 'available' },
  { session_id: 'session-a', player_id: 'player-b', status: 'adapted' },
  { session_id: 'session-a', player_id: 'player-c', status: 'absent' },
  { session_id: 'session-a', player_id: 'player-a', status: 'available' },
]);
assert.equal(realizedSession.total, 3, 'la ficha cuenta jugadores, no interpreta la sesión común como un duplicado');
assert.equal(realizedSession.completed, 2, 'Disponible y adaptado cuentan como participación');
assert.deepEqual(realizedSession.states.map(({ key, count }) => [key, count]), [
  ['available', 1],
  ['absent', 1],
  ['injured', 0],
  ['adapted', 1],
  ['first_team', 0],
]);
assert.throws(() => summarizeSessionRealizedPlayers([
  { player_id: 'player-a', status: 'available' },
  { player_id: 'player-a', status: 'absent' },
]), /más de un estado final para un jugador/);

console.log('player realized training stats tests passed');
