import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { resolveSetPieceCaudalPlayersBySlot } from './setPieceCaudalLineupIdentity.js';
import { advanceSetPieceCaudalGesture, startSetPieceCaudalGesture, wasSetPieceCaudalDrag } from './setPieceCaudalGesture.js';
import { assignSetPieceResponsibility, getSetPieceResponsibility, getSetPieceResponsibilityPhase, normalizeSetPieceResponsibilities, removeSetPieceResponsibility } from './setPieceResponsibilities.js';
import { buildSetPieceCaptureResponsibilities } from './setPieceCaptureResponsibilities.js';

const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const loadPre = appSource.slice(appSource.indexOf('const loadMatchPreData ='), appSource.indexOf('const loadMatchPostData ='));
assert.match(loadPre, /jugadorId: slot\.jugador_id \|\| null/);
assert.match(loadPre, /lineupSlots: \{ \.\.\.match\.lineupSlots, \.\.\.detailedMatch\.lineupSlots \}/);
const boardSource = appSource.slice(appSource.indexOf('const renderFacingSystemsOverview ='), appSource.indexOf('const clearSelectedTeamField ='));
assert.match(boardSource, /renderFacingSystemsOverview/);
assert.match(appSource, /\{renderFacingSystemsOverview\(true\)\}/,
  'the active professional Pizarra renders this board rather than a legacy field');
assert.match(boardSource, /onPointerUp=\{\(event\) => finishCaudalSetPiecePlayerPointer\(event, caudalPlayer, `caudal:\$\{index\}`\)\}/);
assert.match(boardSource, /tacticalGamePhase === 'set_piece' && selectedCaudalPanelPlayer/);
assert.match(boardSource, /<SetPieceResponsibilityPanel/);
assert.match(boardSource, /<SetPieceResponsibilityBadge/);

const borja = { id: '11111111-1111-4111-8111-111111111111', name: 'Borja Rodríguez', shirtName: 'BORJA', image: 'portrait.jpg' };
const julio = { id: '22222222-2222-4222-8222-222222222222', name: 'Julio Martínez', shirtName: 'JULIO' };
const roster = [borja, julio];
const lineup = Array.from({ length: 11 }, () => '');
lineup[4] = 'BORJA (nombre antiguo)';
lineup[5] = 'Julio Martínez';
const lineupSlots = [
  { slot: 4, playerName: lineup[4], jugadorId: borja.id },
  { slot: 5, playerName: lineup[5], jugadorId: julio.id },
];
const resolved = resolveSetPieceCaudalPlayersBySlot(lineup, lineupSlots, roster);
assert.equal(resolved[4], borja, 'canonical jugador_id connects a displayed snapshot to the real roster player');
assert.equal(resolved[5], julio);
assert.equal(resolveSetPieceCaudalPlayersBySlot(['BORJA'], [], roster)[0], borja,
  'legacy name lookup works only when it uniquely identifies a real player');
assert.equal(resolveSetPieceCaudalPlayersBySlot(['BORJA'], [], [borja, { id: '33333333-3333-4333-8333-333333333333', name: 'Borja' }])[0], null,
  'ambiguous legacy names cannot invent an identity');
assert.equal(resolveSetPieceCaudalPlayersBySlot(['BORJA'], [{ slot: 0, jugadorId: 'missing-id' }], roster)[0], null,
  'a missing canonical ID cannot silently turn into another player by name');
assert.equal(resolveSetPieceCaudalPlayersBySlot(['JULIO'], [{ slot: 0, playerName: 'BORJA', jugadorId: borja.id }], roster)[0], julio,
  'an optimistic lineup change cannot reuse a stale slot ID');

const extract = (start, end) => appSource.slice(appSource.indexOf(start), appSource.indexOf(end));
const compileAppHandlers = (source, context, names) => new Function('context',
  `with (context) { ${source}\nreturn { ${names.join(', ')} }; }`)(context);
