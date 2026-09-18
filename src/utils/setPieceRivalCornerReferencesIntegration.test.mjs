import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const ids = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
];
const rivalPlayers = ids.map((id, index) => ({
  globalPlayerId: id,
  number: index + 1,
  name: `Jugador ${String.fromCharCode(65 + index)}`,
}));
const responsibilityIds = [
  'off_lanzador_1',
  'off_rematador_1',
  'off_rematador_2',
  'off_rematador_3',
  'off_rematador_4',
  'off_se_queda',
];
const responsibilities = Object.fromEntries(ids.map((id, index) => [id, {
  responsibilityId: responsibilityIds[index],
  positionKey: `rival:${index}`,
}]));
const createMatch = (includeRivalReferencesInPrint) => ({
  id: '8ce7ceb8-60e-4f55-9bc1-a24b4da2461e',
  opponent: 'CD Covadonga',
  isHome: false,
  date: '2026-09-20',
  preAiAnalysis: {
    setPiecePhaseV1: {
      plays: [{
        id: '58031594-7427-42c2-b62d-d833312397e1',
        name: 'Córner Covadonga',
        setPieceType: 'offensive_set_piece',
        setPieceAction: 'corner',
        includeRivalReferencesInPrint,
        responsibilities,
        rivalCornerReferences: {},
      }],
    },
  },
});
const diagram = {
  id: 'caudal-corner-defensivo',
  tipo: 'corner_defensivo',
  titulo: 'Defensa de córner',
  orden: 1,
  consigna: '',
  elements: [],
};

const vite = await createServer({
  configFile: false,
  esbuild: { jsx: 'automatic' },
  server: { middlewareMode: true },
  appType: 'custom',
});

try {
  const { MatchPrintSetPieceSheet } = await vite.ssrLoadModule('/src/components/print/MatchPrintTab.jsx');
  const render = (includeRivalReferencesInPrint) => renderToStaticMarkup(createElement(MatchPrintSetPieceSheet, {
    match: createMatch(includeRivalReferencesInPrint),
    title: 'Córner defensivo',
    diagrams: [diagram],
    players: [],
    rivalPlayers,
    totalPlayCount: 1,
    startOrder: 1,
    includeRivalCornerReferences: true,
  }));

  const enabled = render(true);
  assert.match(enabled, /aria-label="Referencias rival"/, 'el puente MatchPrintTab crea el bloque');
  assert.match(enabled, /data-source-play-id="58031594-7427-42c2-b62d-d833312397e1"/);
  assert.match(enabled, /Córner Covadonga/);
  assert.match(enabled, /<dt>Lanzador<\/dt><dd>1 Jugador A<\/dd>/);
  assert.match(enabled, /<dt>Rematadores<\/dt><dd>2 Jugador B · 3 Jugador C · 4 Jugador D · 5 Jugador E<\/dd>/);
  assert.match(enabled, /<dt>Rechace<\/dt><dd>—<\/dd>/);
  assert.match(enabled, /<dt>Atrás<\/dt><dd>6 Jugador F<\/dd>/);
  assert.match(enabled, /data-has-rival-references="true"/);

  const disabled = render(false);
  assert.doesNotMatch(disabled, /Referencias rival|set-piece-rival-references|data-source-play-id/,
    'toggle false no crea wrapper, título, margen ni contenido');
  assert.match(disabled, /data-has-rival-references="false"/);
} finally {
  await vite.close();
}

console.log('setPieceRivalCornerReferencesIntegration tests passed');
