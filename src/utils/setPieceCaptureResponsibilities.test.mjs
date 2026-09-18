import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { getSetPieceBadgePlacement, getSetPieceCaptureMarkerAnchor } from './setPieceBadgePlacement.js';
import { buildSetPieceCaptureResponsibilities } from './setPieceCaptureResponsibilities.js';
import {
  getSetPieceResponsibilitiesForPhase,
  normalizeSetPieceResponsibilities,
} from './setPieceResponsibilities.js';

const assign = (ids) => Object.fromEntries(ids.map((responsibilityId, index) => [
  `player-${index}`, { responsibilityId, positionKey: `rival:${index}` },
]));
const currentXi = (count) => Object.fromEntries(Array.from({ length: count }, (_, index) => [
  `rival:${index}`, `player-${index}`,
]));
const defensiveIds = getSetPieceResponsibilitiesForPhase('defensive').map(({ id }) => id);
const offensiveIds = getSetPieceResponsibilitiesForPhase('offensive').map(({ id }) => id);
const defensive = buildSetPieceCaptureResponsibilities(
  assign([...defensiveIds, 'def_marca', 'def_marca']), 'defensive', currentXi(11)
);
assert.deepEqual(defensive.legend.map(({ id }) => id), defensiveIds,
  'a complete defensive legend follows canonical order and deduplicates Marca');
assert.equal(Object.keys(defensive.visibleByPlayerId).length, 11);
const legacyOffensiveIds = offensiveIds.filter((id) => !['off_lanzador', 'off_rechace', 'off_rematador'].includes(id));
const offensive = buildSetPieceCaptureResponsibilities(assign(legacyOffensiveIds), 'offensive', currentXi(11));
assert.deepEqual(offensive.legend.map(({ id }) => id), legacyOffensiveIds,
  'REM1–REM4 and all historical offensive roles stay distinct and ordered');
assert.deepEqual(offensive.legend.filter(({ id }) => id.startsWith('off_rematador_'))
  .map(({ abbreviation }) => abbreviation), ['REM1', 'REM2', 'REM3', 'REM4']);
assert.equal(Object.keys(offensive.visibleByPlayerId).length, 11);
const sixDynamicFinishers = buildSetPieceCaptureResponsibilities(
  assign(Array(6).fill('off_rematador')), 'offensive', currentXi(6),
  Object.fromEntries(Array.from({ length: 6 }, (_, index) => [`player-${index}`, `REMATADOR ${index + 1}`]))
);
assert.deepEqual(sixDynamicFinishers.legend.map(({ id }) => id), ['off_rematador']);
assert.deepEqual(sixDynamicFinishers.legend[0].playerNames, [
  'REMATADOR 1', 'REMATADOR 2', 'REMATADOR 3', 'REMATADOR 4', 'REMATADOR 5', 'REMATADOR 6',
], 'six finishers share one compact collective legend row');
assert.equal(Object.keys(sixDynamicFinishers.visibleByPlayerId).length, 6);
const repeatedAssignments = {
  'player-4': { responsibilityId: 'off_rematador_4', positionKey: 'rival:4' },
  'player-3': { responsibilityId: 'off_arrastre', positionKey: 'rival:3' },
  'player-1': { responsibilityId: 'off_bloqueo', positionKey: 'rival:1' },
  'player-2': { responsibilityId: 'off_arrastre', positionKey: 'rival:2' },
  'player-0': { responsibilityId: 'off_bloqueo', positionKey: 'rival:0' },
};
const repeatedNames = {
  'player-0': 'BORJA',
  'player-1': 'JULIO',
  'player-2': 'VICENTE',
  'player-3': 'TINEO',
  'player-4': 'XURDE',
};
const repeated = buildSetPieceCaptureResponsibilities(
  repeatedAssignments, 'offensive', currentXi(5), repeatedNames
);
assert.deepEqual(repeated.legend.map(({ abbreviation }) => abbreviation), ['REM4', 'BLQ', 'ARR'],
  'Bloqueo and Arrastre occur once in the legend even when repeated on the field');
