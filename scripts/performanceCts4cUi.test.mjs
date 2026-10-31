import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const vite = await createServer({ configFile: false, plugins: [react()],
  optimizeDeps: { disabled: true }, server: { middlewareMode: true },
  appType: 'custom', logLevel: 'error' });
try {
  const { default: DailyLoadCard } = await vite.ssrLoadModule('/src/components/performance/DailyLoadCard.jsx');
  const render = (props) => renderToStaticMarkup(React.createElement(DailyLoadCard, {
    date: '2026-10-26', onSave: async () => {}, ...props,
  }));
  const closed = render({ readOnly: true, readOnlyReason: 'Temporada cerrada: solo consulta.',
    showRpeSummary: false });
  assert.match(closed, /Temporada cerrada: solo consulta/);
  assert.doesNotMatch(closed, /Registrar carga|Guardar carga|RPE medio/);
  const legacy = render({ readOnly: true, readOnlyReason: 'Histórico sin CTS: solo consulta.',
    showRpeSummary: true, load: { session: { id: 'old', session_date: '2026-10-26',
      session_type: 'training', actual_duration_minutes: 60, notes: 'Original' },
    metrics: { distance_m: 0, hsr_m: null, load_units: 100 } } });
  assert.match(legacy, /Histórico sin CTS: solo consulta/);
  assert.match(legacy, /Original/);
  assert.doesNotMatch(legacy, />Editar</);
  const open = render({ showRpeSummary: false });
  assert.match(open, /Registrar carga/);
  assert.doesNotMatch(open, /RPE medio/);
  console.log('performance CTS 4C UI: permisos visuales y archivo local OK');
} finally {
  await vite.close();
}
