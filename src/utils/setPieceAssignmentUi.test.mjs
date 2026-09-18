import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { getSetPieceBadgePlacement } from './setPieceBadgePlacement.js';
import {
  assignSetPieceResponsibility,
  getAssignableSetPieceResponsibilitiesForPhase,
  getSetPieceResponsibilitiesForPhase,
  inspectSetPieceResponsibilities,
  normalizeSetPieceResponsibilities,
  removeSetPieceResponsibility,
} from './setPieceResponsibilities.js';

const densePositions = [{ x: 50, y: 80 }, { x: 54, y: 86 }, { x: 34, y: 95 }, { x: 42, y: 95 }];
assert.equal(getSetPieceBadgePlacement(0, densePositions), 'above', 'a close player below cannot cover the badge');
assert.equal(getSetPieceBadgePlacement(1, densePositions), 'below');
assert.equal(getSetPieceBadgePlacement(2, densePositions), 'left', 'bottom-edge badge avoids the next player');
assert.equal(getSetPieceBadgePlacement(3, densePositions), 'right');

const vite = await createServer({
  configFile: false,
  esbuild: { jsx: 'automatic' },
  server: { middlewareMode: true },
  appType: 'custom',
});
try {
  const { default: Panel, SetPieceResponsibilityBadge: Badge } = await vite.ssrLoadModule(
    '/src/components/tactical/SetPieceResponsibilityPanel.jsx'
  );
  const player = { id: 'secades-id', name: 'Manuel Secades', shirt_name: 'M. SECADES' };
  const renderPanel = (phase, responsibilityId = '') => renderToStaticMarkup(createElement(Panel, {
    player, phase, responsibilityId, onAssign: () => {}, onRemove: () => {},
  }));
  const defensiveMarkup = renderPanel('defensive', 'def_zona_1');
  const offensiveMarkup = renderPanel('offensive', 'off_rematador_1');
  assert.equal((defensiveMarkup.match(/<button[^>]*aria-label="Asignar /g) || []).length, 9);
  assert.equal((offensiveMarkup.match(/<button[^>]*aria-label="Asignar /g) || []).length, 6);
  for (const option of getSetPieceResponsibilitiesForPhase('defensive')) {
    assert.ok(defensiveMarkup.includes(`aria-label="Asignar ${option.label} a Manuel Secades"`));
  }
  for (const option of getAssignableSetPieceResponsibilitiesForPhase('offensive')) {
    assert.ok(offensiveMarkup.includes(`aria-label="Asignar ${option.label} a Manuel Secades"`));
  }
  assert.doesNotMatch(offensiveMarkup, /aria-label="Asignar Rematador [1-4] /,
    'numbered legacy slots are readable but cannot create new fixed-limit assignments');
  assert.match(offensiveMarkup, /Actual: Rematador 1/, 'a historical numbered assignment can still be inspected and removed');
  assert.doesNotMatch(defensiveMarkup, /Asignar Rematador/);
  assert.doesNotMatch(offensiveMarkup, /Asignar Zona/);
  assert.match(defensiveMarkup, /aria-label="Asignar Zona 1 a Manuel Secades" aria-pressed="true"/);
  assert.match(defensiveMarkup, /aria-label="Quitar responsabilidad ABP a Manuel Secades"/);
  assert.match(defensiveMarkup, /Responsabilidad ABP/);
  assert.match(defensiveMarkup, /data-player-avatar="true"/);
  assert.match(renderToStaticMarkup(createElement(Panel, {
    player, phase: 'defensive', responsibilityId: 'def_zona_1', canAssign: false,
    onAssign: () => {}, onRemove: () => {},
  })), /disabled="" aria-label="Asignar Zona 1 a Manuel Secades"/,
  'a player who no longer occupies the slot cannot create a new assignment');
  assert.match(renderToStaticMarkup(createElement(Badge, {
    responsibilityId: 'def_zona_2', phase: 'defensive',
  })), />Z2<\/span>/, 'normal badge uses the canonical abbreviation');
  assert.match(renderToStaticMarkup(createElement(Badge, {
    responsibilityId: 'off_rematador_4', phase: 'offensive',
  })), />REM4<\/span>/);
  assert.match(renderToStaticMarkup(createElement(Badge, {
    responsibilityId: 'off_rematador_4', phase: 'offensive', placement: 'right',
  })), /left-\[calc\(50%\+22px\)\]/);
  assert.equal(renderToStaticMarkup(createElement(Badge, {
    responsibilityId: 'def_zona_2', phase: 'offensive',
  })), '', 'wrong-phase responsibility is not shown');

  const first = assignSetPieceResponsibility({}, {
    playerId: player.id, positionKey: 'rival:4', responsibilityId: 'def_zona_1', phase: 'defensive',
  }).responsibilities;
  const secondPlay = assignSetPieceResponsibility({}, {
    playerId: player.id, positionKey: 'rival:4', responsibilityId: 'def_zona_3', phase: 'defensive',
  }).responsibilities;
  assert.match(renderPanel('defensive', first[player.id].responsibilityId), /Actual: Zona 1/);
  assert.match(renderPanel('defensive', secondPlay[player.id].responsibilityId), /Actual: Zona 3/);
  assert.equal(first[player.id].responsibilityId, 'def_zona_1', 'another play is independent');
  assert.deepEqual(removeSetPieceResponsibility(first, player.id), {});
  const changedXi = inspectSetPieceResponsibilities(first, 'defensive', { 'rival:4': 'replacement-rival-id' });
  assert.equal(changedXi[0].needsReview, true);
  assert.equal(changedXi[0].playerId, player.id, 'XI change never reassigns the stored responsibility');
  assert.deepEqual(normalizeSetPieceResponsibilities(JSON.parse(JSON.stringify(first))), first);

  const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  const boardSource = appSource.slice(
    appSource.indexOf('const renderFacingSystemsOverview ='),
    appSource.indexOf('const clearSelectedTeamField =')
  );
  assert.match(boardSource, /selectFacingSystemsPlayer\(event, rivalSlot\)/);
  assert.doesNotMatch(boardSource, /selectCaudalSetPiecePlayer|selectedCaudalSetPiecePlayer/,
    'Caudal markers do not open the responsibility editor');
  assert.match(boardSource, /isSetPieceCapture\s*\? captureResponsibilities\?\.visibleByPlayerId\s*: setPieceVisibleResponsibilities/,
    'the normal field and capture select responsibilities from separate readers');
  assert.match(boardSource, /<SetPieceResponsibilityBadge/);
  assert.match(boardSource, /getSetPieceBadgePlacement\(index, renderedRivalPositions, isSetPieceCapture \? captureViewport : null\)/);
  assert.match(boardSource, /tacticalGamePhase === 'set_piece' \? \(\s*<SetPieceResponsibilityPanel/);
  assert.match(appSource, /updateSetPiecePlay\(play\.id, \{ responsibilities: result\.responsibilities \}\)/,
    'assignment uses the existing save coordinator');
  assert.match(appSource, /assignSetPieceResponsibility\(play\.responsibilities/);
  assert.match(appSource, /removeSetPieceResponsibility\(/);
  assert.match(appSource, /RESPONSIBILITY_ALREADY_ASSIGNED/);
  assert.match(appSource, /Responsabilidades ABP pendientes de revisar/);
  assert.match(appSource, /Quitar responsabilidad ABP pendiente de/,
    'a stored assignment can be removed after the original player leaves the XI');
  assert.match(appSource, /responsibilities: normalizeSetPieceResponsibilities\(play\.responsibilities\)/);
  const rivalSource = boardSource.slice(boardSource.indexOf('{(layers.rival ||'), boardSource.indexOf('{(layers.caudal ||'));
  const caudalSource = boardSource.slice(boardSource.indexOf('{(layers.caudal ||'));
  assert.match(rivalSource, /SetPieceResponsibilityBadge/,
    'rival markers receive the ABP badge');
  assert.doesNotMatch(caudalSource, /SetPieceResponsibilityBadge|Responsabilidad ABP/,
    'Caudal markers never receive ABP responsibilities');
} finally {
  await vite.close();
}

console.log('setPieceAssignmentUi tests passed');
