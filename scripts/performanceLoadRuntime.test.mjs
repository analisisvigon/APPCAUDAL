import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

import { PERFORMANCE_LOAD_METRIC_CONFIG } from '../src/utils/performanceLoad.js';

const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  configFile: false,
  logLevel: 'silent',
  plugins: [react()],
  optimizeDeps: { disabled: true },
  server: { middlewareMode: true },
  appType: 'custom',
});

const { default: LoadEvolutionSection } = await server.ssrLoadModule('/src/components/performance/LoadEvolutionSection.jsx');

const numericMetrics = {
  id: 'metrics-normal',
  load_units: '320.5',
  distance_m: '4250',
  hsr_m: '75.5',
  accelerations: '43',
  decelerations: '41',
  sprints: '2',
  meters_per_minute: '63.5',
};

const nullMetrics = {
  id: 'metrics-null',
  load_units: null,
  distance_m: null,
  hsr_m: null,
  accelerations: null,
  decelerations: null,
  sprints: null,
  meters_per_minute: null,
};

const zeroMetrics = {
  id: 'metrics-zero',
  load_units: 0,
  distance_m: 0,
  hsr_m: 0,
  accelerations: 0,
  decelerations: 0,
  sprints: 0,
  meters_per_minute: 0,
};

const buildLoad = (date, metrics, duration) => ({
  session: {
    id: `session-${date}`,
    session_date: date,
    session_type: 'training',
    actual_duration_minutes: duration,
  },
  metrics,
});

const normalLoad = buildLoad('2026-09-07', numericMetrics, '63');
const nullLoad = buildLoad('2026-09-07', nullMetrics, null);
const zeroLoad = buildLoad('2026-09-08', zeroMetrics, 0);
const missingLoad = buildLoad('2026-09-10', { id: 'metrics-undefined' }, undefined);
const invalidLoad = buildLoad('2026-09-11', {
  id: 'metrics-invalid',
  load_units: Number.NaN,
  distance_m: Number.POSITIVE_INFINITY,
  hsr_m: 'no-numérico',
  accelerations: Number.NaN,
  decelerations: Number.POSITIVE_INFINITY,
  sprints: 'no-numérico',
  meters_per_minute: Number.NaN,
}, Number.NaN);
const mixedValueLoad = buildLoad('2026-09-09', {
  ...numericMetrics,
  id: 'metrics-mixed-value',
}, 45);

const buildProps = (metricKey, period, loads) => ({
  period,
  setPeriod: () => {},
  metricKey,
  setMetricKey: () => {},
  month: '2026-09',
  setMonth: () => {},
  weekStart: '2026-09-07',
  weekEnd: '2026-09-13',
  weekLoads: loads,
  monthLoads: loads,
  monthLoading: false,
  rpeEntries: [],
  onSelectDate: () => {},
  selectedDate: '',
});

const renderMetric = (metricKey, period, loads) => renderToStaticMarkup(
  React.createElement(LoadEvolutionSection, buildProps(metricKey, period, loads)),
);

const renderPlayerMetric = (metricKey, period, loads, overrides = {}) => renderToStaticMarkup(
  React.createElement(LoadEvolutionSection, {
    ...buildProps(metricKey, period, loads),
    mode: 'player',
    weekDate: '2026-09-09',
    setWeekDate: () => {},
    loading: false,
    errorKind: '',
    onRetry: () => {},
    onSelectDate: undefined,
    ...overrides,
  }),
);

