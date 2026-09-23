import assert from 'node:assert/strict';
import { getMatchSportsSeasonKey, getSportsSeason, matchBelongsToSportsSeason, resolveSportsSeasonFromMatches } from './sportsSeason.js';

assert.deepEqual(getSportsSeason('2026-08-16'), {
  key: '2026', label: '2026/2027', shortLabel: '2026/27', startDate: '2026-07-01', endDate: '2027-06-30',
});
assert.equal(getSportsSeason('2027-05-10').label, '2026/2027');
assert.equal(getSportsSeason('2027-07-01').label, '2027/2028');
assert.equal(resolveSportsSeasonFromMatches([{ date: '2026-08-16' }, { date: '2027-05-10' }]).season.label, '2026/2027');
assert.equal(resolveSportsSeasonFromMatches([{ date: '2026-08-16' }, { date: '2027-08-16' }]).valid, false, 'no se mezclan temporadas distintas');
assert.equal(resolveSportsSeasonFromMatches([]).reason, 'NO_MATCH_DATES');
assert.equal(getMatchSportsSeasonKey({ season: '2026/27' }), '2026');
assert.equal(getMatchSportsSeasonKey({ date: '2027-05-10' }), '2026', 'sin season_key se deriva la misma temporada desde la fecha real');
assert.equal(matchBelongsToSportsSeason({ date: '2026-05-30' }, '2026/2027'), false);
assert.equal(matchBelongsToSportsSeason({}, '2026/2027'), false, 'una temporada desconocida no se asigna arbitrariamente');
assert.equal(matchBelongsToSportsSeason({ date: '2026-02-30' }, '2025/2026'), false, 'una fecha imposible no se normaliza silenciosamente a otra temporada');

console.log('sportsSeason tests passed');
