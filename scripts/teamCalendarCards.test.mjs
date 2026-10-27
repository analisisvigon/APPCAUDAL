import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { calendarWeekDays } from '../src/utils/teamCalendar.js';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { EventButton, CalendarWeekView } = await vite.ssrLoadModule('/src/components/calendar/TeamCalendarSection.jsx');
  const render = (event, variant = 'month') => renderToStaticMarkup(
    React.createElement(EventButton, { event, variant, onOpen: () => {} }));
  const session = { id: 'session-1', kind: 'training', title: 'Sesión nº 1',
    microcycle: 'MD-3', time: '10:00', label: 'Entrenamiento', date: '2026-10-25' };
  for (const variant of ['month', 'list']) {
    const markup = render(session, variant);
    assert.match(markup, /Sesión nº 1/);
    assert.match(markup, />MD-3</);
    assert.match(markup, /10:00 · Entrenamiento/);
    assert.doesNotMatch(markup, /Sesión nº 1 · MD-3/,
      'el MD no se añade a un título truncable');
  }
  assert.doesNotMatch(render({ ...session, microcycle: '' }), />MD-3</);
  assert.match(render({ ...session, time: '' }), /Hora pendiente/);

  const match = { id: 'match-1', kind: 'league', label: 'Liga',
    title: 'Rival con un nombre extraordinariamente largo que necesita espacio',
    opponent: 'Rival con un nombre extraordinariamente largo que necesita espacio',
    date: '2026-10-25', time: '18:00', venue: false, status: 'played',
    score: '1–2', outcome: 'win', crest: '/escudo-real.png' };
  const played = render(match);
  assert.match(played, /1–2/);
  assert.match(played, /VICTORIA/);
  assert.match(played, /Visitante/);
  assert.match(played, /Liga/);
  assert.match(played, /object-contain/);
  assert.match(played, /escudo-real.png/);
  assert.match(played, /title="Rival con un nombre extraordinariamente largo/,
    'el nombre completo queda disponible aunque se trunque visualmente');
  assert.doesNotMatch(played, /truncate[^>]*>1–2/,
    'el marcador no se trunca con el nombre');
  const pending = render({ ...match, score: '', outcome: null, crest: '', time: '', status: 'scheduled' }, 'list');
  assert.match(pending, /Próximo partido/);
  assert.match(pending, /Hora pendiente/);
  assert.match(pending, /<svg/);
  assert.doesNotMatch(pending, /VICTORIA|<img/);
  const calendarSource = readFileSync(new URL('../src/components/calendar/TeamCalendarSection.jsx', import.meta.url), 'utf8');
  assert.match(calendarSource, /onOpenSession\(\{ id: event\.id, contextId: event\.contextId \}\)/,
    'la sesión se abre por sus identificadores originales');
  assert.match(calendarSource, /onOpenMatch\(event\.match\)/,
    'el partido se abre con el registro original');
  assert.match(calendarSource, /view === 'month'[\s\S]*?EventButton event=\{event\}/,
    'la vista mensual utiliza las tarjetas nuevas');
  assert.match(calendarSource, /rows\.map\(\(event\) => <EventButton[^>]*variant="list"/,
    'la vista lista utiliza las tarjetas ampliadas');
  assert.match(calendarSource, /\['week', 'Microciclo'\]/);
  assert.match(calendarSource, /changeView\(key\)/);
  assert.match(calendarSource, /shiftCalendarWeek\(current, step\)/);
  assert.match(calendarSource, /setSelectedWeekDay\(today\)/);
  const days = calendarWeekDays('2026-10-28');
  const weekSession = { ...session, date: '2026-10-26', contextId: 'cts-1',
    durationKnown: true, durationMinutes: 85, objective: 'Organización defensiva' };
  const weekMatch = { ...match, date: '2026-11-01', id: 'match-2' };
  const weekly = (events, selectedDay = '', options = {}) => {
    const grouped = new Map();
    for (const event of events) grouped.set(event.date, [...(grouped.get(event.date) || []), event]);
    return renderToStaticMarkup(React.createElement(CalendarWeekView, {
      days, grouped, events, selectedDay, onSelectDay: () => {}, onOpen: () => {},
      today: '2026-10-28', loading: false, error: false, ...options,
    }));
  };
  const week = weekly([weekSession, weekMatch, { ...weekMatch, id: 'match-3', kind: 'cup', label: 'Copa' }], '2026-10-26');
  assert.equal((week.match(/aria-label="Ver detalle del /g) || []).length, 7);
  assert.match(week, /26 de octubre/);
  assert.match(week, /1 de noviembre/);
  assert.match(week, /1 sesión · 2 partidos · 2 días con actividad/);
  assert.doesNotMatch(week, /<h3[^>]*>[^<]*(?:26 de octubre|1 de noviembre)[^<]*<\/h3>/,
    'el encabezado semanal no duplica el rango que ya muestra la cabecera del calendario');
  assert.match(week, /85 min planificados/);
  assert.match(week, /Organización defensiva/);
  assert.match(week, /Abrir sesión/);
  assert.match(week, /grid-cols-1[^"']*sm:grid-cols-2[^"']*2xl:grid-cols-7/,
    'móvil vertical, tablet adaptativa y siete columnas en pantallas amplias');
  assert.match(weekly([]), /No hay actividades activas esta semana/);
  assert.match(weekly([weekSession, { ...weekSession, id: 'session-2', durationKnown: false, date: '2026-10-27' }]),
    /Duración parcial/);
  assert.match(weekly([{ ...weekSession, durationKnown: false, durationMinutes: null }]),
    /Duración no acreditada · Duración parcial/);
  assert.doesNotMatch(weekly([weekSession], '', { error: true }), /Sesión nº 1/,
    'ante un error no se exhiben eventos anteriores');
  const { default: MicrocyclePlanningPreview, emptyMicrocyclePreview, WEEK_PRIORITIES,
    DAY_TYPES, DAY_FOCUS, DAY_INTENSITIES } = await vite.ssrLoadModule('/src/components/calendar/MicrocyclePlanningPreview.jsx');
  assert.equal(emptyMicrocyclePreview(days).days[days[0]].intensity, '');
  assert.equal(Object.keys(emptyMicrocyclePreview(days).days).length, 7);
  assert.deepEqual(WEEK_PRIORITIES, ['Táctica', 'Técnica', 'Física', 'Estratégica / ABP', 'Recuperación', 'Otros']);
  assert.ok(DAY_TYPES.includes('Descanso') && DAY_TYPES.includes('Recuperación') && DAY_TYPES.includes('Partido'));
  assert.ok(DAY_FOCUS.includes('Mixto') && DAY_INTENSITIES.includes('Muy baja') && DAY_INTENSITIES.includes('Muy alta'));
  const planPreview = renderToStaticMarkup(React.createElement(MicrocyclePlanningPreview, {
    days, selectedDay: days[0], onSelectDay: () => {}, onEditingChange: () => {}, canWrite: true,
  }));
  assert.match(planPreview, /Esta semana todavía no tiene planificación registrada/);
  assert.match(planPreview, /Planificar semana/);
  assert.doesNotMatch(planPreview, /Guardado correctamente|Planificación guardada/);
  const savedPlan = { revision: 2, weekly: { objective: 'Presión tras pérdida',
    priorities: ['Táctica'], responsible: '', observations: '' },
  days: Object.fromEntries(days.map((key) => [key, { type: 'Entrenamiento',
    objective: '', focus: '', intensity: 'Media', durationMinutes: 75, observations: '' }])) };
  const savedPreview = renderToStaticMarkup(React.createElement(MicrocyclePlanningPreview, {
    days, selectedDay: days[0], onSelectDay: () => {}, onEditingChange: () => {},
    plan: savedPlan, canWrite: false,
  }));
  assert.match(savedPreview, /Planificación guardada · revisión 2/);
  assert.match(savedPreview, /Presión tras pérdida/);
  assert.match(savedPreview, /Solo lectura/);
  assert.doesNotMatch(savedPreview, /Editar planificación/);
  const planSource = readFileSync(new URL('../src/components/calendar/MicrocyclePlanningPreview.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(planSource, /Vista previa local|Guardar \(pendiente de backend\)/);
  assert.match(planSource, /disabled=\{!canWrite \|\| saving \|\| !dirty\}/);
  assert.match(planSource, /setDraft\(hydrateMicrocycleDraft\(plan, days\)\)/,
    'Cancelar restaura el último estado guardado');
  assert.doesNotMatch(planSource, /localStorage|\.rpc\(|\.from\(/,
    'la vista previa no persiste datos por una vía no autorizada');
  console.log('team calendar cards: OK (renderizado local con fixtures)');
} finally {
  await vite.close();
}
