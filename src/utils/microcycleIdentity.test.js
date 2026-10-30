import assert from 'node:assert/strict';
import { clampMicrocycleDate, microcycleRangeLabel, seasonMicrocycleForDate, seasonMicrocycles } from './microcycleIdentity.js';

const season = { starts_on: '2026-07-01', ends_on: '2027-06-30' };
const weeks = seasonMicrocycles(season);
assert.equal(weeks.length, 53);
assert.equal(weeks[0].monday, '2026-06-29');
assert.equal(weeks[0].label, 'MC 01');
assert.equal(seasonMicrocycleForDate(season, '2026-07-01')?.label, 'MC 01');
assert.equal(seasonMicrocycleForDate(season, '2026-10-25')?.label, 'MC 17');
assert.equal(seasonMicrocycleForDate(season, '2026-10-26')?.label, 'MC 18');
assert.equal(seasonMicrocycleForDate({ starts_on: '2026-09-01', ends_on: '2027-06-30' },
  '2026-10-26')?.label, 'MC 09');
assert.equal(seasonMicrocycleForDate(season, '2027-01-01')?.monday, '2026-12-28');
assert.equal(seasonMicrocycleForDate(season, '2027-01-01')?.label,
  seasonMicrocycleForDate({ ...season, id: 'another-cts', sessions: [] }, '2027-01-01')?.label);
assert.equal(weeks.at(-1).sunday, '2027-07-04');
assert.equal(seasonMicrocycleForDate(season, '2026-06-30'), null);
assert.equal(seasonMicrocycleForDate(season, '2027-07-01'), null);
assert.equal(seasonMicrocycleForDate({ ...season, starts_on: 'invalid' }, '2026-10-01'), null);
assert.deepEqual(seasonMicrocycles({ starts_on: '2026-12-31', ends_on: '2027-01-02' })
  .map((week) => week.label), ['MC 01']);
assert.match(microcycleRangeLabel(weeks[0], true), /2026/);
assert.equal(clampMicrocycleDate(season, '2026-06-20'), '2026-07-01');
assert.equal(clampMicrocycleDate(season, '2026-10-30'), '2026-10-30');
assert.equal(clampMicrocycleDate(season, '2027-07-10'), '2027-06-30');
assert.equal(seasonMicrocycleForDate(season, clampMicrocycleDate(season, '2027-07-10'))?.label, 'MC 53');
console.log('microcycle identity: OK');
