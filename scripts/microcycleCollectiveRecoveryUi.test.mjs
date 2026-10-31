import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const vite = await createServer({ configFile: false, plugins: [react()],
  optimizeDeps: { disabled: true }, server: { middlewareMode: true },
  appType: 'custom', logLevel: 'error' });
try {
  const { default: Chart } = await vite.ssrLoadModule('/src/components/calendar/MicrocycleCollectiveRecoveryChart.jsx');
  const days = ['2026-10-26','2026-10-27','2026-10-28','2026-10-29',
    '2026-10-30','2026-10-31','2026-11-01'];
  const rows = days.map((day_date) => ({ day_date, rpe_average: null,
    rpe_responses: null, rpe_state: 'absent', wellness_average: null,
    wellness_responses: null, wellness_state: 'absent' }));
  rows[0] = { ...rows[0], rpe_average: 7.5, rpe_responses: 5,
    rpe_state: 'available', wellness_state: 'below_threshold' };
  rows[1] = { ...rows[1], wellness_average: 0, wellness_responses: 5,
    wellness_state: 'available' };
  const html = renderToStaticMarkup(React.createElement(Chart, { days, rows }));
  assert.match(html, /RPE y Wellness colectivos/);
  assert.match(html, /7,5/);
  assert.match(html, /&lt;5/);
  assert.match(html, /Menos de 5 jugadores/);
  assert.match(html, /0 \/ 10/);
  assert.doesNotMatch(html, /jugador_id|private/);
  const loading = renderToStaticMarkup(React.createElement(Chart, { days, loading: true }));
  assert.match(loading, /Consultando respuestas colectivas/);
  console.log('microcycle collective recovery UI: dos escalas, privacidad y vacío OK');
} finally { await vite.close(); }