assert.deepEqual(repeated.legend.find(({ abbreviation }) => abbreviation === 'BLQ').playerNames,
  ['BORJA', 'JULIO'], 'repeatable player names follow deterministic rival slot order');
assert.deepEqual(repeated.legend.find(({ abbreviation }) => abbreviation === 'ARR').playerNames,
  ['VICENTE', 'TINEO'], 'repeatable responsibilities keep all assigned players on one row');
assert.equal(repeated.visibleByPlayerId['player-4'].responsibilityId, 'off_rematador_4');
assert.deepEqual(repeated.legend.find(({ abbreviation }) => abbreviation === 'REM4').playerNames,
  ['XURDE'], 'field badge and legend resolve the same rival player ID');
const empty = buildSetPieceCaptureResponsibilities({}, 'defensive', currentXi(11));
assert.deepEqual(empty.legend, []);
assert.deepEqual(empty.visibleByPlayerId, {});
assert.equal(empty.hasNeedsReview, false);
const wrongPhase = buildSetPieceCaptureResponsibilities(assign(['def_zona_1']), 'offensive', currentXi(1));
assert.deepEqual(wrongPhase.legend, [], 'offensive capture never shows defensive assignments');
assert.deepEqual(wrongPhase.visibleByPlayerId, {});
const firstPlay = buildSetPieceCaptureResponsibilities(assign(['def_zona_1']), 'defensive', currentXi(1));
const nextPlay = buildSetPieceCaptureResponsibilities(assign(['def_zona_3']), 'defensive', currentXi(1));
assert.deepEqual(firstPlay.legend.map(({ abbreviation }) => abbreviation), ['Z1']);
assert.deepEqual(nextPlay.legend.map(({ abbreviation }) => abbreviation), ['Z3']);
const changedXi = { 'rival:0': 'replacement-player' };
const stale = buildSetPieceCaptureResponsibilities(assign(['def_zona_1']), 'defensive', changedXi);
assert.equal(stale.hasNeedsReview, true);
assert.deepEqual(stale.visibleByPlayerId, {}, 'a needsReview assignment is not shown as valid');
assert.deepEqual(stale.legend, [], 'a hidden doubtful badge cannot appear in the legend');
const mixed = buildSetPieceCaptureResponsibilities(assign(['def_zona_1', 'def_zona_2']),
  'defensive', { 'rival:0': 'replacement-player', 'rival:1': 'player-1' },
  { 'player-0': 'STALE', 'player-1': 'VALID' });
assert.deepEqual(mixed.legend.map(({ abbreviation }) => abbreviation), ['Z2']);
assert.deepEqual(mixed.legend[0].playerNames, ['VALID'], 'needsReview players are excluded from legend names');
assert.equal(mixed.hasNeedsReview, true);
const unresolvedName = buildSetPieceCaptureResponsibilities(
  assign(['def_zona_1']), 'defensive', currentXi(1), {}
);
assert.deepEqual(unresolvedName.legend[0].playerNames, [],
  'an unresolved player keeps the responsibility row without an invented name');
assert.deepEqual(normalizeSetPieceResponsibilities({
  'player-0': { responsibilityId: 'def_zona_1', positionKey: 'rival:0', playerName: 'BORJA' },
}), {
  'player-0': { responsibilityId: 'def_zona_1', positionKey: 'rival:0' },
}, 'display names never become persisted responsibility data');

const viewport = { x: 10, y: 30, width: 80, height: 70 };
assert.deepEqual(getSetPieceCaptureMarkerAnchor({ x: 10, y: 99 }, viewport),
  { horizontal: 'left', vertical: 'bottom' });
assert.deepEqual(getSetPieceCaptureMarkerAnchor({ x: 90, y: 31 }, viewport),
  { horizontal: 'right', vertical: 'top' });
