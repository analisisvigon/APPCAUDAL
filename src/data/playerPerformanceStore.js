const WELLNESS_COLUMNS = [
  'id',
  'entry_date',
  'sleep_hours',
  'sleep_quality',
  'fatigue',
  'muscle_soreness',
  'stress',
  'mood',
  'weight',
  'discomfort',
  'comment',
].join(',');

const RPE_COLUMNS = [
  'id',
  'session_id',
  'entry_date',
  'duration_minutes',
  'rpe',
  'load',
  'comment',
].join(',');

export const PLAYER_PERFORMANCE_PAGE_SIZE = 8;
export const PLAYER_PERFORMANCE_MAX_PAGE_SIZE = 20;

export class PlayerPerformanceLoadError extends Error {
  constructor(kind = 'network') {
    super(kind === 'invalid_session'
      ? 'La sesión ya no es válida.'
      : 'No se pudo cargar Mi rendimiento.');
    this.name = 'PlayerPerformanceLoadError';
    this.kind = kind;
  }
}

const normalizeOptionalNumber = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeOptionalText = (value) => {
  const normalized = String(value ?? '').trim();
  return normalized || null;
};

const normalizeDate = (value) => {
  const normalized = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
};

const normalizeWellnessEntry = (row) => ({
  id: String(row?.id || ''),
  entry_date: normalizeDate(row?.entry_date),
  sleep_hours: normalizeOptionalNumber(row?.sleep_hours),
  sleep_quality: normalizeOptionalNumber(row?.sleep_quality),
  fatigue: normalizeOptionalNumber(row?.fatigue),
  muscle_soreness: normalizeOptionalNumber(row?.muscle_soreness),
  stress: normalizeOptionalNumber(row?.stress),
  mood: normalizeOptionalNumber(row?.mood),
  weight: normalizeOptionalNumber(row?.weight),
  discomfort: normalizeOptionalText(row?.discomfort),
  comment: normalizeOptionalText(row?.comment),
});

const normalizeRpeEntry = (row) => ({
  id: String(row?.id || ''),
  session_id: normalizeOptionalText(row?.session_id),
  entry_date: normalizeDate(row?.entry_date),
  duration_minutes: normalizeOptionalNumber(row?.duration_minutes),
  rpe: normalizeOptionalNumber(row?.rpe),
  load: normalizeOptionalNumber(row?.load),
  comment: normalizeOptionalText(row?.comment),
});

const normalizePageRequest = ({ offset = 0, limit = PLAYER_PERFORMANCE_PAGE_SIZE } = {}) => ({
  offset: Math.max(0, Number.isInteger(offset) ? offset : 0),
  limit: Math.min(
    PLAYER_PERFORMANCE_MAX_PAGE_SIZE,
    Math.max(1, Number.isInteger(limit) ? limit : PLAYER_PERFORMANCE_PAGE_SIZE),
  ),
});

const isInvalidSessionError = (error) => {
  const status = Number(error?.status || error?.statusCode);
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return status === 401
    || code === 'PGRST301'
    || message.includes('jwt expired')
    || message.includes('invalid jwt');
};

const loadPage = async (client, table, columns, mapEntry, options) => {
  if (!client || typeof client.from !== 'function') {
    throw new PlayerPerformanceLoadError('invalid_session');
  }

  const { offset, limit } = normalizePageRequest(options);
  let response;
  try {
    response = await client
      .from(table)
      .select(columns)
      .order('entry_date', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + limit);
  } catch (error) {
    throw new PlayerPerformanceLoadError(
      isInvalidSessionError(error) ? 'invalid_session' : 'network',
    );
  }

  if (response?.error) {
    throw new PlayerPerformanceLoadError(
      isInvalidSessionError(response.error) ? 'invalid_session' : 'network',
    );
  }

  const receivedRows = Array.isArray(response?.data) ? response.data : [];
  return {
    rows: receivedRows.slice(0, limit).map(mapEntry),
    hasMore: receivedRows.length > limit,
    nextOffset: offset + Math.min(receivedRows.length, limit),
  };
};

export const loadPlayerWellnessPage = (client, options) => loadPage(
  client,
  'wellness_entries',
  WELLNESS_COLUMNS,
  normalizeWellnessEntry,
  options,
);

export const loadPlayerRpePage = (client, options) => loadPage(
  client,
  'rpe_entries',
  RPE_COLUMNS,
  normalizeRpeEntry,
  options,
);

export async function loadPlayerPerformancePage(client, options = {}) {
  const [wellness, rpe] = await Promise.all([
    loadPlayerWellnessPage(client, options),
    loadPlayerRpePage(client, options),
  ]);
  return { wellness, rpe };
}