const gestureRef = { current: null };
const suppressRef = { current: false };
const context = {
  tacticalGamePhase: 'set_piece',
  tacticalCaptureMode: false,
  defensiveTool: 'select',
  caudalSetPieceGestureRef: gestureRef,
  caudalSetPieceSuppressClickRef: suppressRef,
  startSetPieceCaudalGesture,
  advanceSetPieceCaudalGesture,
  wasSetPieceCaudalDrag,
  setSelectedFacingSystemsPlayer: () => {},
  setSetPieceResponsibilityFeedback: () => {},
  setSelectedCaudalSetPiecePlayer: (selection) => { context.selectedCaudalSetPiecePlayer = selection; },
};
const gestureHandlers = compileAppHandlers(
  extract('const beginCaudalSetPiecePlayerPointer =', 'const saveAndOpenFacingSystemsPlayer ='),
  context,
  ['beginCaudalSetPiecePlayerPointer', 'moveCaudalSetPiecePlayerPointer', 'finishCaudalSetPiecePlayerPointer', 'selectCaudalSetPiecePlayer']
);
const pointer = (pointerId, x, y) => ({
  pointerId, clientX: x, clientY: y,
  stopPropagation() {},
  currentTarget: { setPointerCapture() {}, closest() { return {}; } },
});
gestureHandlers.beginCaudalSetPiecePlayerPointer(pointer(1, 100, 100), resolved[4], 'caudal:4', false);
gestureHandlers.moveCaudalSetPiecePlayerPointer(pointer(1, 103, 102), false);
gestureHandlers.finishCaudalSetPiecePlayerPointer(pointer(1, 103, 102), resolved[4], 'caudal:4');
assert.deepEqual(context.selectedCaudalSetPiecePlayer, { playerId: borja.id, positionKey: 'caudal:4' },
  'actual App pointer-up handler selects the canonical Caudal player after a short gesture');
gestureHandlers.selectCaudalSetPiecePlayer(pointer(1, 103, 102), resolved[4], 'caudal:4');
assert.equal(suppressRef.current, false, 'the synthetic click after pointer up is consumed');
gestureHandlers.beginCaudalSetPiecePlayerPointer(pointer(2, 100, 100), resolved[5], 'caudal:5', false);
gestureHandlers.moveCaudalSetPiecePlayerPointer(pointer(2, 108, 100), false);
gestureHandlers.finishCaudalSetPiecePlayerPointer(pointer(2, 108, 100), resolved[5], 'caudal:5');
gestureHandlers.selectCaudalSetPiecePlayer(pointer(2, 108, 100), resolved[5], 'caudal:5');
assert.equal(context.selectedCaudalSetPiecePlayer.playerId, borja.id, 'drag and its click do not select Julio');
gestureHandlers.beginCaudalSetPiecePlayerPointer(pointer(3, 100, 100), resolved[5], 'caudal:5', false);
gestureHandlers.finishCaudalSetPiecePlayerPointer(pointer(3, 100, 100), resolved[5], 'caudal:5', true);
assert.equal(context.selectedCaudalSetPiecePlayer.playerId, borja.id, 'pointer cancel does not select');
context.defensiveTool = 'move';
context.beginDefensivePlayerDrag = () => ({ id: 'moving-play' });
context.getDefensivePointerPosition = () => ({ x: 60, y: 40 });
let movedPosition = null;
context.updateTacticalPlay = (id, update) => { movedPosition = update({ playerPositions: {} }).playerPositions['caudal:5']; };
gestureHandlers.beginCaudalSetPiecePlayerPointer(pointer(4, 100, 100), resolved[5], 'caudal:5', true);
gestureHandlers.moveCaudalSetPiecePlayerPointer(pointer(4, 108, 100), true);
gestureHandlers.finishCaudalSetPiecePlayerPointer(pointer(4, 108, 100), resolved[5], 'caudal:5');
assert.deepEqual(movedPosition, { x: 60, y: 40 }, 'Mover still updates the player position after crossing 6px');
assert.equal(context.selectedCaudalSetPiecePlayer.playerId, borja.id);
gestureHandlers.beginCaudalSetPiecePlayerPointer(pointer(5, 100, 100), resolved[5], 'caudal:5', true);
gestureHandlers.moveCaudalSetPiecePlayerPointer(pointer(5, 103, 102), true);
gestureHandlers.finishCaudalSetPiecePlayerPointer(pointer(5, 103, 102), resolved[5], 'caudal:5');
assert.equal(context.selectedCaudalSetPiecePlayer.playerId, julio.id, 'a short tap also selects in Mover mode');
context.defensiveTool = 'select';
gestureHandlers.beginCaudalSetPiecePlayerPointer(pointer(6, 100, 100), resolved[4], 'caudal:4', true);
gestureHandlers.finishCaudalSetPiecePlayerPointer(pointer(6, 100, 100), resolved[4], 'caudal:4');
assert.equal(context.selectedCaudalSetPiecePlayer.playerId, borja.id);