assert.equal(getSetPieceBadgePlacement(0, [{ x: 11, y: 94 }], viewport), 'right',
  'a badge near the cropped bottom and left edge points inward');
assert.equal(getSetPieceBadgePlacement(0, [{ x: 89, y: 94 }], viewport), 'left');

const vite = await createServer({
  configFile: false,
  esbuild: { jsx: 'automatic' },
  server: { middlewareMode: true },
  appType: 'custom',
});
try {
  const { SetPieceResponsibilityBadge: Badge } = await vite.ssrLoadModule(
    '/src/components/tactical/SetPieceResponsibilityPanel.jsx'
  );
  assert.match(renderToStaticMarkup(createElement(Badge, {
    responsibilityId: 'off_rematador_4', phase: 'offensive', capture: true,
  })), /tactical-abp-capture-badge[^>]*>REM4<\/span>/);
  assert.equal(renderToStaticMarkup(createElement(Badge, {
    responsibilityId: '', phase: 'offensive', capture: true,
  })), '', 'a player without a responsibility has no badge');
} finally {
  await vite.close();
}

const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const boardSource = appSource.slice(appSource.indexOf('const renderFacingSystemsOverview ='),
  appSource.indexOf('const clearSelectedTeamField ='));
const rivalSource = boardSource.slice(boardSource.indexOf('{(layers.rival ||'),
  boardSource.indexOf('{layers.caudal &&'));
const caudalSource = boardSource.slice(boardSource.indexOf('{layers.caudal &&'));
assert.match(rivalSource, /SetPieceResponsibilityBadge|captureResponsibilities/,
  'rival players receive ABP badges from the capture model');
assert.doesNotMatch(caudalSource, /SetPieceResponsibilityBadge|captureResponsibilities/,
  'Caudal players never receive ABP badges');
assert.match(boardSource, /captureResponsibilities\?\.visibleByPlayerId/);
assert.match(boardSource, /getSetPieceCaptureMarkerAnchor\(slot, captureViewport\)/);
assert.match(boardSource, /getSetPieceBadgePlacement\(index, renderedRivalPositions, isSetPieceCapture \? captureViewport : null\)/);
assert.match(caudalSource, /layers\.caudal && !\(tacticalCaptureMode && tacticalGamePhase === 'set_piece'\)/,
  'ABP capture removes the complete Caudal marker layer');
assert.match(caudalSource, /layers\.caudalNames \|\| isSetPieceCapture/,
  'normal editor and other capture phases retain the existing Caudal name behavior');
assert.match(rivalSource, /isSetPieceCapture \? Boolean\(rivalSlot\.player\) : layers\.rivalNames/,
  'ABP capture never replaces an unresolved rival name with its tactical position label');
assert.match(appSource, /buildSetPieceCaptureResponsibilities\([\s\S]*?selectedSetPiecePlay\?\.responsibilities/,
  'capture follows the currently selected play');
assert.match(appSource, /setPieceCaptureResponsibilities\?\.legend\.length \? \(/,
  'no empty legend box');
assert.match(appSource, /definition\.playerNames\.join\(' · '\)/,
  'repeatable players share one compact legend row');
assert.match(appSource, /setPieceRivalPlayerNameById/,
  'legend names are derived from the current rival lineup');
assert.match(appSource, /Responsabilidades pendientes de revisar/);
assert.match(appSource, /captureSituationLabel \|\| setPieceActionLabel/);
assert.match(appSource, /labelMargin: 4/);
assert.match(cssSource, /\.tactical-abp-capture-badge\s*\{[\s\S]*font-size: 15px;/);
assert.match(cssSource, /\.tactical-abp-responsibility-players\s*\{[\s\S]*white-space: normal;/,
  'long repeated-player rows may wrap inside the information panel');
assert.match(cssSource, /\.tactical-abp-presentation-frame\s*\{[\s\S]*aspect-ratio: 16 \/ 9;/);

console.log('setPieceCaptureResponsibilities tests passed');