try {
  for (const period of ['week', 'month']) {
    for (const metric of PERFORMANCE_LOAD_METRIC_CONFIG) {
      const html = renderMetric(metric.key, period, [normalLoad]);
      assert.match(html, /<select/);
      assert.ok(html.includes(`value="${metric.key}" selected=""`), `${metric.label} debe quedar seleccionada en ${period}.`);
      assert.ok(html.includes(`${metric.label} del equipo`));
      assert.match(html, /<svg/);
      assert.doesNotMatch(html, /NaN|Infinity|undefined/);
    }
  }

  for (const metric of PERFORMANCE_LOAD_METRIC_CONFIG) {
    for (const loads of [[], [nullLoad], [missingLoad], [invalidLoad]]) {
      const html = renderMetric(metric.key, 'week', loads);
      assert.ok(html.includes(`No hay datos de ${metric.label} para este periodo.`));
      assert.doesNotMatch(html, /<svg|NaN|Infinity|undefined/);
    }

    const zeroHtml = renderMetric(metric.key, 'week', [zeroLoad]);
    assert.match(zeroHtml, /<svg/);
    assert.doesNotMatch(zeroHtml, /NaN|Infinity|undefined/);

    const mixedHtml = renderMetric(metric.key, 'week', [nullLoad, zeroLoad, mixedValueLoad]);
    assert.match(mixedHtml, /<svg/);
    assert.doesNotMatch(mixedHtml, /NaN|Infinity|undefined/);
  }

  for (const duration of [null, 0]) {
    const html = renderMetric('metersPerMinute', 'week', [
      buildLoad(`2026-09-${duration === null ? '10' : '11'}`, { ...numericMetrics, id: `metrics-m-min-${duration}` }, duration),
    ]);
    assert.match(html, /<svg/);
    assert.match(html, /Sin datos/);
    assert.doesNotMatch(html, /NaN|Infinity|undefined/);
  }

  const volumeWithoutDuration = renderMetric('actualDurationMinutes', 'week', [nullLoad]);
  assert.ok(volumeWithoutDuration.includes('No hay datos de Volumen para este periodo.'));

  const playerHtml = renderPlayerMetric('loadUnits', 'week', [normalLoad]);
  assert.ok(playerHtml.includes('EVOLUCIÓN DE CARGA DEL EQUIPO'));
  assert.ok(playerHtml.includes('Consulta cómo evoluciona la carga colectiva de entrenamiento.'));
  assert.equal((playerHtml.match(/<option/g) || []).length, 8);
  assert.doesNotMatch(playerHtml, /próximamente/);
  assert.ok(playerHtml.includes('U.C. total del equipo'));
  assert.ok(playerHtml.includes('Media de U.C. del equipo por día con dato'));
  assert.match(playerHtml, /<svg/);
  assert.doesNotMatch(playerHtml, /RPE medio|Entrenamiento|Sin sesión de carga|Mi carga|Tu carga/);
  assert.ok(playerHtml.includes('U.C.: 320,5 U.C.'));

  const playerMetersHtml = renderPlayerMetric('metersPerMinute', 'week', [normalLoad]);
  assert.ok(playerMetersHtml.includes('M/min medio ponderado del equipo'));
  assert.ok(playerMetersHtml.includes('Media diaria de M/min del equipo'));

  const playerEmptyHtml = renderPlayerMetric('hsrM', 'week', [nullLoad]);
  assert.ok(playerEmptyHtml.includes('No hay datos de HSR del equipo para este periodo.'));
  assert.doesNotMatch(playerEmptyHtml, /<svg/);

  const playerLoadingHtml = renderPlayerMetric('loadUnits', 'week', [normalLoad], { loading: true });
  assert.ok(playerLoadingHtml.includes('Cargando la evolución de carga del equipo'));
  assert.doesNotMatch(playerLoadingHtml, /<svg/);
  const playerErrorHtml = renderPlayerMetric('loadUnits', 'week', [normalLoad], { errorKind: 'network' });
  assert.ok(playerErrorHtml.includes('No se pudo cargar la evolución de carga del equipo.'));
  assert.ok(playerErrorHtml.includes('Reintentar'));
  assert.doesNotMatch(playerErrorHtml, /<svg/);

  console.log('performanceLoadRuntime: STAFF/PLAYER, 8 métricas, periodos, null/cero, estados y tooltip privado validados.');
} finally {
  await server.close();
}
