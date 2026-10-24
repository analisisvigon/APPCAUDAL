const sum = (items, key) => items.reduce((total, item) => total + item[key], 0);

export function buildSeasonMemoryPresentation(data) {
  const competitions = data.competitions.map((item) => ({
    ...item,
    goalDifference: item.goalsFor - item.goalsAgainst,
    winRate: item.played ? item.wins / item.played : 0,
  }));
  for (const item of competitions) {
    if (item.played !== item.wins + item.draws + item.losses) {
      throw new Error(`Resultados inconsistentes: ${item.name}`);
    }
  }
  if (data.match.events.filter((event) => event.side === 'home').length !== data.match.homeGoals
    || data.match.events.filter((event) => event.side === 'away').length !== data.match.awayGoals
    || data.match.lineup.length !== 11) {
    throw new Error('Ficha de partido inconsistente');
  }
  const totals = Object.fromEntries(
    ['played', 'wins', 'draws', 'losses', 'goalsFor', 'goalsAgainst']
      .map((key) => [key, sum(competitions, key)]),
  );
  totals.goalDifference = totals.goalsFor - totals.goalsAgainst;
  return { ...data, competitions, totals };
}
