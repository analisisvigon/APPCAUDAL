import assert from 'node:assert/strict';
import { calendarWeekDays } from './teamCalendar.js';
import { plannedMdReferences } from './microcycleMatchDays.js';

const season = { starts_on: '2026-07-01', ends_on: '2027-06-30' };
const week = calendarWeekDays('2026-10-28');
const nextWeek = calendarWeekDays('2026-11-02');
const match = (id, date, extra = {}) => ({ id, date, club_team_season_id: 'cts', opponent: id, ...extra });
const labels = (map, day) => map.get(day).map((row) => row.label);

let refs = plannedMdReferences(week, [match('saturday', '2026-10-31')], 'cts', season);
assert.deepEqual(labels(refs, '2026-10-30'), ['MD-1']);
assert.deepEqual(labels(refs, '2026-10-31'), ['MD']);
assert.deepEqual(labels(refs, '2026-11-01'), ['MD+1']);
refs = plannedMdReferences(nextWeek, [match('sunday', '2026-11-01')], 'cts', season);
assert.deepEqual(labels(refs, '2026-11-02'), ['MD+1'], 'el lunes mantiene su propio MC');
refs = plannedMdReferences(week, [match('next-monday', '2026-11-02')], 'cts', season);
assert.deepEqual(labels(refs, '2026-11-01'), ['MD-1']);
refs = plannedMdReferences(week, [match('sunday', '2026-11-01')], 'cts', season);
assert.deepEqual(labels(refs, '2026-10-26'), ['MD-6']);
assert.deepEqual(labels(refs, '2026-10-27'), ['MD-5']);
refs = plannedMdReferences(week, [match('wednesday', '2026-10-28'), match('sunday', '2026-11-01')], 'cts', season);
assert.deepEqual(labels(refs, '2026-10-29'), ['MD+1', 'MD-3']);
assert.deepEqual(refs.get('2026-10-29').map((row) => row.matchId), ['wednesday', 'sunday']);
assert.deepEqual(labels(refs, '2026-10-28'), ['MD', 'MD-4']);
refs = plannedMdReferences(nextWeek, [match('previous', '2026-11-01'), match('next', '2026-11-08')], 'cts', season);
assert.deepEqual(labels(refs, '2026-11-02'), ['MD+1', 'MD-6']);
assert.deepEqual(labels(plannedMdReferences(week, [], 'cts', season), '2026-10-29'), []);
assert.deepEqual(labels(plannedMdReferences(week, [match('cancelled', '2026-10-29', { status: 'Cancelado' }),
  match('postponed', '2026-10-30', { status: 'Aplazado' }),
  match('suspended', '2026-10-31', { status: 'Suspendido' })], 'cts', season), '2026-10-29'), []);
assert.deepEqual(labels(plannedMdReferences(week, [match('other', '2026-10-29', { club_team_season_id: 'other' })],
  'cts', season), '2026-10-29'), []);
assert.deepEqual(labels(plannedMdReferences(week, [match('outside', '2027-07-01')], 'cts', season), '2026-10-29'), []);
refs = plannedMdReferences(week, [match('move', '2026-10-29')], 'cts', season);
assert.deepEqual(labels(refs, '2026-10-28'), ['MD-1']);
refs = plannedMdReferences(week, [match('move', '2026-10-30')], 'cts', season);
assert.deepEqual(labels(refs, '2026-10-28'), ['MD-2']);
const yearWeek = calendarWeekDays('2027-01-01');
assert.deepEqual(labels(plannedMdReferences(yearWeek, [match('new-year', '2027-01-01')], 'cts', season),
  '2026-12-31'), ['MD-1']);
assert.deepEqual(labels(plannedMdReferences(week, [match('sunday', '2026-11-01')], 'cts',
  { starts_on: '2026-11-01', ends_on: '2027-06-30' }), '2026-10-31'), []);
console.log('microcycle match days: OK');
