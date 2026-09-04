import assert from 'node:assert/strict';
import { getDailyQuestionnaireRequirement, getMissingDailyPlayers } from './performanceDaily.js';

const players = [
  { id: 'p1', name: 'Ana' },
  { id: 'p2', name: 'Berta', shirt_name: 'B' },
  { id: 'p3', name: 'Celia' },
];

assert.equal(getDailyQuestionnaireRequirement({ type: 'wellness', entries: [] }), 'unknown');
assert.equal(getDailyQuestionnaireRequirement({ type: 'wellness', entries: [{ jugador_id: 'p1' }] }), 'required');
assert.equal(getDailyQuestionnaireRequirement({ type: 'rpe', entries: [] }), 'unknown');
assert.equal(getDailyQuestionnaireRequirement({ type: 'rpe', entries: [{ jugador_id: 'p1' }] }), 'required');
assert.deepEqual(
  getMissingDailyPlayers(players, [{ jugador_id: 'p1' }, { jugador_id: 'p2' }], 'required').map((player) => player.id),
  ['p3'],
  'La ausencia se calcula por jugador_id y no por nombre.',
);
assert.deepEqual(getMissingDailyPlayers(players, [{ jugador_id: 'p1' }], 'unknown'), []);
assert.deepEqual(getMissingDailyPlayers(players, [{ jugador_id: 'p1' }, { jugador_id: 'p2' }, { jugador_id: 'p3' }], 'required'), []);

console.log('Performance daily: requisitos y pendientes por ID validados.');