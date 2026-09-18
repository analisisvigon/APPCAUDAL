import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  const referenceIndex = one.indexOf('class="set-piece-rival-references"');
  const enclosingAsideStart = one.lastIndexOf('<aside class="set-piece-print-copy"', referenceIndex);
  const enclosingAsideEnd = one.indexOf('</aside>', referenceIndex);
  assert.ok(enclosingAsideStart >= 0 && enclosingAsideStart < referenceIndex && enclosingAsideEnd > referenceIndex,
    'el bloque rival vive dentro de la columna auxiliar de la jugada');
  assert.ok(referenceIndex > one.indexOf('set-piece-print-pitch'),
    'el bloque rival aparece después del campo y del contenido operativo');
  assert.doesNotMatch(one.slice(0, one.indexOf('class="set-piece-pro-plays"')), /set-piece-rival-references/,
    'el bloque rival ya no ocupa una fila de ancho completo sobre las jugadas');

  for (const finisherCount of [2, 3, 4, 5, 6]) {
    const finishers = Array.from({ length: finisherCount }, (_, index) => `${index + 2} Rematador Nombre Largo ${index + 1}`);
    const markup = render([referencePlay(`finishers-${finisherCount}`, `Rival con ${finisherCount} rematadores`, {
      corner_taker: ['10 Lanzador Principal'],
      corner_target: finishers,
      corner_second_ball: ['8 Segundo Balón'],
      corner_stay_back: ['4 Cierre Preventivo'],
    })]);
    finishers.forEach((name) => assert.match(markup, new RegExp(name)));
    assert.equal((markup.match(/class="set-piece-rival-references"/g) || []).length, 1,
      `${finisherCount} rematadores permanecen en un único bloque auxiliar compacto`);
  }

  for (const count of [1, 2, 3]) {
    const plays = Array.from({ length: count }, (_, index) => referencePlay(
      `stable-${index + 1}`,
      `Jugada rival larga número ${index + 1}`,
      {
        corner_taker: [`${index + 7} Lanzador con nombre muy largo ${index + 1}`],
        corner_target: Array.from({ length: 6 }, (_, playerIndex) => `${playerIndex + 2} Rematador Largo ${index + 1}-${playerIndex + 1}`),
        corner_second_ball: [`8 Especialista de rechace largo ${index + 1}`],
        corner_stay_back: [`4 Cierre defensivo largo ${index + 1}`],
      }
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

const printCss = readFileSync(new URL('../styles/print.css', import.meta.url), 'utf8');
assert.doesNotMatch(printCss, /\.set-piece-pro-sheet\[data-has-rival-references="true"\][^{]*\{[\s\S]*?grid-template-rows:/,
  'las referencias no alteran las filas de la hoja ni la geometría del campo');
assert.match(printCss, /\.set-piece-rival-references\s*\{[\s\S]*?border-top:/,
  'el bloque compacto se separa visualmente dentro de la columna auxiliar');
assert.match(printCss, /\.set-piece-rival-reference-plays\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
  'varias jugadas rivales se apilan en la columna auxiliar estrecha');

console.log('setPieceRivalCornerReferencesPrint tests passed');
