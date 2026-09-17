import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const diagram = {
  id: 'caudal-corner-1',
  tipo: 'corner_defensivo',
  titulo: 'Defensa base',
  orden: 1,
  consigna: '',
  elements: [],
};
const roles = (overrides = {}) => [
  { id: 'corner_taker', printLabel: 'Lanzador', players: overrides.corner_taker || [] },
  { id: 'corner_target', printLabel: 'Rematadores', players: overrides.corner_target || [] },
  { id: 'corner_second_ball', printLabel: 'Rechace', players: overrides.corner_second_ball || [] },
  { id: 'corner_stay_back', printLabel: 'Atrás', players: overrides.corner_stay_back || [] },
];
const referencePlay = (id, name, overrides = {}) => ({ id, name, roles: roles(overrides) });

const vite = await createServer({
  configFile: false,
  esbuild: { jsx: 'automatic' },
  server: { middlewareMode: true },
  appType: 'custom',
});

try {
  const { default: SetPieceDiagramPrintSheet } = await vite.ssrLoadModule('/src/components/print/SetPieceDiagramPrintSheet.jsx');
  const render = (rivalCornerReferences) => renderToStaticMarkup(createElement(SetPieceDiagramPrintSheet, {
    match: { opponent: 'Rival', isHome: true, date: '2026-09-17' },
    title: 'Córner defensivo',
    diagrams: [diagram],
    players: [],
    rivalCornerReferences,
  }));

  const withoutReferences = render([]);
  assert.doesNotMatch(withoutReferences, /set-piece-rival-references|Referencias rival/, 'desactivado no crea DOM ni espacio');
  assert.match(withoutReferences, /data-has-rival-references="false"/);
  assert.match(withoutReferences, /set-piece-print-play-body--field-only/, 'field-only actual se conserva sin referencias');

  const one = render([referencePlay('rival-play-1', 'Córner corto', {
    corner_taker: ['10 Pablo'],
    corner_target: ['5 Diego', '9 Marcos'],
    corner_second_ball: ['Luis'],
  })]);
  assert.match(one, /aria-label="Referencias rival"/);
  assert.match(one, /data-source-play-id="rival-play-1"/);
  assert.match(one, /Córner corto/);
  assert.match(one, /10 Pablo/);
  assert.match(one, /5 Diego · 9 Marcos/);
  assert.match(one, />Luis</, 'sin dorsal muestra solo el nombre');
  assert.match(one, /<dt>Atrás<\/dt><dd>—<\/dd>/, 'categoría vacía muestra raya');

  for (const count of [1, 2, 3]) {
    const plays = Array.from({ length: count }, (_, index) => referencePlay(
      `stable-${index + 1}`,
      `Jugada rival ${index + 1}`,
      { corner_taker: [`${index + 7} Jugador ${index + 1}`] }
    ));
    const markup = render(plays);
    assert.equal((markup.match(/data-source-play-id=/g) || []).length, count, `${count} jugada(s) se representan sin fusionarse`);
    assert.match(markup, new RegExp(`data-count="${count}"`));
    plays.forEach((play) => {
      assert.match(markup, new RegExp(play.id));
      assert.match(markup, new RegExp(play.name));
    });
  }
} finally {
  await vite.close();
}

console.log('setPieceRivalCornerReferencesPrint tests passed');
