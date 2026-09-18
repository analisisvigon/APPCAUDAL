import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import {
  assignSetPieceResponsibility,
  getSetPieceResponsibility,
  getSetPieceResponsibilityPhase,
  normalizeSetPieceResponsibilities,
  removeSetPieceResponsibility,
} from './setPieceResponsibilities.js';
import { buildSetPieceCaptureResponsibilities } from './setPieceCaptureResponsibilities.js';

const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const boardSource = appSource.slice(appSource.indexOf('const renderFacingSystemsOverview ='),
  appSource.indexOf('const clearSelectedTeamField ='));
const rivalSource = boardSource.slice(boardSource.indexOf('{(layers.rival ||'),
  boardSource.indexOf('{(layers.caudal ||'));
const caudalSource = boardSource.slice(boardSource.indexOf('{(layers.caudal ||'));
assert.match(appSource, /const getCanonicalRivalPlayerId = \(player\) =>\s*\[player\?\.globalPlayerId, player\?\.jugadorRivalId, player\?\.id\]/,
  'Pizarra uses the existing canonical rival identity order');
assert.match(rivalSource, /selectFacingSystemsPlayer\(event, rivalSlot\)/);
assert.match(rivalSource, /<SetPieceResponsibilityBadge/);
assert.doesNotMatch(caudalSource, /SetPieceResponsibilityBadge|selectCaudalSetPiecePlayer|Responsabilidad ABP/,
  'the Caudal marker has no responsibility wiring');
assert.match(boardSource, /tacticalGamePhase === 'set_piece' \? \(\s*<SetPieceResponsibilityPanel/,
  'ABP extends the existing rival context panel');

const secades = {
  id: '11111111-1111-4111-8111-111111111111',
  jugadorRivalId: '11111111-1111-4111-8111-111111111111',
  name: 'Manuel Secades', shirtName: 'M. SECADES', image: 'secades.jpg',
};
const trabanco = {
  id: '22222222-2222-4222-8222-222222222222',
  jugadorRivalId: '22222222-2222-4222-8222-222222222222',
  name: 'Trabanco', shirtName: 'TRABANCO',
};
const extract = (start, end) => appSource.slice(appSource.indexOf(start), appSource.indexOf(end));
const compileAppHandlers = (source, context, names) => new Function('context',
  `with (context) { ${source}\nreturn { ${names.join(', ')} }; }`)(context);
const context = {
  tacticalGamePhase: 'set_piece', tacticalCaptureMode: false,
  facingSystemsPlayerGestureRef: { current: { moved: false } },
  getFacingSystemsPlayerId: (player) => player.jugadorRivalId,
  setSetPieceResponsibilityFeedback: () => {},
  setSelectedFacingSystemsPlayer: (selection) => { context.selectedFacingSystemsPlayer = selection; },
};
const { selectFacingSystemsPlayer } = compileAppHandlers(
  extract('const selectFacingSystemsPlayer =', 'const openFacingSystemsPlayerOnDoubleClick ='),
  context, ['selectFacingSystemsPlayer']
);
selectFacingSystemsPlayer({ stopPropagation() {} }, { slot: 4, player: secades });
assert.deepEqual(context.selectedFacingSystemsPlayer, {
  player: secades, playerId: secades.jugadorRivalId, positionKey: 'rival:4',
}, 'clicking the rival selects its canonical ID and real slot');

const plays = [
  { id: 'play-1', setPieceType: 'offensive_set_piece', setPieceAction: 'corner', ballStartPosition: { x: 20, y: 10 }, responsibilities: {} },
  { id: 'play-2', setPieceType: 'offensive_set_piece', setPieceAction: 'corner', ballStartPosition: { x: 20, y: 10 }, responsibilities: {} },
];
context.players = [];
context.getRivalAvailablePlayers = () => [secades, trabanco];
context.getCanonicalRivalPlayerId = (player) => player.jugadorRivalId;
context.selectedSetPiecePlay = plays[0];
context.setPieceCurrentPlayerIdByPositionKey = { 'rival:4': secades.jugadorRivalId, 'rival:5': trabanco.jugadorRivalId };
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
  extract('const assignSelectedRivalSetPieceResponsibility =', 'const buildOffensiveInitialPlayerPositions ='),
  context, ['assignSelectedRivalSetPieceResponsibility', 'removeSelectedRivalSetPieceResponsibility']
);

