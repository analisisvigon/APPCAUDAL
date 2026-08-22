import assert from 'node:assert/strict';
import { getSportsSeason, resolveSportsSeasonFromMatches } from './sportsSeason.js';

assert.deepEqual(getSportsSeason('2026-08-16'), {
  key: '2026', label: '2026/2027', shortLabel: '2026/27', startDate: '2026-07-01', endDate: '2027-06-30',
});
assert.equal(getSportsSeason('2027-05-10').label, '2026/2027');
assert.equal(getSportsSeason('2027-07-01').label, '2027/2028');
assert.equal(resolveSportsSeasonFromMatches([{ date: '2026-08-16' }, { date: '2027-05-10' }]).season.label, '2026/2027');
assert.equal(resolveSportsSeasonFromMatches([{ date: '2026-08-16' }, { date: '2027-08-16' }]).valid, false, 'no se mezclan temporadas distintas');
assert.equal(resolveSportsSeasonFromMatches([]).reason, 'NO_MATCH_DATES');

console.log('sportsSeason tests passed');
