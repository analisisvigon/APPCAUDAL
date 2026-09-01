const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const PLAYER_CHART_SCALE = Object.freeze({ min: 1, max: 10 });
export const PLAYER_WELLNESS_SCORE_SCALE = Object.freeze({ min: 0, max: 10 });
export const PLAYER_MONTH_DAILY_POINT_LIMIT = 14;

export const PLAYER_PERFORMANCE_METRICS = Object.freeze([
  { key: 'health_ratio', source: 'wellness', field: 'health_ratio', label: 'Wellness', unit: '/10', scale: PLAYER_WELLNESS_SCORE_SCALE },
  { key: 'rpe', source: 'rpe', field: 'rpe', label: 'RPE', unit: '/10', scale: PLAYER_CHART_SCALE },
  { key: 'sleep_quality', source: 'wellness', field: 'sleep_quality', label: 'Sueño', unit: '/10', scale: PLAYER_CHART_SCALE },
  { key: 'fatigue', source: 'wellness', field: 'fatigue', label: 'Fatiga', unit: '/10', scale: PLAYER_CHART_SCALE },
  { key: 'muscle_soreness', source: 'wellness', field: 'muscle_soreness', label: 'Dolor muscular', unit: '/10', scale: PLAYER_CHART_SCALE },
  { key: 'stress', source: 'wellness', field: 'stress', label: 'Estrés', unit: '/10', scale: PLAYER_CHART_SCALE },
  { key: 'mood', source: 'wellness', field: 'mood', label: 'Ánimo', unit: '/10', scale: PLAYER_CHART_SCALE },
  { key: 'weight', source: 'wellness', field: 'weight', label: 'Peso', unit: 'kg', scale: null },
]);

const parseIsoDate = (value) => {
  if (!ISO_DATE_PATTERN.test(String(value || ''))) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    ? date
    : null;
};

const toIsoDate = (date) => [
  date.getUTCFullYear(),
  String(date.getUTCMonth() + 1).padStart(2, '0'),
  String(date.getUTCDate()).padStart(2, '0'),
].join('-');

export function getLocalPlayerDateKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function addPlayerDays(value, amount) {
  const date = parseIsoDate(value);
  if (!date) return '';
  date.setUTCDate(date.getUTCDate() + Number(amount || 0));
  return toIsoDate(date);
}

export function getPlayerWeekBounds(anchorDate) {
  const date = parseIsoDate(anchorDate);
  if (!date) return { startDate: '', endDate: '' };
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  const startDate = addPlayerDays(toIsoDate(date), -mondayOffset);
  return { startDate, endDate: addPlayerDays(startDate, 6) };
}

export function getPlayerMonthBounds(anchorDate) {
  const date = parseIsoDate(anchorDate);
  if (!date) return { startDate: '', endDate: '' };
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return { startDate: toIsoDate(start), endDate: toIsoDate(end) };
}

export function getPlayerCalendarGrid(anchorDate) {
  const month = getPlayerMonthBounds(anchorDate);
  if (!month.startDate) return [];
  const gridStart = getPlayerWeekBounds(month.startDate).startDate;
  const lastWeekEnd = getPlayerWeekBounds(month.endDate).endDate;
  const days = [];
  for (let cursor = gridStart; cursor <= lastWeekEnd; cursor = addPlayerDays(cursor, 1)) days.push(cursor);
  return days;
}

export function getPlayerPerformanceFetchRange(anchorDate) {
  const grid = getPlayerCalendarGrid(anchorDate);
  return { startDate: grid[0] || '', endDate: grid.at(-1) || '' };
}

export function shiftPlayerPerformanceAnchor(anchorDate, period, direction) {
  const date = parseIsoDate(anchorDate);
  if (!date) return anchorDate;
  if (period === 'month') {
    const targetMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + Number(direction || 0), 1));
    const lastDay = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0)).getUTCDate();
    targetMonth.setUTCDate(Math.min(date.getUTCDate(), lastDay));
    return toIsoDate(targetMonth);
  }
  date.setUTCDate(date.getUTCDate() + (7 * Number(direction || 0)));
  return toIsoDate(date);
}

export function getPlayerMetricDefinition(metricKey) {
  return PLAYER_PERFORMANCE_METRICS.find((metric) => metric.key === metricKey) || null;
}

export function getAvailablePlayerMetrics(wellness = [], rpe = []) {
  return PLAYER_PERFORMANCE_METRICS.filter((metric) => {
    const entries = metric.source === 'wellness' ? wellness : rpe;
    return entries.some((entry) => getPlayerMetricValue(entry?.[metric.field], metric.scale || { min: -Infinity, max: Infinity }) !== null);
  });
}

const enumerateDates = (startDate, endDate) => {
  const dates = [];
  if (!parseIsoDate(startDate) || !parseIsoDate(endDate) || startDate > endDate) return dates;
  for (let cursor = startDate; cursor <= endDate; cursor = addPlayerDays(cursor, 1)) dates.push(cursor);
  return dates;
};

const getEntryByDate = (entries) => {
  const result = new Map();
  entries.forEach((entry) => {
    if (ISO_DATE_PATTERN.test(String(entry?.entry_date || '')) && !result.has(entry.entry_date)) {
      result.set(entry.entry_date, entry);
    }
  });
  return result;
};

const roundMetric = (value) => Math.round((value + Number.EPSILON) * 10) / 10;

const getDynamicScale = (values) => {
  if (!values.length) return { min: 0, max: 1 };
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const padding = minimum === maximum ? 1 : Math.max((maximum - minimum) * 0.12, 0.2);
  return { min: roundMetric(minimum - padding), max: roundMetric(maximum + padding) };
};

