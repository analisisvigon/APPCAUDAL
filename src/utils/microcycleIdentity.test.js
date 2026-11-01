import assert from 'node:assert/strict';
import { assignedMicrocycles, clampMicrocycleDate, microcycleRangeLabel, seasonWeekForDate } from './microcycleIdentity.js';

const season = { starts_on: '2026-07-01', ends_on: '2027-06-30' };
assert.equal(seasonWeekForDate(season, '2026-10-26')?.monday, '2026-10-26');
assert.equal(seasonWeekForDate(season, '2026-07-01')?.monday, '2026-06-29');
assert.equal(seasonWeekForDate(season, '2026-06-30'), null);
assert.equal(seasonWeekForDate(season, '2027-07-01'), null);
assert.equal(seasonWeekForDate({ ...season, starts_on: 'invalid' }, '2026-10-01'), null);
assert.deepEqual(assignedMicrocycles([], 'cts', season), [],
  'no se crean MC desde el inicio administrativo de temporada');
const rows = [
  { id: 'a', club_team_season_id: 'cts', session_date: '2026-10-27', mc_number: 1 },
  { id: 'b', club_team_season_id: 'cts', session_date: '2026-10-29', mc_number: 1 },
  { id: 'c', club_team_season_id: 'cts', session_date: '2026-11-02', mc_number: 2 },
  { id: 'd', club_team_season_id: 'other', session_date: '2026-11-09', mc_number: 3 },
  { id: 'e', club_team_season_id: 'cts', session_date: '2026-11-10', mc_number: null },
];
const assigned = assignedMicrocycles(rows, 'cts', season);
assert.deepEqual(assigned.map((week) => [week.number, week.monday]), [[1, '2026-10-26'], [2, '2026-11-02']]);
assert.match(microcycleRangeLabel(assigned[0], true), /2026/);
assert.throws(() => assignedMicrocycles([...rows,
  { id: 'f', club_team_season_id: 'cts', session_date: '2026-10-28', mc_number: 9 }], 'cts', season),
  /contradictorios/);
assert.throws(() => assignedMicrocycles([...rows,
  { id: 'f', club_team_season_id: 'cts', session_date: '2026-11-09', mc_number: 1 }], 'cts', season),
  /semanas distintas/);
assert.equal(clampMicrocycleDate(season, '2026-06-20'), '2026-07-01');
assert.equal(clampMicrocycleDate(season, '2026-10-30'), '2026-10-30');
assert.equal(clampMicrocycleDate(season, '2027-07-10'), '2027-06-30');
console.log('microcycle identity V4: OK');
