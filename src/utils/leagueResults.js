export const LEAGUE_COMPETITION_TYPE = 'Liga';

export const LEAGUE_RESULT_COLORS = {
  wins: '#34d399',
  draws: '#facc15',
  losses: '#f87171',
  empty: '#475569',
};

const isFiniteScore = (value) => {
  if (value === '' || value === null || value === undefined) return false;
  return Number.isFinite(Number(value));
};

const normalizeText = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export const normalizeLeagueCompetitionKey = (match = {}) => {
  const candidates = [
    match.competitionKey,
    match.competition_id,
    match.competitionId,
    match.competition,
    match.type,
  ];
  for (const source of candidates) {
    if (source === '' || source === null || source === undefined) continue;
    const text = normalizeText(source);
    if (text === 'liga' || text === 'league' || /\bliga\b/.test(text)) return 'league';
  }
  return 'other';
};

export const isLeagueMatch = (match = {}) => normalizeLeagueCompetitionKey(match) === 'league';

export const isPlayedMatch = (match = {}) => {
  const status = normalizeText(match.status);
  return status === 'finalizado' || status === 'jugado';
};

export const getCompleteMatchScore = (match = {}) => {
  if (isFiniteScore(match.homeScore) && isFiniteScore(match.awayScore)) {
    const home = Number(match.homeScore);
    const away = Number(match.awayScore);
    return {
      home,
      away,
      caudal: match.isHome ? home : away,
      rival: match.isHome ? away : home,
      source: 'home_away_score',
    };
  }

  if (isFiniteScore(match.goalsFor) && isFiniteScore(match.goalsAgainst)) {
    const caudal = Number(match.goalsFor);
    const rival = Number(match.goalsAgainst);
    return {
      home: match.isHome ? caudal : rival,
      away: match.isHome ? rival : caudal,
      caudal,
      rival,
      source: 'goals_for_against',
    };
  }

  return null;
};

export const classifyLeagueMatchResult = (match = {}) => {
  if (!isLeagueMatch(match) || !isPlayedMatch(match)) return null;
  const score = getCompleteMatchScore(match);
  if (!score) return null;
  if (score.caudal > score.rival) return 'win';
  if (score.caudal < score.rival) return 'loss';
  return 'draw';
};

export const calculateLeagueResults = (matches = []) => {
  const initial = {
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    includedMatches: [],
    excludedMatches: [],
  };

  return matches.reduce((acc, match) => {
    if (!isLeagueMatch(match)) return acc;
    const result = classifyLeagueMatchResult(match);
    if (!result) {
      acc.excludedMatches.push(match);
      return acc;
    }

    acc.played += 1;
    if (result === 'win') acc.wins += 1;
    if (result === 'draw') acc.draws += 1;
    if (result === 'loss') acc.losses += 1;
    acc.includedMatches.push({ match, result, score: getCompleteMatchScore(match) });
    return acc;
  }, initial);
};

export const buildLeagueResultsDonut = (results = {}) => {
  const played = Number(results.played || 0);
  if (!played) return `conic-gradient(${LEAGUE_RESULT_COLORS.empty} 0 100%)`;

  const winsEnd = (Number(results.wins || 0) / played) * 100;
  const drawsEnd = ((Number(results.wins || 0) + Number(results.draws || 0)) / played) * 100;
  return `conic-gradient(${LEAGUE_RESULT_COLORS.wins} 0 ${winsEnd}%, ${LEAGUE_RESULT_COLORS.draws} ${winsEnd}% ${drawsEnd}%, ${LEAGUE_RESULT_COLORS.losses} ${drawsEnd}% 100%)`;
};
