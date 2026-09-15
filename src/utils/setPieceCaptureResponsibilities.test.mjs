import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { getSetPieceBadgePlacement, getSetPieceCaptureMarkerAnchor } from './setPieceBadgePlacement.js';
import { buildSetPieceCaptureResponsibilities } from './setPieceCaptureResponsibilities.js';
import { getSetPieceResponsibilitiesForPhase } from './setPieceResponsibilities.js';

const assign = (ids) => Object.fromEntries(ids.map((responsibilityId, index) => [
  `player-${index}`, { responsibilityId, positionKey: `caudal:${index}` },
]));
const currentXi = (count) => Object.fromEntries(Array.from({ length: count }, (_, index) => [
  `caudal:${index}`, `player-${index}`,
]));
const defensiveIds = getSetPieceResponsibilitiesForPhase('defensive').map(({ id }) => id);
const offensiveIds = getSetPieceResponsibilitiesForPhase('offensive').map(({ id }) => id);
const defensive = buildSetPieceCaptureResponsibilities(
  assign([...defensiveIds, 'def_marca', 'def_marca']), 'defensive', currentXi(11)
);
assert.deepEqual(defensive.legend.map(({ id }) => id), defensiveIds,
  'a complete defensive legend follows canonical order and deduplicates Marca');
assert.equal(Object.keys(defensive.visibleByPlayerId).length, 11);
const offensive = buildSetPieceCaptureResponsibilities(assign(offensiveIds), 'offensive', currentXi(11));
assert.deepEqual(offensive.legend.map(({ id }) => id), offensiveIds,
  'REM1–REM4 and all offensive roles stay distinct and ordered');
assert.deepEqual(offensive.legend.filter(({ id }) => id.startsWith('off_rematador_'))
  .map(({ abbreviation }) => abbreviation), ['REM1', 'REM2', 'REM3', 'REM4']);
assert.equal(Object.keys(offensive.visibleByPlayerId).length, 11);
const repeated = buildSetPieceCaptureResponsibilities(assign([
  'off_bloqueo', 'off_bloqueo', 'off_arrastre', 'off_arrastre', 'off_rematador_4',
]), 'offensive', currentXi(5));
assert.deepEqual(repeated.legend.map(({ abbreviation }) => abbreviation), ['REM4', 'BLQ', 'ARR'],
  'Bloqueo and Arrastre occur once in the legend even when repeated on the field');
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
const changedXi = { 'caudal:0': 'replacement-player' };
const stale = buildSetPieceCaptureResponsibilities(assign(['def_zona_1']), 'defensive', changedXi);
assert.equal(stale.hasNeedsReview, true);
assert.deepEqual(stale.visibleByPlayerId, {}, 'a needsReview assignment is not shown as valid');
assert.deepEqual(stale.legend, [], 'a hidden doubtful badge cannot appear in the legend');
const mixed = buildSetPieceCaptureResponsibilities(assign(['def_zona_1', 'def_zona_2']),
  'defensive', { 'caudal:0': 'replacement-player', 'caudal:1': 'player-1' });
assert.deepEqual(mixed.legend.map(({ abbreviation }) => abbreviation), ['Z2']);
assert.equal(mixed.hasNeedsReview, true);

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
const rivalSource = boardSource.slice(boardSource.indexOf('{layers.rival ? rivalSlots.map'),
  boardSource.indexOf('{(layers.caudal ||'));
assert.doesNotMatch(rivalSource, /SetPieceResponsibilityBadge|captureResponsibilities/,
  'rival players never receive ABP badges');
assert.match(boardSource, /captureResponsibilities\?\.visibleByPlayerId/);
assert.match(boardSource, /getSetPieceCaptureMarkerAnchor\(slot, captureViewport\)/);
assert.match(boardSource, /getSetPieceBadgePlacement\(index, renderedCaudalPositions, isSetPieceCapture \? captureViewport : null\)/);
assert.match(boardSource, /layers\.caudalNames \|\| isSetPieceCapture/,
  'Caudal names remain visible in the team capture');
assert.match(appSource, /buildSetPieceCaptureResponsibilities\([\s\S]*?selectedSetPiecePlay\?\.responsibilities/,
  'capture follows the currently selected play');
assert.match(appSource, /setPieceCaptureResponsibilities\?\.legend\.length \? \(/,
  'no empty legend box');
assert.match(appSource, /Responsabilidades pendientes de revisar/);
assert.match(appSource, /captureSituationLabel \|\| setPieceActionLabel/);
assert.match(appSource, /labelMargin: 4/);
assert.match(cssSource, /\.tactical-abp-capture-badge\s*\{[\s\S]*font-size: 14px;/);
assert.match(cssSource, /\.tactical-abp-presentation-frame\s*\{[\s\S]*aspect-ratio: 16 \/ 9;/);

console.log('setPieceCaptureResponsibilities tests passed');
