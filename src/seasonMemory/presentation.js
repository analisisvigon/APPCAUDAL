const sum = (items, key) => items.reduce((total, item) => total + item[key], 0);

const KNOWN_COMPETITIONS = new Set(['league', 'cup', 'friendly']);

export const getCompetitionPresentation = (competition = {}) => {
  const key = KNOWN_COMPETITIONS.has(competition.key) ? competition.key : 'unknown';
  return {
    ...competition,
    key,
    name: key === 'unknown' ? 'Competición sin identificar' : competition.name,
  };
};

export function buildSeasonMemoryPresentation(data) {
  const competitions = data.competitions.map((source) => {
    const item = getCompetitionPresentation(source);
    return {
    ...item,
    goalDifference: item.goalsFor - item.goalsAgainst,
    winRate: item.played ? item.wins / item.played : 0,
    };
  });
  for (const item of competitions) {
    if (item.played !== item.wins + item.draws + item.losses) {
      throw new Error(`Resultados inconsistentes: ${item.name}`);
    }
  }
  const hasValidPitch = data.match.lineup.every((player) =>
    Number.isFinite(player.x) && player.x >= 0 && player.x <= 100
    && Number.isFinite(player.y) && player.y >= 0 && player.y <= 100);
  if (data.match.events.filter((event) => event.side === 'home').length !== data.match.homeGoals
    || data.match.events.filter((event) => event.side === 'away').length !== data.match.awayGoals
    || data.match.lineup.length !== 11 || !hasValidPitch) {
    throw new Error('Ficha de partido inconsistente');
  }
  const totals = Object.fromEntries(
    ['played', 'wins', 'draws', 'losses', 'goalsFor', 'goalsAgainst']
      .map((key) => [key, sum(competitions, key)]),
  );
  totals.goalDifference = totals.goalsFor - totals.goalsAgainst;
  return {
    ...data,
    competitions,
    totals,
    match: {
      ...data.match,
      competitionPresentation: getCompetitionPresentation({
        key: data.match.competitionKey || 'unknown',
        name: data.match.competition,
      }),
    },
  };
}