const vite = await createServer({ configFile: false, esbuild: { jsx: 'automatic' }, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { default: Panel, SetPieceResponsibilityBadge: Badge } = await vite.ssrLoadModule('/src/components/tactical/SetPieceResponsibilityPanel.jsx');
  const panelProps = () => ({
    player: context.selectedFacingSystemsPlayer.player, phase: 'offensive',
    responsibilityId: context.selectedSetPiecePlay.responsibilities[secades.jugadorRivalId]?.responsibilityId || '',
    canAssign: context.setPieceCurrentPlayerIdByPositionKey[context.selectedFacingSystemsPlayer.positionKey]
      === context.selectedFacingSystemsPlayer.playerId,
    onAssign: assignmentHandlers.assignSelectedRivalSetPieceResponsibility,
    onRemove: assignmentHandlers.removeSelectedRivalSetPieceResponsibility,
  });
  const descendants = (element) => !element || typeof element !== 'object' ? []
    : [element, ...[element.props?.children].flat(Infinity).flatMap(descendants)];
  const clickRole = (label) => {
    const button = descendants(Panel(panelProps())).find((element) => element.type === 'button'
      && element.props['aria-label'] === label);
    assert.ok(button && !button.props.disabled, `${label} is available in the real panel`);
    button.props.onClick();
  };
  const initialPanel = renderToStaticMarkup(createElement(Panel, panelProps()));
  assert.match(initialPanel, /Responsabilidad ABP/);
  assert.match(initialPanel, />M\. SECADES</);
  assert.match(initialPanel, /secades\.jpg/);
  clickRole('Asignar Rematador a Manuel Secades');
  assert.deepEqual(plays[0].responsibilities[secades.jugadorRivalId], {
    responsibilityId: 'off_rematador', positionKey: 'rival:4',
  });
  assert.match(renderToStaticMarkup(createElement(Badge, {
    responsibilityId: 'off_rematador', phase: 'offensive',
  })), />REM<\/span>/, 'the collective finisher badge renders next to the rival');

  for (const responsibilityId of ['def_marca', 'off_bloqueo', 'off_arrastre']) {
    const phase = responsibilityId.startsWith('def_') ? 'defensive' : 'offensive';
    const first = assignSetPieceResponsibility({}, {
      playerId: secades.jugadorRivalId, positionKey: 'rival:4', responsibilityId, phase,
    });
    const second = assignSetPieceResponsibility(first.responsibilities, {
      playerId: trabanco.jugadorRivalId, positionKey: 'rival:5', responsibilityId, phase,
    });
    assert.equal(second.ok, true, `${responsibilityId} remains repeatable between rivals`);
  }

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
  assert.equal(await saveSetPieceWorkspace(), true);
  selectSetPiecePlay('play-2');
  assert.equal(Object.values(context.setPieceWorkspace.activePlayIdByContext)[0], 'play-2');
  assert.equal(plays[1].responsibilities[secades.jugadorRivalId], undefined);
  selectSetPiecePlay('play-1');
  const reloaded = JSON.parse(saved)[0];
  assert.deepEqual(reloaded.responsibilities[secades.jugadorRivalId], {
    responsibilityId: 'off_rematador', positionKey: 'rival:4',
  });
  const capture = buildSetPieceCaptureResponsibilities(
    reloaded.responsibilities, 'offensive', context.setPieceCurrentPlayerIdByPositionKey
  );
  assert.equal(capture.visibleByPlayerId[secades.jugadorRivalId].responsibilityId, 'off_rematador');
  assert.deepEqual(capture.legend.map((item) => item.abbreviation), ['REM']);
  assert.match(renderToStaticMarkup(createElement(Badge, {
    responsibilityId: capture.visibleByPlayerId[secades.jugadorRivalId].responsibilityId,
    phase: 'offensive', capture: true,
  })), /tactical-abp-capture-badge[^>]*>REM<\/span>/);
} finally {
  await vite.close();
}

console.log('setPieceRealWiring tests passed');
