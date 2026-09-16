import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const captureStart = appSource.indexOf("if (tacticalCaptureMode && tacticalGamePhase === 'set_piece'");
const captureEnd = appSource.indexOf("if (tacticalCaptureMode && typeof document !== 'undefined')", captureStart);
const captureSource = appSource.slice(captureStart, captureEnd);
const mobileStart = cssSource.indexOf('@media (max-width: 768px)');
const mobileSource = cssSource.slice(mobileStart, cssSource.indexOf('@media (max-width: 520px)', mobileStart));
const narrowStart = cssSource.indexOf('@media (max-width: 520px)');
const narrowSource = cssSource.slice(narrowStart, cssSource.indexOf('\n.tactical-capture-root', narrowStart));

assert.ok(captureStart > 0 && captureEnd > captureStart, 'the ABP capture branch is isolated');
assert.match(captureSource, /tactical-abp-presentation-root/);
assert.match(captureSource, /tactical-abp-presentation-frame/);
assert.match(captureSource, /renderFacingSystemsOverview\(true,/,
  'ABP capture keeps the existing facing-systems renderer');
assert.doesNotMatch(captureSource, /SetPieceDiagramCanvas/,
  'the shared print and library canvas is not part of this capture');

assert.match(cssSource, /\.tactical-abp-presentation-root\s*\{[\s\S]*?align-items: flex-end;/,
  'desktop presentation keeps its approved bottom alignment');
assert.match(cssSource, /\.tactical-abp-presentation-frame\s*\{[\s\S]*?aspect-ratio: 16 \/ 9;[\s\S]*?grid-template-columns: minmax\(0, 3\.35fr\) minmax\(250px, 1fr\);/,
  'desktop presentation keeps its approved 16:9 two-column layout');

assert.ok(mobileStart > 0, 'a dedicated ABP mobile breakpoint exists');
assert.match(mobileSource, /\.tactical-abp-presentation-root\s*\{[\s\S]*?display: block;[\s\S]*?overflow-y: auto;/,
  'mobile uses natural vertical flow and scrolling');
assert.match(mobileSource, /env\(safe-area-inset-top, 0px\)/);
assert.match(mobileSource, /env\(safe-area-inset-bottom, 0px\)/);
assert.match(mobileSource, /\.tactical-abp-presentation-controls\s*\{[\s\S]*?position: relative;[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
  'mobile navigation cannot overflow as one fixed row');
assert.match(mobileSource, /\.tactical-abp-presentation-frame\s*\{[\s\S]*?width: 100%;[\s\S]*?max-height: none;[\s\S]*?aspect-ratio: auto;[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/,
  'mobile stacks a full-width field above information');
assert.match(mobileSource, /\.tactical-abp-board-crop\s*\{[\s\S]*?width: 100%;[\s\S]*?max-height: none;/,
  'the mobile pitch keeps its own aspect ratio at full width');
assert.match(mobileSource, /\.tactical-abp-pitch-pane\s*\{[\s\S]*?container-type: normal;/,
  'the pitch content determines its natural mobile height');
assert.doesNotMatch(mobileSource, /margin-(?:top|bottom):\s*-/,
  'the mobile fix does not use negative-margin positioning');
assert.match(narrowSource, /\.tactical-abp-capture-marker > span:first-child\s*\{[\s\S]*?width: 30px;[\s\S]*?height: 30px;/,
  'narrow screens compact only the visual avatar size');
assert.match(narrowSource, /\[data-abp-capture-name="true"\][\s\S]*?font-size: 8px;/,
  'narrow screens keep names readable without changing their coordinates');
assert.match(narrowSource, /\.tactical-abp-capture-badge\s*\{[\s\S]*?font-size: 11px;/,
  'narrow screens compact only the visual responsibility badge');

console.log('setPieceCaptureResponsive tests passed');
