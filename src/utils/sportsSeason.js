const SPORTS_SEASON_START_MONTH = 7;

const parseDate = (value) => {
  if (value instanceof Date) return new Date(value);
  const raw = String(value || '').slice(0, 10);
  if (!raw) return null;
  const date = new Date(`${raw}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const getSportsSeason = (value = new Date()) => {
  const date = parseDate(value);
  if (!date) return null;
  const startYear = date.getMonth() + 1 >= SPORTS_SEASON_START_MONTH
    ? date.getFullYear()
    : date.getFullYear() - 1;
  return {
    key: String(startYear),
    label: `${startYear}/${startYear + 1}`,
    shortLabel: `${startYear}/${String(startYear + 1).slice(-2)}`,
    startDate: `${startYear}-07-01`,
    endDate: `${startYear + 1}-06-30`,
  };
};

export const resolveSportsSeasonFromMatches = (matches = []) => {
  const seasons = [...new Map(
    (Array.isArray(matches) ? matches : [])
      .map((match) => getSportsSeason(match?.date))
      .filter(Boolean)
      .map((season) => [season.key, season])
  ).values()];
  return {
    season: seasons.length === 1 ? seasons[0] : null,
    seasons,
    valid: seasons.length === 1,
    reason: seasons.length === 0 ? 'NO_MATCH_DATES' : seasons.length > 1 ? 'MULTIPLE_SEASONS' : '',
  };
};
