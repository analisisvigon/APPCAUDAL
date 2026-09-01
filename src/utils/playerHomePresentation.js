const cleanText = (value) => String(value ?? '').trim();

const isDateKey = (value) => /^\d{4}-\d{2}-\d{2}$/.test(cleanText(value));

const hasCompleteScore = (match) => (
  match?.homeScore !== null
  && match?.homeScore !== undefined
  && match?.awayScore !== null
  && match?.awayScore !== undefined
);

export const getPlayerHomeFirstName = (profile = {}) => {
  const source = cleanText(profile.name) || cleanText(profile.shirt_name) || 'Jugador';
  return source.split(/\s+/)[0] || 'Jugador';
};

export const formatPlayerHomeDate = (value) => {
  const match = cleanText(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return 'Fecha por confirmar';
  const month = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'][Number(match[2]) - 1];
  return `${match[3]} ${month}`;
};

export const selectPlayerHomeMatches = (matches = [], today = '') => {
  if (!isDateKey(today)) return { latest: null, next: null };
  const datedMatches = (Array.isArray(matches) ? matches : [])
    .filter((match) => isDateKey(match?.matchDate));
  const previous = datedMatches
    .filter((match) => match.matchDate < today || (match.matchDate === today && hasCompleteScore(match)))
    .sort((left, right) => right.matchDate.localeCompare(left.matchDate));
  const upcoming = datedMatches
    .filter((match) => match.matchDate > today || (match.matchDate === today && !hasCompleteScore(match)))
    .sort((left, right) => left.matchDate.localeCompare(right.matchDate));
  return { latest: previous[0] || null, next: upcoming[0] || null };
};

export const buildPlayerHomePerformance = (performance = {}, today = '') => {
  const wellness = Array.isArray(performance.wellness) ? performance.wellness : [];
  const rpe = Array.isArray(performance.rpe) ? performance.rpe : [];
  const latestWellness = wellness[0] || null;
  const latestRpe = rpe[0] || null;
  return {
    latestWellness,
    latestRpe,
    wellnessAnsweredToday: Boolean(today && latestWellness?.entry_date === today),
    rpeAnsweredToday: Boolean(today && latestRpe?.entry_date === today),
  };
};
