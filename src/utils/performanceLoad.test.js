import assert from 'node:assert/strict';

import {
  aggregatePerformanceMetricPoints,
  buildDailyLoadDraft,
  buildDailyLoadRpcParams,
  getPerformanceLoadMetricConfig,
  getPerformanceMetricKpiLabels,
  getRpeCoverage,
  isIsoCalendarDate,
  parseNullablePerformanceNumber,
  PERFORMANCE_LOAD_METRIC_CONFIG,
  summarizePerformanceMetricPoints,
  validateDailyLoad,
} from './performanceLoad.js';

assert.equal(parseNullablePerformanceNumber('4,25'), 4.25);
assert.equal(parseNullablePerformanceNumber('4.25'), 4.25);
assert.equal(parseNullablePerformanceNumber('80'), 80);
assert.equal(parseNullablePerformanceNumber('80,5'), 80.5);
assert.equal(parseNullablePerformanceNumber('  '), null);
assert.equal(parseNullablePerformanceNumber(null), null);
assert.throws(() => parseNullablePerformanceNumber('1,234.50'), /Formato numérico/);
assert.throws(() => parseNullablePerformanceNumber('1.2.3'), /Formato numérico/);

const validDraft = {
  sessionDate: '2026-08-10',
  sessionType: 'training',
  actualDurationMinutes: '63',
  distanceKm: '4,25',
  hsrM: '75',
  accelerations: '48',
  decelerations: '43',
  sprints: '2',
  metersPerMinute: '63',
  loadUnits: '320,5',
  notes: 'Trabajo de campo reducido',
};

assert.equal(validateDailyLoad(validDraft).isValid, true);
assert.deepEqual(buildDailyLoadRpcParams(validDraft), {
  p_session_date: '2026-08-10',
  p_session_type: 'training',
  p_actual_duration_minutes: 63,
  p_distance_m: 4250,
  p_hsr_m: 75,
  p_accelerations: 48,
  p_decelerations: 43,
  p_sprints: 2,
  p_meters_per_minute: 63,
  p_load_units: 320.5,
  p_notes: 'Trabajo de campo reducido',
});

const pointDraft = { ...validDraft, distanceKm: '4.25', hsrM: '80.5' };
assert.equal(buildDailyLoadRpcParams(pointDraft).p_distance_m, 4250);
assert.equal(buildDailyLoadRpcParams(pointDraft).p_hsr_m, 80.5);

const nullableRestDraft = {
  sessionDate: '2026-08-11',
  sessionType: 'rest',
  actualDurationMinutes: '',
  distanceKm: '',
  hsrM: '',
  accelerations: '',
  decelerations: '',
  sprints: '',
  metersPerMinute: '',
  notes: '',
};
assert.equal(validateDailyLoad(nullableRestDraft).isValid, true);
assert.deepEqual(buildDailyLoadRpcParams(nullableRestDraft), {
  p_session_date: '2026-08-11',
  p_session_type: 'rest',
  p_actual_duration_minutes: null,
  p_distance_m: null,
  p_hsr_m: null,
  p_accelerations: null,
  p_decelerations: null,
  p_sprints: null,
  p_meters_per_minute: null,
  p_load_units: null,
  p_notes: null,
});

const missingDuration = validateDailyLoad({ ...nullableRestDraft, sessionType: 'match' });
assert.equal(missingDuration.isValid, false);
assert.match(missingDuration.errors.actualDurationMinutes, /obligatorio/);

for (const field of ['actualDurationMinutes', 'distanceKm', 'hsrM', 'accelerations', 'decelerations', 'sprints', 'metersPerMinute', 'loadUnits']) {
  const result = validateDailyLoad({ ...validDraft, [field]: '-1' });
  assert.equal(result.isValid, false, `${field} debe rechazar negativos`);
  assert.match(result.errors[field], /negativo|mayor que cero/);
}

assert.equal(validateDailyLoad({ ...validDraft, accelerations: '2,5' }).isValid, false);
assert.equal(isIsoCalendarDate('2026-08-10'), true);
assert.equal(isIsoCalendarDate('2026-02-29'), false);
assert.equal(isIsoCalendarDate('2028-02-29'), true);
assert.equal(isIsoCalendarDate('10/08/2026'), false);
assert.equal(buildDailyLoadRpcParams(validDraft).p_session_date, '2026-08-10');

const loadedDraft = buildDailyLoadDraft({
  session: {
    id: 'session-1',
    session_date: '2026-08-10',
    session_type: 'training',
    actual_duration_minutes: 63,
    notes: 'Observación',
  },
  metrics: {
    distance_m: 4250,
    hsr_m: 75,
    accelerations: 48,
    decelerations: 43,
    sprints: 2,
    meters_per_minute: 63,
    load_units: 320.5,
  },
});
assert.equal(loadedDraft.sessionDate, '2026-08-10');
assert.equal(loadedDraft.distanceKm, '4,25');
assert.equal(loadedDraft.loadUnits, '320,5');
assert.equal(loadedDraft.notes, 'Observación');

