import assert from 'node:assert/strict';
import {
  PLAYER_MONTH_DAILY_POINT_LIMIT,
  PLAYER_PERFORMANCE_METRICS,
  addPlayerDays,
  buildPlayerActivityByDate,
  buildPlayerCurrentState,
  buildPlayerPerformanceTrend,
  buildPlayerMetricSeries,
  getAvailablePlayerMetrics,
  getDefaultPlayerSelectedDate,
  getLatestPlayerUpdateDate,
  getLocalPlayerDateKey,
  getPlayerCalendarGrid,
  getPlayerChartEntries,
  getPlayerMetricValue,
  getPlayerPerformanceFetchRange,
  getPlayerWeekBounds,
  shiftPlayerPerformanceAnchor,
  splitAvailablePlayerSeries,
} from './playerPerformancePresentation.js';

const entries = [
  { id: 'new', entry_date: '2026-08-30', mood: 8 },
  { id: 'missing', entry_date: '2026-08-28', mood: null },
  { id: 'old', entry_date: '2026-08-25', mood: 5 },
];

assert.deepEqual(
  getPlayerChartEntries(entries, 2).map((entry) => entry.id),
  ['missing', 'new'],
  'La vista conserva el orden cronológico sin fabricar días intermedios.',
);
assert.deepEqual(
  buildPlayerMetricSeries(entries, 'mood', 3),
  [
    { id: 'old', date: '2026-08-25', value: 5 },
    { id: 'missing', date: '2026-08-28', value: null },
    { id: 'new', date: '2026-08-30', value: 8 },
  ],
  'Cada punto procede de su respuesta concreta y un valor ausente sigue siendo null.',
);
assert.deepEqual(
  splitAvailablePlayerSeries(buildPlayerMetricSeries(entries, 'mood', 3)).map((segment) => segment.map((point) => point.id)),
  [['old'], ['new']],
  'Un valor ausente corta la línea; no se imputa ni se une como si existiera.',
);
assert.equal(getPlayerMetricValue(0), null);
assert.equal(getPlayerMetricValue(11), null);
assert.equal(getPlayerMetricValue('7'), 7);
assert.equal(getLatestPlayerUpdateDate(entries, [{ entry_date: '2026-08-29' }]), '2026-08-30');

assert.deepEqual(getPlayerWeekBounds('2026-09-03'), {
  startDate: '2026-08-31',
  endDate: '2026-09-06',
});
assert.equal(getPlayerCalendarGrid('2026-09-03').length, 35);
assert.deepEqual(getPlayerPerformanceFetchRange('2026-09-03'), {
  startDate: '2026-08-31',
  endDate: '2026-10-04',
});
assert.equal(shiftPlayerPerformanceAnchor('2026-01-31', 'month', 1), '2026-02-28');
assert.equal(shiftPlayerPerformanceAnchor('2026-09-03', 'week', -1), '2026-08-27');
assert.equal(addPlayerDays('2026-03-29', 1), '2026-03-30', 'Los días deportivos no se desplazan por cambios horarios.');
assert.equal(getLocalPlayerDateKey(new Date(2026, 8, 1, 0, 30)), '2026-09-01');

const ownWellness = [
  { id: 'w-3', entry_date: '2026-09-03', health_ratio: 8.5, sleep_quality: 8, fatigue: 4, mood: 7, weight: 74.2, discomfort: 'Espalda', comment: 'Comentario propio' },
  { id: 'w-1', entry_date: '2026-09-01', health_ratio: 6.5, sleep_quality: 6, fatigue: 5, mood: 5, weight: 74.8 },
];
const ownRpe = [
  { id: 'r-3', entry_date: '2026-09-03', rpe: 7, comment: 'RPE propio' },
  { id: 'r-2', entry_date: '2026-09-02', rpe: 5 },
];
const weekTrend = buildPlayerPerformanceTrend({
  wellness: ownWellness,
  rpe: ownRpe,
  metricKey: 'mood',
  period: 'week',
  anchorDate: '2026-09-03',
});
assert.equal(weekTrend.points.length, 7, 'La semana representa sus siete días reales.');
assert.deepEqual(weekTrend.points.filter((point) => point.value !== null).map((point) => point.value), [5, 7]);
assert.deepEqual(weekTrend.summary, { average: 6, latest: 7, change: 2, count: 2 });
assert.equal(weekTrend.aggregation, 'daily');

