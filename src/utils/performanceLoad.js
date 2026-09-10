export const PERFORMANCE_SESSION_TYPES = Object.freeze([
  { value: 'training', label: 'Entrenamiento' },
  { value: 'match', label: 'Partido' },
  { value: 'recovery', label: 'Recuperación' },
  { value: 'activation', label: 'Activación' },
  { value: 'rest', label: 'Descanso' },
  { value: 'other', label: 'Otro' },
]);

export const PERFORMANCE_LOAD_METRIC_CONFIG = Object.freeze([
  {
    key: 'loadUnits',
    label: 'U.C.',
    unit: 'U.C.',
    aggregation: 'sum',
    decimals: 1,
    enabled: true,
    valueFromRecord: (record) => {
      const value = record?.metrics?.load_units;
      return toNullableMetricNumber(value);
    },
  },
  {
    key: 'distanceKm',
    label: 'Distancia',
    unit: 'km',
    aggregation: 'sum',
    decimals: 2,
    enabled: true,
    valueFromRecord: (record) => {
      const value = toNullableMetricNumber(record?.metrics?.distance_m);
      return value === null ? null : value / 1000;
    },
  },
  {
    key: 'hsrM',
    label: 'HSR',
    unit: 'm',
    aggregation: 'sum',
    decimals: 1,
    enabled: true,
    valueFromRecord: (record) => {
      return toNullableMetricNumber(record?.metrics?.hsr_m);
    },
  },
  {
    key: 'accelerations',
    label: 'ACC',
    unit: 'acciones',
    aggregation: 'sum',
    decimals: 0,
    enabled: true,
    valueFromRecord: (record) => {
      return toNullableMetricNumber(record?.metrics?.accelerations);
    },
  },
  {
    key: 'decelerations',
    label: 'DCC',
    unit: 'acciones',
    aggregation: 'sum',
    decimals: 0,
    enabled: true,
    valueFromRecord: (record) => {
      return toNullableMetricNumber(record?.metrics?.decelerations);
    },
  },
  {
    key: 'sprints',
    label: 'Sprint',
    unit: 'sprints',
    aggregation: 'sum',
    decimals: 0,
    enabled: true,
    valueFromRecord: (record) => {
      return toNullableMetricNumber(record?.metrics?.sprints);
    },
  },
  {
    key: 'metersPerMinute',
    label: 'M/min',
    unit: 'm/min',
    aggregation: 'durationWeightedAverage',
    decimals: 1,
    enabled: true,
    valueFromRecord: (record) => {
      return toNullableMetricNumber(record?.metrics?.meters_per_minute);
    },
    weightFromRecord: (record) => toNullableMetricNumber(record?.session?.actual_duration_minutes),
  },
  {
    key: 'actualDurationMinutes',
    label: 'Volumen',
    unit: 'min',
    aggregation: 'sum',
    decimals: 0,
    enabled: true,
    valueFromRecord: (record) => {
      return toNullableMetricNumber(record?.session?.actual_duration_minutes);
    },
  },
]);

export const getPerformanceLoadMetricConfig = (key) => PERFORMANCE_LOAD_METRIC_CONFIG.find((item) => item.key === key) || PERFORMANCE_LOAD_METRIC_CONFIG[0];

function toNullableMetricNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function aggregatePerformanceMetricPoints(points = [], metricConfig) {
  const dataPoints = points.filter((point) => point?.hasData && Number.isFinite(point.value));
  if (!dataPoints.length) return null;

  if (metricConfig?.aggregation === 'durationWeightedAverage') {
    const weightedPoints = dataPoints.filter((point) => Number.isFinite(point.weight) && point.weight > 0);
    if (weightedPoints.length !== dataPoints.length) return null;
    const totalWeight = weightedPoints.reduce((sum, point) => sum + point.weight, 0);
    return totalWeight > 0
      ? weightedPoints.reduce((sum, point) => sum + (point.value * point.weight), 0) / totalWeight
      : null;
  }

  return dataPoints.reduce((sum, point) => sum + point.value, 0);
}

export function summarizePerformanceMetricPoints(points = [], metricConfig) {
  const dataPoints = points.filter((point) => point?.hasData && Number.isFinite(point.value));
  const simpleAverage = dataPoints.length
    ? dataPoints.reduce((sum, point) => sum + point.value, 0) / dataPoints.length
    : null;
  const maxPoint = dataPoints.reduce((best, point) => (
    !best || point.value > best.value ? point : best
  ), null);
  return {
    aggregate: aggregatePerformanceMetricPoints(dataPoints, metricConfig),
    simpleAverage,
    maxPoint,
    dataCount: dataPoints.length,
  };
}

export function getPerformanceMetricKpiLabels(metricConfig, period) {
  const periodAdjective = period === 'month' ? 'mensual' : 'semanal';
  if (metricConfig?.aggregation === 'durationWeightedAverage') {
    return {
      aggregate: `Media ponderada ${periodAdjective} de ${metricConfig.label}`,
      average: `Media simple de ${metricConfig.label} por día con dato`,
      peak: period === 'month'
        ? `Semana de mayor ${metricConfig.label}`
        : `Día de mayor ${metricConfig.label}`,
    };
  }
  return {
    aggregate: `${metricConfig.label} total ${periodAdjective}`,
    average: `Media de ${metricConfig.label} por día con dato`,
    peak: period === 'month'
      ? `Semana de mayor ${metricConfig.label}`
      : `Día de mayor ${metricConfig.label}`,
  };
}

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
  loadUnits: '',
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
    loadUnits: formatDraftNumber(metrics?.load_units),
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
    ['loadUnits', 'U.C.'],
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
    p_load_units: values.loadUnits,
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
