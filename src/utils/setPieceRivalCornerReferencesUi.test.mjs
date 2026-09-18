import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const panelSource = fs.readFileSync(new URL('../components/tactical/SetPieceResponsibilityPanel.jsx', import.meta.url), 'utf8');
assert.match(appSource, /tacticalGamePhase === 'set_piece' && isRivalOffensiveCornerPlay\(selectedSetPiecePlay\)[\s\S]*Incluir referencias rival en IMPRESIÓN/,
  'el único control adicional aparece solo en offensive_set_piece + corner');
assert.match(appSource, /checked=\{selectedSetPiecePlay\.includeRivalReferencesInPrint === true\}/,
  'el toggle respeta false histórico sin default implícito');
assert.doesNotMatch(appSource, /toggleSelectedRivalCornerReference|cornerReferenceRoleIds|onToggleCornerReference/,
  'App ya no mantiene la asignación duplicada de referencias');
assert.doesNotMatch(panelSource, /RIVAL_CORNER_REFERENCE_ROLES|Referencia en córner|type="checkbox"/,
  'el panel conserva solo las responsabilidades ABP originales');

const vite = await createServer({
  configFile: false,
  esbuild: { jsx: 'automatic' },
  server: { middlewareMode: true },
  appType: 'custom',
});

try {
  const { default: Panel } = await vite.ssrLoadModule('/src/components/tactical/SetPieceResponsibilityPanel.jsx');
  const markup = renderToStaticMarkup(createElement(Panel, {
    player: { id: '11111111-1111-4111-8111-111111111111', name: 'Pablo' },
    phase: 'offensive',
    canAssign: true,
    responsibilityId: 'off_rematador_1',
    onAssign() {},
    onRemove() {},
  }));
  assert.match(markup, /Responsabilidad ABP/);
  assert.match(markup, /Actual: Rematador 1/);
  assert.doesNotMatch(markup, /Asignar Lanzador 1 a Pablo/);
  assert.match(markup, /Asignar Lanzador a Pablo/);
  assert.doesNotMatch(markup, /Referencia en córner|type="checkbox"/);
} finally {
  await vite.close();
}

console.log('setPieceRivalCornerReferencesUi tests passed');
