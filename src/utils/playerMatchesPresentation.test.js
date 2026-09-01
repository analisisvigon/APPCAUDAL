import assert from 'node:assert/strict';
import { OWN_CLUB_IDENTITY } from '../constants/clubIdentity.js';
import {
  formatPlayerMatchDate,
  getPlayerMatchCompetitionLabel,
  getPlayerMatchScorePresentation,
  getPlayerMatchTeams,
} from './playerMatchesPresentation.js';

assert.equal(formatPlayerMatchDate('2026-09-01'), '01/09/2026');
assert.equal(formatPlayerMatchDate(''), 'Fecha por confirmar');

assert.deepEqual(
  getPlayerMatchScorePresentation({ homeScore: '2', awayScore: '0' }),
  { isPending: false, score: '2 – 0', status: 'Finalizado' },
);
assert.deepEqual(
  getPlayerMatchScorePresentation({ homeScore: '2', awayScore: null }),
  { isPending: true, score: 'Pendiente', status: 'Pendiente' },
  'Un solo marcador nulo basta para no inventar resultado.',
);
assert.equal(getPlayerMatchScorePresentation({ homeScore: null, awayScore: null }).score, 'Pendiente');

const home = getPlayerMatchTeams({
  isHome: true,
  homeTeam: 'C.D. Caudal',
  awayTeam: 'Rival A',
  opponent: 'Rival A',
  opponentCrest: 'https://images.example/a.png',
});
assert.equal(home.context, 'Local');
assert.equal(home.home.crest, OWN_CLUB_IDENTITY.crest);
assert.equal(home.away.crest, 'https://images.example/a.png');

const away = getPlayerMatchTeams({
  isHome: false,
  homeTeam: 'Rival B',
  awayTeam: 'C.D. Caudal',
  opponent: 'Rival B',
  opponentCrest: 'https://images.example/b.png',
});
assert.equal(away.context, 'Visitante');
assert.equal(away.home.crest, 'https://images.example/b.png');
assert.equal(away.away.crest, OWN_CLUB_IDENTITY.crest);

const unknownVenue = getPlayerMatchTeams({
  isHome: null,
  homeTeam: 'Equipo A',
  awayTeam: 'Equipo B',
  opponentCrest: 'https://images.example/not-used.png',
});
assert.equal(unknownVenue.context, '');
assert.equal(unknownVenue.home.crest, null, 'No se infiere localía comparando nombres.');
assert.equal(unknownVenue.away.crest, null, 'No se infiere localía comparando nombres.');

assert.equal(getPlayerMatchCompetitionLabel({ competitionName: 'Copa RFEF', competitionKey: 'copa_rfef' }), 'Copa RFEF');
assert.equal(getPlayerMatchCompetitionLabel({ competitionName: '', competitionKey: 'copa_rfef' }), 'Copa Rfef');
assert.equal(getPlayerMatchCompetitionLabel({}), '');

console.log('playerMatchesPresentation: finalizado, pendiente, L/V, escudos y competición validados.');
