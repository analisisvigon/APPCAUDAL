import assert from 'node:assert/strict';
import { buildTeamCalendarEvents, calendarDateKey, calendarMatchKind, calendarMonthDays, calendarTime } from './teamCalendar.js';

assert.equal(calendarDateKey('2026-02-28'), '2026-02-28');
assert.equal(calendarDateKey('2026-02-29'), '');
assert.equal(calendarTime('19:30:00'), '19:30');
assert.equal(calendarTime('25:00'), '');

const sessions = [
  { id: 's1', club_team_season_id: 'cts-old', session_date: '2025-12-31', starts_at: null,
    planning_state: 'confirmed', session_number: 12 },
  { id: 's1', club_team_season_id: 'cts-old', session_date: '2025-12-31',
    planning_state: 'confirmed', session_number: 12 },
  { id: 's2', club_team_season_id: 'cts-new', session_date: '2026-01-02', starts_at: '10:15:00',
    planning_state: 'draft', session_number: null },
];
const matches = [
  { id: 'm1', date: '2026-01-01', time: '', opponent: 'Rival A', competitionKey: 'league',
    equipoRivalId: 'r1', isHome: true },
  { id: 'm2', date: '2026-01-02', time: '18:30', opponent: 'Rival B', type: 'Copa RFEF' },
  { id: 'm3', date: '2026-01-02', time: '20:00', opponent: 'Rival C', type: 'Amistoso' },
  { id: 'm4', date: '2026-01-03', time: '', opponent: 'Rival D', type: 'Play Off' },
];
const events = buildTeamCalendarEvents(sessions, matches, [{ id: 'r1', crest: '/rival-a.png' }]);
assert.equal(events.length, 6);
assert.deepEqual(events.map((row) => row.id), ['s1', 'm1', 's2', 'm2', 'm3', 'm4']);
assert.equal(events[0].title, 'Sesión nº 12');
assert.equal(events[0].time, '');
assert.equal(events[0].contextId, 'cts-old');
assert.equal(events[1].crest, '/rival-a.png');
assert.equal(events[1].time, '');
assert.equal(events[2].title, 'Borrador de sesión');
assert.equal(events[2].time, '10:15');
assert.deepEqual(['league', 'cup', 'friendly', 'other'], matches.map(calendarMatchKind));
assert.equal(events[1].match, matches[0]);
assert.equal(calendarMonthDays(2026, 0)[0], null); // January 1 was Thursday.
assert.equal(calendarMonthDays(2026, 0)[3], '2026-01-01');
assert.equal(calendarMonthDays(2026, 0).at(-1), '2026-01-31');
console.log('teamCalendar: OK');