const plays = [
  { id: 'play-1', setPieceType: 'offensive_set_piece', setPieceAction: 'corner', ballStartPosition: { x: 20, y: 10 }, responsibilities: {} },
  { id: 'play-2', setPieceType: 'offensive_set_piece', setPieceAction: 'corner', ballStartPosition: { x: 20, y: 10 }, responsibilities: {} },
];
context.players = roster;
context.selectedSetPiecePlay = plays[0];
context.selectedCaudalSetPiecePlayer = { playerId: borja.id, positionKey: 'caudal:4' };
context.setPieceCurrentPlayerIdByPositionKey = { 'caudal:4': borja.id, 'caudal:5': julio.id };
context.createSetPiecePlay = () => null;
context.assignSetPieceResponsibility = assignSetPieceResponsibility;
context.getSetPieceResponsibilityPhase = getSetPieceResponsibilityPhase;
context.getSetPieceResponsibility = getSetPieceResponsibility;
context.removeSetPieceResponsibility = removeSetPieceResponsibility;
context.displayPlayerName = (player) => player.shirtName || player.name;
context.updateSetPiecePlay = (id, update) => {
  const play = plays.find((item) => item.id === id);
  Object.assign(play, typeof update === 'function' ? update(play) : update);
};
const assignmentHandlers = compileAppHandlers(
  extract('const assignSelectedCaudalSetPieceResponsibility =', 'const buildOffensiveInitialPlayerPositions ='),
  context,
  ['assignSelectedCaudalSetPieceResponsibility', 'removeSelectedCaudalSetPieceResponsibility']
);

