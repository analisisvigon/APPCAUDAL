import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
assert.match(appSource, /showCornerReferences=\{isRivalOffensiveCornerPlay\(selectedSetPiecePlay\)\}/,
  'los controles solo se habilitan para offensive_set_piece + corner');
assert.match(appSource, /tacticalGamePhase === 'set_piece' && isRivalOffensiveCornerPlay\(selectedSetPiecePlay\)[\s\S]*Incluir referencias rival en IMPRESIÓN/,
  'el toggle aparece junto a las acciones solo en el contexto correcto');
assert.match(appSource, /checked=\{selectedSetPiecePlay\.includeRivalReferencesInPrint === true\}/,
  'el toggle respeta false histórico sin default implícito');

const vite = await createServer({
  configFile: false,
  esbuild: { jsx: 'automatic' },
  server: { middlewareMode: true },
  appType: 'custom',
});

try {
  const { default: Panel } = await vite.ssrLoadModule('/src/components/tactical/SetPieceResponsibilityPanel.jsx');
  const player = { id: '11111111-1111-4111-8111-111111111111', name: 'Pablo' };
  const common = {
    player,
    phase: 'offensive',
    canAssign: true,
    responsibilityId: '',
    onAssign() {},
    onRemove() {},
  };
  const hidden = renderToStaticMarkup(createElement(Panel, common));
  assert.doesNotMatch(hidden, /Referencia en córner|Lanzador para Pablo/, 'otras ABP no muestran controles de referencia');

  const selected = ['corner_taker', 'corner_target'];
  const visible = renderToStaticMarkup(createElement(Panel, {
    ...common,
    showCornerReferences: true,
    cornerReferenceRoleIds: selected,
    onToggleCornerReference() {},
  }));
  assert.match(visible, /Referencia en córner/);
  for (const label of ['Lanzador', 'Rematador', 'Rechace', 'Atrás']) {
    assert.match(visible, new RegExp(`${label} para Pablo`), `${label} está disponible`);
  }
  assert.equal((visible.match(/type="checkbox"/g) || []).length, 4, 'son cuatro controles multi-selección');
  assert.equal((visible.match(/checked=""/g) || []).length, 2, 'varios roles pueden estar activos a la vez');

  const toggled = [];
  const tree = Panel({
    ...common,
    showCornerReferences: true,
    cornerReferenceRoleIds: selected,
    onToggleCornerReference: (roleId) => toggled.push(roleId),
  });
  const descendants = (element) => !element || typeof element !== 'object'
    ? []
    : [element, ...[element.props?.children].flat(Infinity).flatMap(descendants)];
  descendants(tree)
    .filter((element) => element.type === 'input' && element.props.type === 'checkbox')
    .forEach((input) => input.props.onChange());
  assert.deepEqual(toggled, ['corner_taker', 'corner_target', 'corner_second_ball', 'corner_stay_back']);
} finally {
  await vite.close();
}

console.log('setPieceRivalCornerReferencesUi tests passed');
