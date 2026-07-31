const asArray = (value) => (Array.isArray(value) ? value : []);

const cleanObservationText = (value, { discomfort = false } = {}) => {
  const text = String(value ?? '')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text || /^(?:[.\-–—]\s*)+$/.test(text)) return '';

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
  if (
    discomfort
    && /^(todo bien|ningun dolor|no tengo molestias?|no tengo ninguna molestia)$/.test(normalized)
  ) return '';
  return text;
};

const normalizeDuplicateKey = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[.,;:!?'"()[\]{}]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const normalizePerformanceCalendarDate = (value) => {
  const text = String(value ?? '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendarCheck = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarCheck.getUTCFullYear() !== year
    || calendarCheck.getUTCMonth() !== month - 1
    || calendarCheck.getUTCDate() !== day
  ) return '';
  return `${match[1]}-${match[2]}-${match[3]}`;
};

const entryDate = (entry) => normalizePerformanceCalendarDate(
  entry?.entry_date || entry?.entryDate || ''
);

const parseTimestamp = (value) => {
  if (!value) return { timestamp: '', timestampMs: null };
  const timestampMs = value instanceof Date ? value.getTime() : Date.parse(String(value));
  if (!Number.isFinite(timestampMs)) return { timestamp: '', timestampMs: null };
  return {
    timestamp: value instanceof Date ? value.toISOString() : String(value),
    timestampMs,
  };
};

const getEntryTimestamp = (entry) => {
  const submitted = parseTimestamp(entry?.submitted_at || entry?.submittedAt);
  if (submitted.timestampMs !== null) {
    return { ...submitted, timestampReliable: true, timestampField: 'submitted_at' };
  }

  const created = parseTimestamp(entry?.created_at || entry?.createdAt);
  if (created.timestampMs !== null) {
    // En históricos Wellness, created_at puede ser la hora de importación, no la de respuesta.
    return { ...created, timestampReliable: false, timestampField: 'created_at' };
  }

  return {
    timestamp: '',
    timestampMs: null,
    timestampReliable: false,
    timestampField: '',
  };
};

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

export const formatPerformanceObservationDate = (date, referenceDate) => {
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
  sourceTable,
  sourceLabel,
  type,
  sourceType,
  sourceField,
  priority,
  discomfort = false,
}) => {
  const text = cleanObservationText(value, { discomfort });
  if (!text) return;
  const timestamp = getEntryTimestamp(entry);
  target.push({
    source,
    sourceTable,
    sourceLabel,
    type,
    sourceType,
    sourceField,
    text,
    date: entryDate(entry),
    playerId: String(entry?.jugador_id || entry?.jugadorId || ''),
    ...timestamp,
    priority,
  });
};

export const buildPerformanceObservations = ({
  wellnessEntries = [],
  rpeEntries = [],
  playerId = '',
  referenceDate = Date.now(),
} = {}) => {
  const belongsToPlayer = (entry) => (
    !playerId || String(entry?.jugador_id || entry?.jugadorId || '') === String(playerId)
  );
  const wellness = asArray(wellnessEntries).filter((entry) => (
    belongsToPlayer(entry) && entryDate(entry)
  ));
  const rpe = asArray(rpeEntries).filter((entry) => (
    belongsToPlayer(entry) && entryDate(entry)
  ));
  const candidates = [];

  wellness.forEach((entry) => {
    [
      ['discomfort', entry.discomfort],
      ['muscle_discomfort', entry.muscle_discomfort],
      ['pain_location', entry.pain_location],
      ['affected_area', entry.affected_area],
    ].forEach(([sourceField, value]) => appendCandidate(candidates, {
      entry,
      value,
      source: 'wellness',
      sourceTable: 'wellness_entries',
      sourceLabel: 'Molestia',
      type: 'discomfort',
      sourceType: 'discomfort',
      sourceField,
      priority: 1,
      discomfort: true,
    }));
  });

  rpe.forEach((entry) => {
    [
      ['comment', entry.comment],
      ['observation', entry.observation],
      ['observations', entry.observations],
      ['notes', entry.notes],
    ].forEach(([sourceField, value]) => appendCandidate(candidates, {
      entry,
      value,
      source: 'rpe',
      sourceTable: 'rpe_entries',
      sourceLabel: 'RPE',
      type: 'comment',
      sourceType: 'rpe_comment',
      sourceField,
      priority: 2,
    }));
  });

  wellness.forEach((entry) => {
    [
      ['comment', entry.comment],
      ['observation', entry.observation],
      ['observations', entry.observations],
      ['notes', entry.notes],
    ].forEach(([sourceField, value]) => appendCandidate(candidates, {
      entry,
      value,
      source: 'wellness',
      sourceTable: 'wellness_entries',
      sourceLabel: 'Wellness',
      type: 'comment',
      sourceType: 'wellness_comment',
      sourceField,
      priority: 3,
    }));
  });

  const deduplicated = [];
  const seen = new Set();
  candidates
    .sort((left, right) => {
      const dateOrder = right.date.localeCompare(left.date);
      if (dateOrder) return dateOrder;
      if (
        left.timestampReliable
        && right.timestampReliable
        && left.timestampMs !== right.timestampMs
      ) {
        return right.timestampMs - left.timestampMs;
      }
      return left.priority - right.priority || left.text.localeCompare(right.text);
    })
    .forEach((candidate) => {
      const key = normalizeDuplicateKey(candidate.text);
      if (!key || seen.has(key)) return;
      seen.add(key);
      deduplicated.push(candidate);
    });

  return deduplicated.map((item) => {
    const dateLabel = formatPerformanceObservationDate(item.date, referenceDate);
    return {
      ...item,
      dateLabel,
      label: [item.sourceLabel, dateLabel, item.text].filter(Boolean).join(' · '),
    };
  });
};

export const buildPerformanceObservationsByPlayer = ({
  wellnessEntries = [],
  rpeEntries = [],
  referenceDate = Date.now(),
} = {}) => {
  const wellnessByPlayer = new Map();
  const rpeByPlayer = new Map();

  asArray(wellnessEntries).forEach((entry) => {
    const playerId = String(entry?.jugador_id || entry?.jugadorId || '');
    if (!playerId) return;
    const playerEntries = wellnessByPlayer.get(playerId) || [];
    playerEntries.push(entry);
    wellnessByPlayer.set(playerId, playerEntries);
  });
  asArray(rpeEntries).forEach((entry) => {
    const playerId = String(entry?.jugador_id || entry?.jugadorId || '');
    if (!playerId) return;
    const playerEntries = rpeByPlayer.get(playerId) || [];
    playerEntries.push(entry);
    rpeByPlayer.set(playerId, playerEntries);
  });

  const playerIds = new Set([...wellnessByPlayer.keys(), ...rpeByPlayer.keys()]);
  return new Map([...playerIds].map((playerId) => [
    playerId,
    buildPerformanceObservations({
      wellnessEntries: wellnessByPlayer.get(playerId) || [],
      rpeEntries: rpeByPlayer.get(playerId) || [],
      playerId,
      referenceDate,
    }),
  ]));
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
    emptyLabel: 'Sin observaciones registradas',
  };
};
