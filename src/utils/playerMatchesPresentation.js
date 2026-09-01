import { OWN_CLUB_IDENTITY } from '../constants/clubIdentity.js';

const clean = (value) => String(value ?? '').trim();

export const formatPlayerMatchDate = (value) => {
  const match = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : 'Fecha por confirmar';
};

export const getPlayerMatchScorePresentation = (match = {}) => {
  const complete = match.homeScore !== null
    && match.homeScore !== undefined
    && match.awayScore !== null
    && match.awayScore !== undefined;
  return complete
    ? { isPending: false, score: `${match.homeScore} – ${match.awayScore}`, status: 'Finalizado' }
    : { isPending: true, score: 'Pendiente', status: 'Pendiente' };
};

const fallbackOpponent = (match) => clean(match.opponent) || 'Rival';

export const getPlayerMatchTeams = (match = {}) => {
  if (match.isHome === true) {
    return {
      context: 'Local',
      home: {
        name: clean(match.homeTeam) || OWN_CLUB_IDENTITY.shortName,
        crest: OWN_CLUB_IDENTITY.crest,
      },
      away: {
        name: clean(match.awayTeam) || fallbackOpponent(match),
        crest: match.opponentCrest || null,
      },
    };
  }
  if (match.isHome === false) {
    return {
      context: 'Visitante',
      home: {
        name: clean(match.homeTeam) || fallbackOpponent(match),
        crest: match.opponentCrest || null,
      },
      away: {
        name: clean(match.awayTeam) || OWN_CLUB_IDENTITY.shortName,
        crest: OWN_CLUB_IDENTITY.crest,
      },
    };
  }
  return {
    context: '',
    home: { name: clean(match.homeTeam) || 'Equipo local', crest: null },
    away: { name: clean(match.awayTeam) || 'Equipo visitante', crest: null },
  };
};

export const getPlayerMatchCompetitionLabel = (match = {}) => {
  const name = clean(match.competitionName);
  if (name) return name;
  const key = clean(match.competitionKey);
  if (!key) return '';
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
};
