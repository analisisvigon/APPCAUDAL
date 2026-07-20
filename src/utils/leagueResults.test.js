import assert from 'node:assert/strict';
import { calculateLeagueResults } from './leagueResults.js';

const finalLeague = (overrides = {}) => ({
  type: 'Liga',
  status: 'Finalizado',
  isHome: true,
  homeScore: '',
  awayScore: '',
  goalsFor: '',
  goalsAgainst: '',
  ...overrides,
});

const caseOne = calculateLeagueResults([
  finalLeague({ homeScore: 2, awayScore: 1 }),
  finalLeague({ homeScore: 1, awayScore: 1 }),
  finalLeague({ homeScore: 0, awayScore: 2 }),
]);
assert.equal(caseOne.wins, 1);
assert.equal(caseOne.draws, 1);
assert.equal(caseOne.losses, 1);
assert.equal(caseOne.played, 3);

const awayWin = calculateLeagueResults([
  finalLeague({ isHome: false, homeScore: 1, awayScore: 2 }),
]);
assert.equal(awayWin.wins, 1);
assert.equal(awayWin.played, 1);

const cupIgnored = calculateLeagueResults([
  finalLeague({ type: 'Copa RFEF', homeScore: 0, awayScore: 5 }),
]);
assert.equal(cupIgnored.played, 0);

const upcomingIgnored = calculateLeagueResults([
  finalLeague({ date: '2999-01-01', status: 'Previa', homeScore: 3, awayScore: 0 }),
]);
assert.equal(upcomingIgnored.played, 0);

const incompleteIgnored = calculateLeagueResults([
  finalLeague({ homeScore: 1, awayScore: '' }),
]);
assert.equal(incompleteIgnored.played, 0);
assert.equal(incompleteIgnored.draws, 0);

const noLeague = calculateLeagueResults([]);
assert.equal(noLeague.played, 0);
assert.equal(noLeague.wins, 0);
assert.equal(noLeague.draws, 0);
assert.equal(noLeague.losses, 0);

const changedResult = calculateLeagueResults([
  finalLeague({ homeScore: 3, awayScore: 2 }),
]);
assert.deepEqual(
  {
    played: changedResult.played,
    wins: changedResult.wins,
    draws: changedResult.draws,
    losses: changedResult.losses,
  },
  { played: 1, wins: 1, draws: 0, losses: 0 }
);

console.log('leagueResults tests passed');
