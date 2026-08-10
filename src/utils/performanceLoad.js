export const PERFORMANCE_SESSION_TYPES = Object.freeze([
  { value: 'training', label: 'Entrenamiento' },
  { value: 'match', label: 'Partido' },
  { value: 'recovery', label: 'Recuperación' },
  { value: 'activation', label: 'Activación' },
  { value: 'rest', label: 'Descanso' },
  { value: 'other', label: 'Otro' },
]);

const SESSION_TYPE_VALUES = new Set(PERFORMANCE_SESSION_TYPES.map((option) => option.value));
const INTEGER_FIELDS = new Set(['actualDurationMinutes', 'accelerations', 'decelerations', 'sprints']);

export const EMPTY_DAILY_LOAD_DRAFT = Object.freeze({
  sessionDate: '',
  sessionType: 'training',
  actualDurationMinutes: '',
  distanceKm: '',
  hsrM: '',
  accelerations: '',
  decelerations: '',
  sprints: '',
  metersPerMinute: '',
  notes: '',
});

export function parseNullablePerformanceNumber(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  if (!/^-?\d+(?:[.,]\d+)?$/.test(normalized)) {
    throw new Error('Formato numérico no válido. Usa una coma o un punto como separador decimal.');
  }
  const number = Number(normalized.replace(',', '.'));
  if (!Number.isFinite(number)) throw new Error('El valor numérico no es válido.');
  return number;
}

export function isIsoCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(year, month, 0).getDate();
  return day <= daysInMonth;
}

function formatDraftNumber(value) {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return String(number).replace('.', ',');
}

export function buildDailyLoadDraft(load, sessionDate = '') {
  const session = load?.session || load?.trainingSession || null;
  const metrics = load?.metrics || null;
  return {
    ...EMPTY_DAILY_LOAD_DRAFT,
    sessionDate: sessionDate || session?.session_date || '',
    sessionType: SESSION_TYPE_VALUES.has(session?.session_type) ? session.session_type : 'training',
    actualDurationMinutes: formatDraftNumber(session?.actual_duration_minutes),
    distanceKm: metrics?.distance_m === null || metrics?.distance_m === undefined
      ? ''
      : formatDraftNumber(Number(metrics.distance_m) / 1000),
    hsrM: formatDraftNumber(metrics?.hsr_m),
    accelerations: formatDraftNumber(metrics?.accelerations),
    decelerations: formatDraftNumber(metrics?.decelerations),
    sprints: formatDraftNumber(metrics?.sprints),
    metersPerMinute: formatDraftNumber(metrics?.meters_per_minute),
    notes: session?.notes || '',
  };
}

export function validateDailyLoad(draft) {
  const errors = {};
  const values = {};

  if (!isIsoCalendarDate(draft?.sessionDate)) {
    errors.sessionDate = 'La fecha seleccionada no es válida.';
  }
  if (!SESSION_TYPE_VALUES.has(draft?.sessionType)) {
    errors.sessionType = 'Selecciona un tipo de sesión válido.';
  }

  const fieldDefinitions = [
    ['actualDurationMinutes', 'Volumen'],
    ['distanceKm', 'Distancia'],
    ['hsrM', 'HSR'],
    ['accelerations', 'ACC'],
    ['decelerations', 'DCC'],
    ['sprints', 'Sprint'],
    ['metersPerMinute', 'M/min'],
  ];

  fieldDefinitions.forEach(([field, label]) => {
    try {
      const parsed = parseNullablePerformanceNumber(draft?.[field]);
      values[field] = parsed;
      if (parsed !== null && parsed < 0) errors[field] = `${label} no puede ser negativo.`;
      if (parsed !== null && INTEGER_FIELDS.has(field) && !Number.isInteger(parsed)) {
        errors[field] = `${label} debe ser un número entero.`;
      }
    } catch (error) {
      errors[field] = error.message;
      values[field] = null;
    }
  });

  if (values.actualDurationMinutes !== null && values.actualDurationMinutes <= 0) {
    errors.actualDurationMinutes = 'El volumen debe ser mayor que cero.';
  }
  if (draft?.sessionType !== 'rest' && values.actualDurationMinutes === null) {
    errors.actualDurationMinutes = 'El volumen es obligatorio cuando existe sesión.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    values,
  };
}

export function buildDailyLoadRpcParams(draft) {
  const validation = validateDailyLoad(draft);
  if (!validation.isValid) {
    const error = new Error(Object.values(validation.errors)[0] || 'La carga diaria no es válida.');
    error.name = 'PerformanceLoadValidationError';
    error.validationErrors = validation.errors;
    throw error;
  }

  const { values } = validation;
  return {
    p_session_date: draft.sessionDate,
    p_session_type: draft.sessionType,
    p_actual_duration_minutes: values.actualDurationMinutes,
    p_distance_m: values.distanceKm === null ? null : Math.round(values.distanceKm * 100000) / 100,
    p_hsr_m: values.hsrM,
    p_accelerations: values.accelerations,
    p_decelerations: values.decelerations,
    p_sprints: values.sprints,
    p_meters_per_minute: values.metersPerMinute,
    p_notes: String(draft.notes || '').trim() || null,
  };
}

export function getPerformanceSessionTypeLabel(value) {
  return PERFORMANCE_SESSION_TYPES.find((option) => option.value === value)?.label || 'Otro';
}

export function getRpeCoverage(responseCount, activePlayerCount) {
  const responses = Number.isInteger(Number(responseCount)) && Number(responseCount) >= 0
    ? Number(responseCount)
    : 0;
  const requestedTotal = Number(activePlayerCount);
  const hasReliableTotal = Number.isInteger(requestedTotal)
    && requestedTotal > 0
    && responses <= requestedTotal;
  const total = hasReliableTotal ? requestedTotal : null;
  const percentage = total === null ? null : Math.round((responses / total) * 100);
  return {
    responses,
    total,
    percentage,
    hasReliableTotal,
    isLowCoverage: responses > 0 && percentage !== null && percentage < 50,
  };
}