export function buildPlayerPerformanceTrend({
  wellness = [],
  rpe = [],
  metricKey,
  period = 'week',
  anchorDate,
} = {}) {
  const metric = getPlayerMetricDefinition(metricKey);
  const bounds = period === 'month' ? getPlayerMonthBounds(anchorDate) : getPlayerWeekBounds(anchorDate);
  if (!metric || !bounds.startDate) {
    return { metric, points: [], scale: PLAYER_CHART_SCALE, summary: null, aggregation: 'daily', ...bounds };
  }

  const entries = (metric.source === 'wellness' ? wellness : rpe)
    .filter((entry) => entry?.entry_date >= bounds.startDate && entry?.entry_date <= bounds.endDate);
  const byDate = getEntryByDate(entries);
  const dailyPoints = enumerateDates(bounds.startDate, bounds.endDate).map((date) => ({
    id: `${metric.key}-${date}`,
    date,
    endDate: date,
    label: date,
    value: getPlayerMetricValue(byDate.get(date)?.[metric.field], metric.scale || { min: -Infinity, max: Infinity }),
    count: byDate.has(date) ? 1 : 0,
  }));
  const availableDaily = dailyPoints.filter((point) => point.value !== null);
  const useWeeklyAverages = period === 'month' && availableDaily.length > PLAYER_MONTH_DAILY_POINT_LIMIT;
  let points = dailyPoints;

  if (useWeeklyAverages) {
    const buckets = new Map();
    dailyPoints.forEach((point) => {
      const weekStart = getPlayerWeekBounds(point.date).startDate;
      if (!buckets.has(weekStart)) buckets.set(weekStart, []);
      if (point.value !== null) buckets.get(weekStart).push(point);
    });
    points = [...buckets.entries()].map(([weekStart, weekPoints]) => {
      const visibleStart = weekStart < bounds.startDate ? bounds.startDate : weekStart;
      const rawEnd = addPlayerDays(weekStart, 6);
      const visibleEnd = rawEnd > bounds.endDate ? bounds.endDate : rawEnd;
      return {
        id: `${metric.key}-${weekStart}`,
        date: visibleStart,
        endDate: visibleEnd,
        label: `${visibleStart}/${visibleEnd}`,
        value: weekPoints.length ? roundMetric(weekPoints.reduce((total, point) => total + point.value, 0) / weekPoints.length) : null,
        count: weekPoints.length,
      };
    });
  }

  const available = points.filter((point) => point.value !== null);
  const summaryValues = availableDaily.map((point) => point.value);
  const summary = summaryValues.length ? {
    average: roundMetric(summaryValues.reduce((total, value) => total + value, 0) / summaryValues.length),
    latest: summaryValues.at(-1),
    change: summaryValues.length > 1 ? roundMetric(summaryValues.at(-1) - summaryValues[0]) : null,
    count: summaryValues.length,
  } : null;
  const scaleValues = available.map((point) => point.value);

  return {
    metric,
    points,
    scale: metric.scale || getDynamicScale(scaleValues),
    summary,
    aggregation: useWeeklyAverages ? 'weekly_average' : 'daily',
    ...bounds,
  };
}

export function buildPlayerActivityByDate(wellness = [], rpe = []) {
  const activity = new Map();
  wellness.forEach((entry) => {
    if (!ISO_DATE_PATTERN.test(String(entry?.entry_date || ''))) return;
    const current = activity.get(entry.entry_date) || { date: entry.entry_date, wellness: null, rpe: null, hasDiscomfort: false };
    if (!current.wellness) current.wellness = entry;
    current.hasDiscomfort = current.hasDiscomfort || Boolean(String(entry?.discomfort || '').trim());
    activity.set(entry.entry_date, current);
  });
  rpe.forEach((entry) => {
    if (!ISO_DATE_PATTERN.test(String(entry?.entry_date || ''))) return;
    const current = activity.get(entry.entry_date) || { date: entry.entry_date, wellness: null, rpe: null, hasDiscomfort: false };
    if (!current.rpe) current.rpe = entry;
    activity.set(entry.entry_date, current);
  });
  return activity;
}

export function getDefaultPlayerSelectedDate(wellness = [], rpe = [], anchorDate, today) {
  const month = getPlayerMonthBounds(anchorDate);
  const availableDates = [...buildPlayerActivityByDate(wellness, rpe).keys()]
    .filter((date) => date >= month.startDate && date <= month.endDate)
    .sort();
  if (availableDates.includes(today)) return today;
  return availableDates.at(-1) || '';
}

export function buildPlayerCurrentState(wellness = [], rpe = [], today = '') {
  const byMostRecent = (left, right) => (
    String(right?.entry_date || '').localeCompare(String(left?.entry_date || ''))
    || String(right?.id || '').localeCompare(String(left?.id || ''))
  );
  const wellnessRows = [...(Array.isArray(wellness) ? wellness : [])].sort(byMostRecent);
  const rpeRows = [...(Array.isArray(rpe) ? rpe : [])].sort(byMostRecent);
  return {
    latestWellness: wellnessRows[0] || null,
    latestRpe: rpeRows[0] || null,
    todayWellness: wellnessRows.find((entry) => entry.entry_date === today) || null,
    todayRpe: rpeRows.find((entry) => entry.entry_date === today) || null,
    latestDate: getLatestPlayerUpdateDate(wellnessRows, rpeRows),
    hasRecords: Boolean(wellnessRows.length || rpeRows.length),
  };
}

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
