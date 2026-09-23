const SPORTS_SEASON_START_MONTH = 7;

const parseDate = (value) => {
  if (value instanceof Date) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const raw = String(value || '').slice(0, 10);
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
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

export const normalizeSportsSeasonKey = (value) => {
  if (value && typeof value === 'object') {
    return normalizeSportsSeasonKey(value.key || value.label || value.season || value.seasonKey || value.season_key);
  }
  const match = String(value || '').trim().match(/^(\d{4})(?:\s*\/\s*(?:\d{2}|\d{4}))?$/);
  return match ? match[1] : '';
};

export const getMatchSportsSeasonKey = (match = {}) => {
  const persisted = normalizeSportsSeasonKey(
    match.season ?? match.seasonKey ?? match.season_key ?? match.temporada,
  );
  if (persisted) return persisted;
  const matchDate = match.date ?? match.matchDate ?? match.match_date;
  if (!String(matchDate || '').trim()) return '';
  return getSportsSeason(matchDate)?.key || '';
};

export const matchBelongsToSportsSeason = (match = {}, season = '') => {
  const expected = normalizeSportsSeasonKey(season);
  const actual = getMatchSportsSeasonKey(match);
  return Boolean(expected && actual && expected === actual);
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
