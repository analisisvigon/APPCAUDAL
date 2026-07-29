import assert from 'node:assert/strict';
import {
  filterMatchesByCompetition,
  isOfficialCompetition,
  normalizeCompetitionKey,
} from './competitionFilters.js';

const catalog = [
  { key: 'league', competitionType: 'official' },
  { key: 'copa_rfef', competitionType: 'official' },
  { key: 'playoff', competitionType: 'official' },
  { key: 'future_cup', competitionType: 'official' },
  { key: 'friendly', competitionType: 'friendly' },
];

const matches = [
  { id: 'l1', competition_key: 'league', season: '2025/26', isHome: true },
  { id: 'l2', competition_key: 'league', season: '2025/26', isHome: false },
  { id: 'c1', competition_key: 'copa_rfef', season: '2025/26', isHome: true },
  { id: 'p1', competition_key: 'playoff', season: '2025/26', isHome: false },
  { id: 'f1', competition_key: 'friendly', season: '2025/26', isHome: true },
  { id: 'f2', type: 'Amistoso', season: '2025/26', isHome: false },
  { id: 'u1', competition_key: null, type: 'Torneo desconocido', season: '2025/26', isHome: true },
  { id: 'old', competition_key: 'league', season: '2024/25', isHome: true },
];

const ids = (scope, rows = matches) =>
  filterMatchesByCompetition(rows, scope, catalog, { activeSeason: '2025/26' }).map(({ id }) => id);

assert.deepEqual(ids('Temporada'), ['l1', 'l2', 'c1', 'p1']);
assert.deepEqual(ids('Todos'), ['l1', 'l2', 'c1', 'p1', 'f1', 'f2', 'u1']);
assert.deepEqual(ids('Liga'), ['l1', 'l2']);
assert.deepEqual(ids('Copa RFEF'), ['c1']);
assert.deepEqual(ids('Play Off'), ['p1']);
assert.deepEqual(ids('Amistoso'), ['f1', 'f2']);
assert.deepEqual(ids('Temporada', matches.filter((match) => match.isHome)), ['l1', 'c1']);
assert.deepEqual(ids('Temporada', matches.filter((match) => !match.isHome)), ['l2', 'p1']);
assert.equal(normalizeCompetitionKey({ competition_key: null, type: 'Prueba' }), 'other');
assert.equal(isOfficialCompetition('future_cup', catalog), true);
assert.equal(isOfficialCompetition('unknown', catalog), false);

console.log('competitionFilters: all assertions passed');
