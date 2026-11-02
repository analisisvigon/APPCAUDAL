import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const vite = await createServer({ configFile: false, esbuild: { jsx: 'automatic' },
  server: { middlewareMode: true }, appType: 'custom' });
try {
  const { PlannedSessionBatchPrintPages } = await vite.ssrLoadModule(
    '/src/components/training/PlannedSessionBatchPrint.jsx');
  const slot = (id, phase) => ({ id, phase, duration: '15', items: [{ id: `${id}-task`, kind: 'free',
    title: `Título ${id}`, description: `Desarrollo ${id}` }] });
  const session = (id, number, slots) => ({
    id,
    editor: { session_date: '2026-10-20', session_number: number, header: { material: `Material ${id}` }, slots },
    roster: [], availability: {},
    distribution: { formation_key: null, player_layout: [], space_zones: [] },
    positionById: new Map(), sessionValue: '', fieldDimensions: null, exerciseDimensions: {}, mcNumber: '',
  });
  const markup = renderToStaticMarkup(React.createElement(PlannedSessionBatchPrintPages, {
    sessions: [session('one', 7, [slot('activation', 'activation')]),
      session('two', 8, Array.from({ length: 5 }, (_, index) => slot(`main-${index}`, 'main')))],
    selected: { team_name: 'Equipo', label: '2026/27' }, leagueLogoUrl: '',
  }));
  assert.equal((markup.match(/class="planned-print-pages"/g) || []).length, 2,
    'cada sesión mantiene su propia composición de hojas');
  assert.equal((markup.match(/class="planned-print-sheet /g) || []).length, 4,
    'la continuación de la segunda sesión no se descarta');
  for (const label of ['Título activation', 'Título main-0', 'Título main-4',
    'Material one', 'Material two', 'Nº sesión']) assert.ok(markup.includes(label), label);
  assert.ok(markup.includes('>7</b>') && markup.includes('>8</b>'),
    'se conserva la numeración original de cada sesión');
  assert.doesNotMatch(markup, /<button|<input|<textarea/, 'las hojas no contienen controles de edición');
  const css = readFileSync('src/components/training/plannedSessionPrint.css', 'utf8');
  assert.match(css, /\.planned-print-batch-portal \.planned-print-pages:not\(:last-child\) > \.planned-print-sheet:last-child \{ break-after: page;/,
    'una sesión nueva empieza en otra página');
  assert.match(css, /\.planned-print-portal:not\(\.planned-print-batch-portal\) \{ display: none !important;/,
    'la impresión individual abierta no aparece duplicada en el lote');
  console.log('planned session batch print tests passed');
} finally {
  await vite.close();
}
