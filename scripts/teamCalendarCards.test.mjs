import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { EventButton } = await vite.ssrLoadModule('/src/components/calendar/TeamCalendarSection.jsx');
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
  console.log('team calendar cards: OK (renderizado local con fixtures)');
} finally {
  await vite.close();
}