const vite = await createServer({ configFile: false, esbuild: { jsx: 'automatic' }, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { default: Panel, SetPieceResponsibilityBadge: Badge } = await vite.ssrLoadModule('/src/components/tactical/SetPieceResponsibilityPanel.jsx');
  const selectedPlayer = () => roster.find((player) => String(player.id) === context.selectedCaudalSetPiecePlayer?.playerId);
  const panelProps = () => ({
    player: selectedPlayer(), phase: 'offensive',
    responsibilityId: context.selectedSetPiecePlay.responsibilities[borja.id]?.responsibilityId || '',
    canAssign: context.setPieceCurrentPlayerIdByPositionKey[context.selectedCaudalSetPiecePlayer.positionKey] === context.selectedCaudalSetPiecePlayer.playerId,
    onAssign: assignmentHandlers.assignSelectedCaudalSetPieceResponsibility,
    onRemove: assignmentHandlers.removeSelectedCaudalSetPieceResponsibility,
  });
  const buttons = (element) => {
    if (!element || typeof element !== 'object') return [];
    return [element, ...[element.props?.children].flat(Infinity).flatMap(buttons)];
  };
  const clickResponsibility = (label) => {
    const button = buttons(Panel(panelProps())).find((element) => element.type === 'button' && element.props['aria-label'] === label);
    assert.ok(button && !button.props.disabled, `real panel exposes ${label}`);
    button.props.onClick();
  };
  const initialPanel = renderToStaticMarkup(createElement(Panel, panelProps()));
  assert.match(initialPanel, /Responsabilidad ABP/);
  assert.match(initialPanel, />BORJA</);
  assert.match(initialPanel, /portrait\.jpg/, 'the selected player has the real roster photo');
  clickResponsibility('Asignar Rematador 1 a Borja Rodríguez');
  assert.deepEqual(plays[0].responsibilities[borja.id], { responsibilityId: 'off_rematador_1', positionKey: 'caudal:4' });
  assert.match(renderToStaticMarkup(createElement(Badge, { responsibilityId: plays[0].responsibilities[borja.id].responsibilityId, phase: 'offensive' })), />REM1<\/span>/);
  clickResponsibility('Asignar Rematador 2 a Borja Rodríguez');
  assert.deepEqual(plays[0].responsibilities[borja.id], { responsibilityId: 'off_rematador_2', positionKey: 'caudal:4' });
  clickResponsibility('Asignar Rematador 1 a Borja Rodríguez');

  context.setPieceType = 'offensive_set_piece';
  context.setPieceAction = 'corner';
  context.setPieceBallStartPosition = { x: 20, y: 10 };
  context.setPieceWorkspace = { plays, activePlayIdByContext: {}, activeBallPositionByContext: {} };
  context.getBallPositionKey = (position) => JSON.stringify(position);
  context.normalizeBallStartPosition = (position, fallback) => position || fallback;
  context.getSetPieceActionContextKey = (type, action) => `${type}:${action}`;
  context.getSetPieceContextKey = (type, action, position) => `${type}:${action}:${JSON.stringify(position)}`;
  context.markSetPieceUnsaved = () => {};
  context.setSetPieceBallStartPosition = (position) => { context.setPieceBallStartPosition = position; };
  context.setSetPieceWorkspace = (update) => { context.setPieceWorkspace = update(context.setPieceWorkspace); };
  const { selectSetPiecePlay } = compileAppHandlers(
    extract('const selectSetPiecePlay =', 'const createSetPiecePlay ='), context, ['selectSetPiecePlay']
  );
  let saved = null;
  context.selectedMatch = { id: 'match-id' };
  context.setPieceAutosaveTimerRef = { current: null };
  context.setPieceSaveCoordinatorRef = { current: { flush: async () => {
    saved = JSON.stringify(context.setPieceWorkspace.plays.map((play) => ({
      ...play, responsibilities: normalizeSetPieceResponsibilities(play.responsibilities),
    })));
    return { ok: true };
  } } };
  const { saveSetPieceWorkspace } = compileAppHandlers(
    extract('const saveSetPieceWorkspace =', 'const saveActiveTacticalWorkspace ='), context, ['saveSetPieceWorkspace']
  );
  assert.equal(await saveSetPieceWorkspace(), true, 'the actual Guardar handler flushes the ABP workspace');
  selectSetPiecePlay('play-2');
  context.selectedSetPiecePlay = plays.find((play) => play.id === Object.values(context.setPieceWorkspace.activePlayIdByContext)[0]);
  assert.equal(context.selectedSetPiecePlay.id, 'play-2');
  assert.equal(context.selectedSetPiecePlay.responsibilities[borja.id], undefined);
  selectSetPiecePlay('play-1');
  context.selectedSetPiecePlay = plays.find((play) => play.id === Object.values(context.setPieceWorkspace.activePlayIdByContext)[0]);
  assert.equal(context.selectedSetPiecePlay.responsibilities[borja.id].responsibilityId, 'off_rematador_1');
  const reloaded = JSON.parse(saved);
  context.selectedSetPiecePlay = reloaded[0];
  assert.equal(context.selectedSetPiecePlay.responsibilities[borja.id].responsibilityId, 'off_rematador_1');
  const capture = buildSetPieceCaptureResponsibilities(
    context.selectedSetPiecePlay.responsibilities, 'offensive', context.setPieceCurrentPlayerIdByPositionKey
  );
  assert.equal(capture.visibleByPlayerId[borja.id].responsibilityId, 'off_rematador_1');
  assert.deepEqual(capture.legend.map((item) => item.abbreviation), ['REM1']);
  assert.match(renderToStaticMarkup(createElement(Badge, {
    responsibilityId: capture.visibleByPlayerId[borja.id].responsibilityId, phase: 'offensive', capture: true,
  })), /tactical-abp-capture-badge[^>]*>REM1<\/span>/);
} finally {
  await vite.close();
}

console.log('setPieceRealWiring tests passed');
