const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function getValidRpeValue(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(String(value).replace(',', '.'));
  return Number.isFinite(number) && number >= 1 && number <= 10 ? number : null;
}

export function summarizeRpeEntries(entries = []) {
  const values = (Array.isArray(entries) ? entries : [])
    .map((entry) => getValidRpeValue(entry?.rpe))
    .filter((value) => value !== null);

  return {
    count: values.length,
    average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    values,
  };
}

export function filterRpeEntriesByRange(entries = [], startDate, endDate) {
  if (!ISO_DATE_PATTERN.test(String(startDate || '')) || !ISO_DATE_PATTERN.test(String(endDate || ''))) {
    return [];
  }
  return (Array.isArray(entries) ? entries : []).filter((entry) => (
    ISO_DATE_PATTERN.test(String(entry?.entry_date || ''))
    && entry.entry_date >= startDate
    && entry.entry_date <= endDate
  ));
}

export function resolveRpePeriodEntries({
  period,
  weeklyEntries = [],
  periodEntries = [],
  expectedPeriodKey = '',
  loadedPeriodKey = '',
} = {}) {
  if (period === 'week') return Array.isArray(weeklyEntries) ? weeklyEntries : [];
  if (!expectedPeriodKey || loadedPeriodKey !== expectedPeriodKey) return [];
  return Array.isArray(periodEntries) ? periodEntries : [];
}

export function resolveRpeRefreshEntries(currentEntries = [], nextEntries = [], succeeded = false) {
  if (!succeeded) return Array.isArray(currentEntries) ? currentEntries : [];
  return Array.isArray(nextEntries) ? nextEntries : [];
}

export function getRpeWorkloadAvailability(entry) {
  const hasLinkedSession = Boolean(entry?.session_id);
  const duration = Number(entry?.duration_minutes);
  const hasReliableDuration = hasLinkedSession && Number.isFinite(duration) && duration > 0;
  const load = Number(entry?.load);
  const hasLoadValue = entry?.load !== null && entry?.load !== undefined && String(entry.load).trim() !== '';
  const hasReliableLoad = hasReliableDuration && hasLoadValue && Number.isFinite(load) && load >= 0;

  return {
    durationMinutes: hasReliableDuration ? duration : null,
    load: hasReliableLoad ? load : null,
  };
}
