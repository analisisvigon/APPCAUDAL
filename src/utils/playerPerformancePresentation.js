const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const PLAYER_CHART_SCALE = Object.freeze({ min: 1, max: 10 });

export function getPlayerChartEntries(entries = [], limit = 7) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 7;
  return safeEntries.slice(0, safeLimit).reverse();
}

export function getPlayerMetricValue(value, scale = PLAYER_CHART_SCALE) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= scale.min && parsed <= scale.max ? parsed : null;
}

export function buildPlayerMetricSeries(entries = [], field, limit = 7) {
  return getPlayerChartEntries(entries, limit).map((entry) => ({
    id: String(entry?.id || `${entry?.entry_date || 'undated'}-${field}`),
    date: ISO_DATE_PATTERN.test(String(entry?.entry_date || '')) ? entry.entry_date : '',
    value: getPlayerMetricValue(entry?.[field]),
  }));
}

export function splitAvailablePlayerSeries(points = []) {
  const segments = [];
  let segment = [];

  points.forEach((point) => {
    if (point?.date && point?.value !== null && point?.value !== undefined) {
      segment.push(point);
      return;
    }
    if (segment.length) segments.push(segment);
    segment = [];
  });

  if (segment.length) segments.push(segment);
  return segments;
}

export function getLatestPlayerUpdateDate(wellness = [], rpe = []) {
  return [...(Array.isArray(wellness) ? wellness : []), ...(Array.isArray(rpe) ? rpe : [])]
    .map((entry) => String(entry?.entry_date || ''))
    .filter((value) => ISO_DATE_PATTERN.test(value))
    .sort()
    .at(-1) || '';
}