assert.deepEqual(getRpeCoverage(18, 21), {
  responses: 18,
  total: 21,
  percentage: 86,
  hasReliableTotal: true,
  isLowCoverage: false,
});
assert.equal(getRpeCoverage(4, 21).isLowCoverage, true);
assert.deepEqual(getRpeCoverage(22, 21), {
  responses: 22,
  total: null,
  percentage: null,
  hasReliableTotal: false,
  isLowCoverage: false,
});
assert.equal(getRpeCoverage(18, null).hasReliableTotal, false);

const expectedMetricKeys = [
  'loadUnits',
  'distanceKm',
  'hsrM',
  'accelerations',
  'decelerations',
  'sprints',
  'metersPerMinute',
  'actualDurationMinutes',
];
assert.deepEqual(PERFORMANCE_LOAD_METRIC_CONFIG.map((metric) => metric.key), expectedMetricKeys);
assert.deepEqual(PERFORMANCE_LOAD_METRIC_CONFIG.filter((metric) => metric.enabled).map((metric) => metric.key), expectedMetricKeys);
assert.deepEqual(PERFORMANCE_LOAD_METRIC_CONFIG.filter((metric) => !metric.enabled), []);

const metricRecord = {
  session: { actual_duration_minutes: 60 },
  metrics: {
    load_units: 300.5,
    distance_m: 4250,
    hsr_m: 75.5,
    accelerations: 48,
    decelerations: 43,
    sprints: 2,
    meters_per_minute: 63.5,
  },
};
assert.deepEqual(
  PERFORMANCE_LOAD_METRIC_CONFIG.map((metric) => metric.valueFromRecord(metricRecord)),
  [300.5, 4.25, 75.5, 48, 43, 2, 63.5, 60],
  'cada opción debe cambiar a la serie respaldada por su campo real',
);
assert.deepEqual(
  PERFORMANCE_LOAD_METRIC_CONFIG.map((metric) => metric.unit),
  ['U.C.', 'km', 'm', 'acciones', 'acciones', 'sprints', 'm/min', 'min'],
);

const nullMetricRecord = {
  session: { actual_duration_minutes: null },
  metrics: {
    load_units: null,
    distance_m: null,
    hsr_m: null,
    accelerations: null,
    decelerations: null,
    sprints: null,
    meters_per_minute: null,
  },
};
assert.ok(
  PERFORMANCE_LOAD_METRIC_CONFIG.every((metric) => metric.valueFromRecord(nullMetricRecord) === null),
  'un hueco NULL nunca debe convertirse en cero',
);

const zeroMetricRecord = {
  session: { actual_duration_minutes: 0 },
  metrics: {
    load_units: 0,
    distance_m: 0,
    hsr_m: 0,
    accelerations: 0,
    decelerations: 0,
    sprints: 0,
    meters_per_minute: 0,
  },
};
assert.ok(
  PERFORMANCE_LOAD_METRIC_CONFIG.every((metric) => metric.valueFromRecord(zeroMetricRecord) === 0),
  'un cero real debe conservarse como dato',
);

const cumulativePoints = [
  { entryDate: '2026-08-10', hasData: true, value: 100 },
  { entryDate: '2026-08-11', hasData: false, value: null },
  { entryDate: '2026-08-12', hasData: true, value: 0 },
  { entryDate: '2026-08-13', hasData: true, value: 200 },
];
const loadUnitMetric = getPerformanceLoadMetricConfig('loadUnits');
assert.deepEqual(summarizePerformanceMetricPoints(cumulativePoints, loadUnitMetric), {
  aggregate: 300,
  simpleAverage: 100,
  maxPoint: cumulativePoints[3],
  dataCount: 3,
});
assert.equal(aggregatePerformanceMetricPoints(cumulativePoints, loadUnitMetric), 300);
assert.match(getPerformanceMetricKpiLabels(loadUnitMetric, 'week').aggregate, /total semanal/);
assert.match(getPerformanceMetricKpiLabels(loadUnitMetric, 'month').aggregate, /total mensual/);

const metersPerMinuteMetric = getPerformanceLoadMetricConfig('metersPerMinute');
const ratePoints = [
  { entryDate: '2026-08-10', hasData: true, value: 100, weight: 60 },
  { entryDate: '2026-08-11', hasData: false, value: null, weight: null },
  { entryDate: '2026-08-12', hasData: true, value: 50, weight: 30 },
];
const rateSummary = summarizePerformanceMetricPoints(ratePoints, metersPerMinuteMetric);
assert.equal(rateSummary.aggregate, (100 * 60 + 50 * 30) / 90);
assert.equal(rateSummary.simpleAverage, 75);
assert.match(getPerformanceMetricKpiLabels(metersPerMinuteMetric, 'week').aggregate, /Media ponderada semanal/);
assert.match(getPerformanceMetricKpiLabels(metersPerMinuteMetric, 'month').aggregate, /Media ponderada mensual/);
assert.equal(
  aggregatePerformanceMetricPoints([...ratePoints, { hasData: true, value: 80, weight: null }], metersPerMinuteMetric),
  null,
  'M/min no debe improvisar una media ponderada si falta la duración de un día con dato',
);

console.log('performanceLoad: all assertions passed');
