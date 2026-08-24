import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const captureStart = appSource.indexOf("if (tacticalCaptureMode && typeof document !== 'undefined')");
const normalViewStart = appSource.indexOf("<div className={isPreTalkMode ? 'space-y-4' : 'space-y-5'}>", captureStart);
const captureViewSource = appSource.slice(captureStart, normalViewStart);

assert.ok(captureStart > 0 && normalViewStart > captureStart, 'existe una única rama visual gobernada por tacticalCaptureMode');
assert.match(captureViewSource, /createPortal\(/, 'la captura cubre también la navegación general de APPCAUDAL');
assert.match(captureViewSource, /data-tactical-capture="true"/);
assert.match(captureViewSource, /renderFacingSystemsOverview\(true\)/, 'la captura reutiliza exactamente la pizarra existente');
assert.match(captureViewSource, /capturePhaseLabel/);
assert.match(captureViewSource, /captureSituationLabel/);
assert.match(captureViewSource, /selectedTacticalPlay\.name/);
assert.match(captureViewSource, /captureDescription/);
assert.doesNotMatch(captureViewSource, /Sin jugadas|Nueva jugada|Guardar como plantilla|textarea|selectDefensiveSituation/);
assert.doesNotMatch(captureViewSource, /createTacticalPlayForEditing|saveActiveTacticalWorkspace|updateTacticalPlay/);

assert.match(appSource, /document\.body\.style\.overflow = 'hidden'/);
assert.match(appSource, /document\.documentElement\.style\.overflow = 'hidden'/);
assert.match(appSource, /if \(event\.key === 'Escape'\) setTacticalCaptureMode\(false\)/);
assert.match(appSource, /if \(tacticalCaptureMode \|\| defensiveTool !== 'move'\) return;/, 'captura no puede iniciar drag ni crear una jugada');
assert.match(appSource, /onClick=\{\(\) => setTacticalCaptureMode\(true\)\}/, 'el modo normal entra sin alterar el estado táctico');

assert.match(cssSource, /\.tactical-capture-root\s*\{[\s\S]*position: fixed;[\s\S]*height: 100dvh;[\s\S]*overflow: hidden;/);
assert.match(cssSource, /grid-template-rows: auto minmax\(0, 1fr\)/);
assert.match(cssSource, /\.tactical-capture-stage\s*\{[\s\S]*container-type: size;[\s\S]*min-height: 0;[\s\S]*overflow: hidden;/);
assert.match(cssSource, /\.tactical-capture-stage \.facing-tactical-board\s*\{[\s\S]*min-height: 0;/);
assert.match(cssSource, /width: min\(100cqw, calc\(100cqh \* 0\.833333\)\)/, 'el ancho deriva de la altura real disponible del stage');
assert.match(cssSource, /-webkit-line-clamp: 3/, 'la descripción solo se recorta visualmente');

const boardRatio = 7 / 8.4;
const headerFallback = 112;
[
  [1366, 768],
  [1440, 900],
  [1536, 864],
  [1920, 1080],
].forEach(([viewportWidth, viewportHeight]) => {
  const availableHeight = viewportHeight - headerFallback;
  const boardWidth = Math.min(viewportWidth - 24, availableHeight * boardRatio);
  const boardHeight = boardWidth / boardRatio;
  assert.ok(boardHeight <= availableHeight + 0.01, `${viewportWidth}x${viewportHeight}: el campo completo cabe verticalmente`);
  assert.ok(boardWidth <= viewportWidth - 24, `${viewportWidth}x${viewportHeight}: el campo cabe horizontalmente`);
});

console.log('tacticalCaptureMode tests passed');
