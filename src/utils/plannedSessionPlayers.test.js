import assert from 'node:assert/strict';
import { availabilityChanges, eligibleRosterCandidates, groupSessionPlayers,
  hasUncertainRosterDate, sessionPlayerCounts } from './plannedSessionPlayers.js';

const candidates = [
  { id: 'm1', player_id: 'p1', name: 'Alex', position_key: 'goalkeeper', joined_on: null, left_on: null, has_departed: false },
  { id: 'm2', player_id: 'p2', name: 'Borja', position_key: 'defender', joined_on: '2026-11-01', left_on: null, has_departed: false },
  { id: 'm3', player_id: 'p3', name: 'Luis', position_key: null, joined_on: '2026-07-01', left_on: '2026-10-25', has_departed: true },
];
assert.deepEqual(eligibleRosterCandidates(candidates, '2026-10-25').map((row) => row.id), ['m1']);
assert.deepEqual(eligibleRosterCandidates(candidates, '2026-11-01').map((row) => row.id), ['m1', 'm2']);
assert.equal(hasUncertainRosterDate(candidates[0]), true);
assert.equal(hasUncertainRosterDate(candidates[1]), false);
assert.equal(groupSessionPlayers(candidates, false)[0].label, 'Porteros');
assert.equal(groupSessionPlayers(candidates, false).at(-1).label, 'Sin posición');

const roster = Array.from({ length: 24 }, (_, i) => ({ player_id: `p${i}` }));
const states = { p0: { status: 'absent', observation: '' }, p1: { status: 'injured', observation: 'Lesión' },
  p2: { status: 'adapted', observation: '' } };
assert.deepEqual(sessionPlayerCounts(roster, states), {
  total: 24, available: 21, absent: 1, injured: 1, adapted: 1, participants: 22,
});
assert.deepEqual(availabilityChanges(states, {}, roster), [
  { player_id: 'p0', status: 'absent', observation: null },
  { player_id: 'p1', status: 'injured', observation: 'Lesión' },
  { player_id: 'p2', status: 'adapted', observation: null },
]);
assert.deepEqual(availabilityChanges(states, states, roster), []);
console.log('planned session players tests passed');
