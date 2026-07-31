const asArray = (value) => (Array.isArray(value) ? value : []);

const cleanObservationText = (value, { discomfort = false } = {}) => {
  const text = String(value ?? '')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text || /^[-–—]+$/.test(text)) return '';

  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.,;:!?]+$/g, '')
    .trim();
  const emptyAnswers = new Set([
    'no',
    'n/a',
    'na',
    's/d',
    'sd',
    'sin datos',
    'sin dato',
    'sin comentario',
    'sin comentarios',
    'sin molestia',
    'sin molestias',
    'ninguna molestia',
    'sin dolor',
    'ninguna',
    'ninguno',
    'nada',
  ]);
  if (emptyAnswers.has(normalized)) return '';
  if (discomfort && /^(todo bien|ningun dolor)$/.test(normalized)) return '';
  return text;
};

const normalizeDuplicateKey = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[.,;:!?'"()[\]{}]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const entryDate = (entry) => String(entry?.entry_date || entry?.entryDate || '').slice(0, 10);

const entryTimestamp = (entry) => String(
  entry?.submitted_at ||
  entry?.submittedAt ||
  entry?.updated_at ||
  entry?.updatedAt ||
  entry?.created_at ||
  entry?.createdAt ||
  ''
);

const compareEntries = (left, right) => (
  entryDate(left).localeCompare(entryDate(right)) ||
  entryTimestamp(left).localeCompare(entryTimestamp(right)) ||
  String(left?.id || '').localeCompare(String(right?.id || ''))
);

const isInsideContext = (entry, startDate, endDate) => {
  const date = entryDate(entry);
  if (!startDate && !endDate) return true;
  if (!date) return false;
  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;
  return true;
};

const latestEntry = (entries) => [...entries].sort(compareEntries).pop() || null;

const localDateKey = (value) => {
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  if (Number.isNaN(date.getTime())) return '';
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
};

const addDays = (dateKey, amount) => {
  const match = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setDate(date.getDate() + amount);
  return localDateKey(date);
};

const formatObservationDate = (date, referenceDate) => {
  if (!date) return '';
  const reference = localDateKey(referenceDate);
  if (date === reference) return 'Hoy';
  if (date === addDays(reference, -1)) return 'Ayer';
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}` : date;
};

const appendCandidate = (target, {
  entry,
  value,
  source,
  sourceLabel,
  type,
  priority,
  discomfort = false,
}) => {
  const text = cleanObservationText(value, { discomfort });
  if (!text) return;
  target.push({
    source,
    sourceLabel,
    type,
    text,
    date: entryDate(entry),
    priority,
  });
};

export const buildPerformanceObservations = ({
  wellnessEntries = [],
  rpeEntries = [],
  playerId = '',
  contextStartDate = '',
  contextEndDate = '',
  referenceDate = Date.now(),
} = {}) => {
  const belongsToPlayer = (entry) => (
    !playerId || String(entry?.jugador_id || entry?.jugadorId || '') === String(playerId)
  );
  const wellness = asArray(wellnessEntries).filter((entry) => (
    belongsToPlayer(entry) && isInsideContext(entry, contextStartDate, contextEndDate)
  ));
  const rpe = asArray(rpeEntries).filter((entry) => (
    belongsToPlayer(entry) && isInsideContext(entry, contextStartDate, contextEndDate)
  ));
  const latestWellness = latestEntry(wellness);
  const latestRpe = latestEntry(rpe);
  const candidates = [];

  if (latestWellness) {
    [
      latestWellness.discomfort,
      latestWellness.muscle_discomfort,
      latestWellness.pain_location,
      latestWellness.affected_area,
    ].forEach((value) => appendCandidate(candidates, {
      entry: latestWellness,
      value,
      source: 'wellness',
      sourceLabel: 'Molestia',
      type: 'discomfort',
      priority: 1,
      discomfort: true,
    }));
  }

  if (latestRpe) {
    [
      latestRpe.comment,
      latestRpe.observation,
      latestRpe.observations,
      latestRpe.notes,
    ].forEach((value) => appendCandidate(candidates, {
      entry: latestRpe,
      value,
      source: 'rpe',
      sourceLabel: 'RPE',
      type: 'comment',
      priority: 2,
    }));
  }

  if (latestWellness) {
    [
      latestWellness.comment,
      latestWellness.observation,
      latestWellness.observations,
      latestWellness.notes,
    ].forEach((value) => appendCandidate(candidates, {
      entry: latestWellness,
      value,
      source: 'wellness',
      sourceLabel: 'Wellness',
      type: 'comment',
      priority: 3,
    }));
  }

  const deduplicated = [];
  const seen = new Set();
  candidates
    .sort((left, right) => (
      left.priority - right.priority ||
      right.date.localeCompare(left.date) ||
      left.text.localeCompare(right.text)
    ))
    .forEach((candidate) => {
      const key = normalizeDuplicateKey(candidate.text);
      if (!key || seen.has(key)) return;
      seen.add(key);
      deduplicated.push(candidate);
    });

  const distinctDates = new Set(deduplicated.map((item) => item.date).filter(Boolean));
  const showDates = distinctDates.size > 1;
  return deduplicated.map((item) => {
    const dateLabel = showDates ? formatObservationDate(item.date, referenceDate) : '';
    return {
      ...item,
      dateLabel,
      label: [item.sourceLabel, dateLabel, item.text].filter(Boolean).join(' · '),
    };
  });
};

export const getPerformanceObservationView = (observations = [], limit = 2) => {
  const normalizedLimit = Math.max(1, Number(limit) || 2);
  const items = asArray(observations).slice(0, normalizedLimit);
  const hiddenCount = Math.max(0, asArray(observations).length - items.length);
  const fullText = asArray(observations).map((item) => item.label).filter(Boolean).join('\n');
  return {
    items,
    hiddenCount,
    moreLabel: hiddenCount ? `+${hiddenCount} más` : '',
    fullText,
    isEmpty: !asArray(observations).length,
    emptyLabel: 'Sin observaciones',
  };
};
