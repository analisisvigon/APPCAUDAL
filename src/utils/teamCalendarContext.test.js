import assert from 'node:assert/strict';
import { chooseCalendarContext, scopeCalendarMatches } from './teamCalendarContext.js';

const rows = [
  { id: 'closed', is_active: false }, { id: 'current', is_active: true },
];
assert.equal(chooseCalendarContext(rows, ''), 'current');
assert.equal(chooseCalendarContext(rows, 'closed'), 'closed');
assert.equal(chooseCalendarContext(rows, 'unrelated'), '',
  'un contexto global revocado o inexistente nunca se sustituye silenciosamente');
assert.equal(chooseCalendarContext([{ id: 'only', is_active: false }], ''), 'only');
assert.equal(chooseCalendarContext([{ id: 'one', is_active: true }, { id: 'two', is_active: true }], ''), '');
assert.equal(chooseCalendarContext([], ''), '');
const matches = [
  { id: 'a', clubTeamSeasonId: 'current' },
  { id: 'b', club_team_season_id: 'closed' },
  { id: 'c' },
];
assert.deepEqual(scopeCalendarMatches(matches, 'current').map((row) => row.id), ['a']);
assert.deepEqual(scopeCalendarMatches(matches, 'closed').map((row) => row.id), ['b']);
assert.deepEqual(scopeCalendarMatches(matches, '').map((row) => row.id), []);
console.log('team calendar context: OK (selección y aislamiento CTS)');
