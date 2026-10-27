import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const days = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29',
  '2026-10-30', '2026-10-31', '2026-11-01'];
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { default: Preview } = await vite.ssrLoadModule('/src/components/calendar/MicrocyclePlanningPreview.jsx');
  const render = (props = {}) => renderToStaticMarkup(React.createElement(Preview, {
    days, selectedDay: days[0], onSelectDay: () => {},
    canWrite: true, ...props,
  }));
  const empty = render();
  assert.match(empty, /Esta semana todavía no tiene planificación registrada/);
  assert.match(empty, /Planificar semana/);
  assert.doesNotMatch(empty, /<textarea|<fieldset|Guardar</);

  const daily = Object.fromEntries(days.map((day) => [day, {
    type: day === days[0] ? 'Entrenamiento' : '', objective: '', focus: '',
    intensity: day === days[0] ? 'Alta' : '', durationMinutes: null, observations: '',
  }]));
  const plan = { revision: 2, weekly: { objective: 'Organización defensiva',
    priorities: ['Táctica'], responsible: 'Entrenador', observations: '' }, days: daily };
  const stored = render({ plan });
  assert.match(stored, /Organización defensiva/);
  assert.match(stored, /Prioridades:<\/strong> Táctica/);
  assert.match(stored, /Entrenador/);
  assert.match(stored, /Alta/);
  assert.match(stored, /Editar planificación/);
  assert.doesNotMatch(stored, /<textarea|<fieldset/);

  const closed = render({ plan, canWrite: false });
  assert.match(closed, /Solo lectura/);
  assert.doesNotMatch(closed, /Editar planificación|Planificar semana/);
  const loading = render({ loading: true, canWrite: false });
  assert.match(loading, /Cargando planificación semanal/);
  assert.doesNotMatch(loading, /Planificar semana/);
  const failed = render({ error: 'Error de conexión', canWrite: false });
  assert.match(failed, /Error de conexión/);
  assert.doesNotMatch(failed, /Planificar semana/);
  console.log('microcycles 2B UI: OK (render estático local; sin Supabase)');
} finally {
  await vite.close();
}
