import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { calendarWeekDays } from '../src/utils/teamCalendar.js';

const vite = await createServer({ configFile: false, plugins: [react()], optimizeDeps: { disabled: true },
  server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { CalendarWeekView } = await vite.ssrLoadModule('/src/components/calendar/TeamCalendarSection.jsx');
  const { default: CopyDialog } = await vite.ssrLoadModule('/src/components/calendar/MicrocycleCopyDialog.jsx');
  const days = calendarWeekDays('2026-10-28');
  const week = renderToStaticMarkup(React.createElement(CalendarWeekView, {
    days, grouped: new Map(), events: [], selectedDay: '', onSelectDay: () => {},
    onOpen: () => {}, today: '2026-10-28', loading: false, error: false,
    copyAvailable: true, onCopyPlan: () => {},
  }));
  assert.match(week, /Copiar planificación/);
  assert.match(week, /Guardar como plantilla/);
  assert.match(week, /Utilizar plantilla/);
  assert.match(week, /Plantillas pendientes de integración en esta interfaz/);
  assert.match(week, /Sin actividad ni planificación registrada esta semana/);
  const dialog = renderToStaticMarkup(React.createElement(CopyDialog, {
    client: {}, contexts: [{ id: 'cts-1', team_name: 'Almadina SC Sub-23', label: '2026/2027',
      status: 'open', starts_on: '2026-07-01', ends_on: '2027-06-30' }],
    initialContextId: 'cts-1', initialMonday: days[0], onClose: () => {},
    onOpenDestination: () => {},
  }));
  assert.match(dialog, /role="dialog" aria-modal="true"/);
  assert.equal((dialog.match(/type="date"/g) || []).length, 2);
  assert.match(dialog, /Incluir observaciones semanales y diarias/);
  assert.match(dialog, /Confirmar copia/);
  assert.match(dialog, /disabled=""/);
  assert.doesNotMatch(dialog, /Copia guardada y verificada/);
  console.log('microcycles 2C UI: OK (render estático local; sin Supabase)');
} finally {
  await vite.close();
}
