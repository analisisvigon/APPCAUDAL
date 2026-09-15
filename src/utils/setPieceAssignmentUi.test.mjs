import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import {
  advanceSetPieceCaudalGesture,
  startSetPieceCaudalGesture,
  wasSetPieceCaudalDrag,
} from './setPieceCaudalGesture.js';
import { getSetPieceBadgePlacement } from './setPieceBadgePlacement.js';
import {
  assignSetPieceResponsibility,
  getSetPieceResponsibilitiesForPhase,
  inspectSetPieceResponsibilities,
  normalizeSetPieceResponsibilities,
  removeSetPieceResponsibility,
} from './setPieceResponsibilities.js';

const tap = startSetPieceCaudalGesture(1, 'caudal:4', 100, 100);
const shortMove = advanceSetPieceCaudalGesture(tap, 1, 102, 103);
assert.equal(shortMove.startedDrag, false);
assert.equal(wasSetPieceCaudalDrag(shortMove.gesture), false, 'a short pointer gesture selects');
const drag = advanceSetPieceCaudalGesture(shortMove.gesture, 1, 108, 105);
assert.equal(drag.startedDrag, true);
assert.equal(wasSetPieceCaudalDrag(drag.gesture), true, 'moving beyond the threshold starts drag');
assert.equal(advanceSetPieceCaudalGesture(drag.gesture, 1, 110, 105).startedDrag, false,
  'drag starts only once');
assert.equal(advanceSetPieceCaudalGesture(tap, 2, 130, 130).startedDrag, false,
  'another pointer cannot move the selected player');
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
  const player = { id: 'borja-id', name: 'Borja Rodríguez', shirt_name: 'BORJA' };
  const renderPanel = (phase, responsibilityId = '') => renderToStaticMarkup(createElement(Panel, {
    player, phase, responsibilityId, onAssign: () => {}, onRemove: () => {},
  }));
  const defensiveMarkup = renderPanel('defensive', 'def_zona_1');
  const offensiveMarkup = renderPanel('offensive', 'off_rematador_1');
  assert.equal((defensiveMarkup.match(/<button[^>]*aria-label="Asignar /g) || []).length, 9);
  assert.equal((offensiveMarkup.match(/<button[^>]*aria-label="Asignar /g) || []).length, 11);
  for (const option of getSetPieceResponsibilitiesForPhase('defensive')) {
    assert.ok(defensiveMarkup.includes(`aria-label="Asignar ${option.label} a Borja Rodríguez"`));
  }
  for (const option of getSetPieceResponsibilitiesForPhase('offensive')) {
    assert.ok(offensiveMarkup.includes(`aria-label="Asignar ${option.label} a Borja Rodríguez"`));
  }
  assert.doesNotMatch(defensiveMarkup, /Asignar Rematador/);
  assert.doesNotMatch(offensiveMarkup, /Asignar Zona/);
  assert.match(defensiveMarkup, /aria-label="Asignar Zona 1 a Borja Rodríguez" aria-pressed="true"/);
  assert.match(defensiveMarkup, /aria-label="Quitar responsabilidad ABP a Borja Rodríguez"/);
  assert.match(defensiveMarkup, /Responsabilidad ABP/);
  assert.match(defensiveMarkup, /data-player-avatar="true"/);
  assert.match(renderToStaticMarkup(createElement(Panel, {
    player, phase: 'defensive', responsibilityId: 'def_zona_1', canAssign: false,
    onAssign: () => {}, onRemove: () => {},
  })), /disabled="" aria-label="Asignar Zona 1 a Borja Rodríguez"/,
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
    playerId: player.id, positionKey: 'caudal:4', responsibilityId: 'def_zona_1', phase: 'defensive',
  }).responsibilities;
  const secondPlay = assignSetPieceResponsibility({}, {
    playerId: player.id, positionKey: 'caudal:4', responsibilityId: 'def_zona_3', phase: 'defensive',
  }).responsibilities;
  assert.match(renderPanel('defensive', first[player.id].responsibilityId), /Actual: Zona 1/);
  assert.match(renderPanel('defensive', secondPlay[player.id].responsibilityId), /Actual: Zona 3/);
  assert.equal(first[player.id].responsibilityId, 'def_zona_1', 'another play is independent');
  assert.deepEqual(removeSetPieceResponsibility(first, player.id), {});
  const changedXi = inspectSetPieceResponsibilities(first, 'defensive', { 'caudal:4': 'julio-id' });
  assert.equal(changedXi[0].needsReview, true);
  assert.equal(changedXi[0].playerId, player.id, 'XI change never reassigns the stored responsibility');
  assert.deepEqual(normalizeSetPieceResponsibilities(JSON.parse(JSON.stringify(first))), first);

  const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  const boardSource = appSource.slice(
    appSource.indexOf('const renderFacingSystemsOverview ='),
    appSource.indexOf('const clearSelectedTeamField =')
  );
  assert.match(boardSource, /beginCaudalSetPiecePlayerPointer/);
  assert.match(boardSource, /moveCaudalSetPiecePlayerPointer/);
  assert.match(boardSource, /finishCaudalSetPiecePlayerPointer/);
  assert.match(boardSource, /selectCaudalSetPiecePlayer/);
  assert.match(appSource, /caudalSetPieceSuppressClickRef\.current = wasSetPieceCaudalDrag/);
  assert.match(boardSource, /!tacticalCaptureMode && tacticalGamePhase === 'set_piece' && responsibilityId/,
    'badges are normal-field-only');
  assert.match(boardSource, /<SetPieceResponsibilityBadge/);
  assert.match(boardSource, /getSetPieceBadgePlacement\(index, renderedCaudalPositions\)/);
  assert.match(boardSource, /tacticalGamePhase === 'set_piece' && selectedCaudalPanelPlayer/);
  assert.match(appSource, /updateSetPiecePlay\(play\.id, \{ responsibilities: result\.responsibilities \}\)/,
    'assignment uses the existing save coordinator');
  assert.match(appSource, /assignSetPieceResponsibility\(play\.responsibilities/);
  assert.match(appSource, /removeSetPieceResponsibility\(/);
  assert.match(appSource, /RESPONSIBILITY_ALREADY_ASSIGNED/);
  assert.match(appSource, /Responsabilidades ABP pendientes de revisar/);
  assert.match(appSource, /Quitar responsabilidad ABP pendiente de/,
    'a stored assignment can be removed after the original player leaves the XI');
  assert.match(appSource, /responsibilities: normalizeSetPieceResponsibilities\(play\.responsibilities\)/);
  const rivalSource = boardSource.slice(boardSource.indexOf('{layers.rival ? rivalSlots.map'), boardSource.indexOf('{layers.caudal ? caudalCoordinates.map'));
  assert.doesNotMatch(rivalSource, /SetPieceResponsibilityBadge|assignSetPieceResponsibility|Responsabilidad ABP/,
    'rival markers do not receive Caudal responsibilities');
} finally {
  await vite.close();
}

console.log('setPieceAssignmentUi tests passed');