const onePointTrend = buildPlayerPerformanceTrend({
  wellness: [ownWellness[0]],
  metricKey: 'weight',
  period: 'week',
  anchorDate: '2026-09-03',
});
assert.equal(onePointTrend.metric.unit, 'kg');
assert.equal(onePointTrend.summary.change, null, 'Una sola respuesta no inventa tendencia ni divide por cero.');
assert.deepEqual(onePointTrend.scale, { min: 73.2, max: 75.2 }, 'El peso conserva su unidad y una escala propia.');
assert.equal(buildPlayerPerformanceTrend({ metricKey: 'rpe', period: 'week', anchorDate: '2026-09-03' }).summary, null);

const denseMonth = Array.from({ length: PLAYER_MONTH_DAILY_POINT_LIMIT + 1 }, (_, index) => ({
  id: `dense-${index}`,
  entry_date: `2026-09-${String(index + 1).padStart(2, '0')}`,
  mood: (index % 10) + 1,
}));
const denseTrend = buildPlayerPerformanceTrend({ wellness: denseMonth, metricKey: 'mood', period: 'month', anchorDate: '2026-09-15' });
assert.equal(denseTrend.aggregation, 'weekly_average', 'Más de 14 valores diarios se agrupan para mantener legibilidad móvil.');
assert.ok(denseTrend.points.length <= 5);
const readableTrend = buildPlayerPerformanceTrend({ wellness: denseMonth.slice(0, PLAYER_MONTH_DAILY_POINT_LIMIT), metricKey: 'mood', period: 'month', anchorDate: '2026-09-15' });
assert.equal(readableTrend.aggregation, 'daily');
assert.equal(readableTrend.points.length, 30);

assert.deepEqual(
  getAvailablePlayerMetrics(ownWellness, ownRpe).map((metric) => metric.key),
  ['health_ratio', 'rpe', 'sleep_quality', 'fatigue', 'mood', 'weight'],
  'El selector solo ofrece métricas presentes en el dataset propio.',
);
assert.equal(PLAYER_PERFORMANCE_METRICS.find((metric) => metric.key === 'health_ratio').scale.min, 0, 'El Wellness general reutiliza su escala validada 0–10.');

const activity = buildPlayerActivityByDate(ownWellness, ownRpe);
assert.equal(activity.get('2026-09-01').wellness.id, 'w-1');
assert.equal(activity.get('2026-09-01').rpe, null);
assert.equal(activity.get('2026-09-02').wellness, null);
assert.equal(activity.get('2026-09-02').rpe.id, 'r-2');
assert.equal(activity.get('2026-09-03').wellness.id, 'w-3');
assert.equal(activity.get('2026-09-03').rpe.id, 'r-3');
assert.equal(activity.get('2026-09-03').hasDiscomfort, true);
assert.equal(getDefaultPlayerSelectedDate(ownWellness, ownRpe, '2026-09-15', '2026-09-03'), '2026-09-03');
assert.equal(getDefaultPlayerSelectedDate(ownWellness, ownRpe, '2026-09-15', '2026-09-30'), '2026-09-03');

const currentBoth = buildPlayerCurrentState(ownWellness, ownRpe, '2026-09-03');
assert.equal(currentBoth.latestWellness.id, 'w-3');
assert.equal(currentBoth.latestRpe.id, 'r-3');
assert.equal(currentBoth.todayWellness.id, 'w-3');
assert.equal(currentBoth.todayRpe.id, 'r-3');
assert.equal(currentBoth.latestDate, '2026-09-03');
assert.equal(currentBoth.hasRecords, true);
const currentOnlyWellness = buildPlayerCurrentState(ownWellness, [], '2026-09-03');
assert.equal(currentOnlyWellness.todayWellness.id, 'w-3');
assert.equal(currentOnlyWellness.todayRpe, null);
const currentOnlyRpe = buildPlayerCurrentState([], ownRpe, '2026-09-03');
assert.equal(currentOnlyRpe.todayWellness, null);
assert.equal(currentOnlyRpe.todayRpe.id, 'r-3');
assert.deepEqual(
  buildPlayerCurrentState([], [], '2026-09-03'),
  { latestWellness: null, latestRpe: null, todayWellness: null, todayRpe: null, latestDate: '', hasRecords: false },
  'El estado vacío no crea respuestas ni valores por defecto.',
);

console.log('playerPerformancePresentation: estado, periodos, métricas, calendario y ausencias validados.');
