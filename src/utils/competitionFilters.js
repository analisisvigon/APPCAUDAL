const normalizeText = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const LEGACY_COMPETITION_KEYS = new Map([
  ['liga', 'league'],
  ['league', 'league'],
  ['regular', 'league'],
  ['campeonato', 'league'],
  ['copa', 'copa_rfef'],
  ['copa rfef', 'copa_rfef'],
  ['play off', 'playoff'],
  ['play-off', 'playoff'],
  ['playoff', 'playoff'],
  ['promocion', 'playoff'],
  ['amistoso', 'friendly'],
  ['amistosos', 'friendly'],
  ['friendly', 'friendly'],
]);

export const DEFAULT_COMPETITION_TYPES = Object.freeze({
  league: 'official',
  copa_rfef: 'official',
  playoff: 'official',
  friendly: 'friendly',
});

const normalizeExplicitKey = (value) => normalizeText(value).replace(/[\s-]+/g, '_');

const normalizeLegacyCompetitionValue = (value) => {
  const text = normalizeText(value);
  if (!text) return '';
  if (LEGACY_COMPETITION_KEYS.has(text)) return LEGACY_COMPETITION_KEYS.get(text);
  if (/\bliga\b/.test(text)) return 'league';
  if (text.includes('rfef')) return 'copa_rfef';
  return '';
};

/**
 * Prefers the persisted stable key. Legacy `type` values are only accepted when
 * they can be mapped unambiguously; unknown legacy data remains unclassified.
 */
export const normalizeCompetitionKey = (matchOrValue = {}) => {
  if (matchOrValue && typeof matchOrValue === 'object') {
    const explicitKey =
      matchOrValue.competition_key ??
      matchOrValue.competitionKey ??
      matchOrValue.key;
    if (explicitKey !== '' && explicitKey !== null && explicitKey !== undefined) {
      return normalizeExplicitKey(explicitKey) || 'other';
    }

    const legacyCandidates = [
      matchOrValue.competition,
      matchOrValue.type,
    ];
    for (const candidate of legacyCandidates) {
      const key = normalizeLegacyCompetitionValue(candidate);
      if (key) return key;
    }
    return 'other';
  }

  return normalizeLegacyCompetitionValue(matchOrValue) || normalizeExplicitKey(matchOrValue) || 'other';
};

export const getCompetitionFilterKey = (filter) => {
  const normalized = normalizeText(filter);
  if (!normalized || normalized === 'temporada' || normalized === 'season') return 'season';
  if (normalized === 'todos' || normalized === 'all') return 'all';
  if (normalized === 'copa') return 'copa_rfef';
  return normalizeCompetitionKey(normalized);
};

const getCompetitionType = (competitionKey, catalog = []) => {
  const key = normalizeCompetitionKey(competitionKey);
  const catalogEntry = catalog.find((competition) => normalizeCompetitionKey(competition) === key);
  if (catalogEntry) {
    return normalizeText(
      catalogEntry.competitionType ??
      catalogEntry.competition_type ??
      catalogEntry.type
    );
  }
  return DEFAULT_COMPETITION_TYPES[key] || '';
};

export const isOfficialCompetition = (competitionKey, catalog = []) =>
  getCompetitionType(competitionKey, catalog) === 'official';

const getSeason = (value = {}) =>
  String(value.season ?? value.seasonKey ?? value.season_key ?? value.temporada ?? '').trim();

export const matchBelongsToActiveSeason = (match, activeSeason) => {
  if (!activeSeason) return true;
  const matchSeason = getSeason(match);
  return Boolean(matchSeason) && matchSeason === String(activeSeason).trim();
};

export const matchMatchesCompetitionScope = (
  match,
  scope = 'season',
  catalog = [],
  { activeSeason = '' } = {}
) => {
  if (!matchBelongsToActiveSeason(match, activeSeason)) return false;
  const key = normalizeCompetitionKey(match);
  const normalizedScope = getCompetitionFilterKey(scope);
  if (normalizedScope === 'all') return true;
  if (normalizedScope === 'season') return isOfficialCompetition(key, catalog);
  return key === normalizedScope;
};

export const filterMatchesByCompetition = (matches, scope, catalog, options) =>
  (Array.isArray(matches) ? matches : []).filter((match) =>
    matchMatchesCompetitionScope(match, scope, catalog, options)
  );
