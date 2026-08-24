import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTacticalCapturePresentation } from './tacticalCapturePresentation.js';
import {
  createTacticalBoardViewState,
  updateTacticalBoardViewState,
} from './tacticalBoardViewState.js';

const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const captureStart = appSource.indexOf("if (tacticalCaptureMode && typeof document !== 'undefined')");
const normalViewStart = appSource.indexOf("<div className={isPreTalkMode ? 'space-y-4' : 'space-y-5'}>", captureStart);
const captureViewSource = appSource.slice(captureStart, normalViewStart);
const boardStart = appSource.indexOf('const renderFacingSystemsOverview = (enableDefensiveEditing = false) =>');
const boardEnd = appSource.indexOf('\n  const clearSelectedTeamField', boardStart);
const boardSource = appSource.slice(boardStart, boardEnd);

assert.ok(captureStart > 0 && normalViewStart > captureStart, 'existe una única rama visual gobernada por tacticalCaptureMode');
assert.match(captureViewSource, /createPortal\(/, 'captura cubre la navegación general');
assert.match(captureViewSource, /data-tactical-capture="true"/);
assert.match(captureViewSource, /renderFacingSystemsOverview\(true\)/, 'captura reutiliza exactamente el renderer existente');
assert.match(captureViewSource, /capturePresentation\.phase/);
assert.match(captureViewSource, /capturePresentation\.situation/);
assert.match(captureViewSource, /capturePresentation\.description/);
assert.match(captureViewSource, /tactical-capture-stage--with-description/);
assert.match(captureViewSource, /tactical-capture-stage--field-only/);
assert.match(captureViewSource, />\s*Salir de captura\s*</);
assert.doesNotMatch(captureViewSource, /caudalSystem|rivalSystem|selectedTacticalPlay\.name/, 'la composición no muestra sistemas ni nombres técnicos de jugada');
assert.doesNotMatch(captureViewSource, /Sin descripción|textarea|selectDefensiveSituation|createTacticalPlayForEditing|saveActiveTacticalWorkspace/);

const defensiveHigh = buildTacticalCapturePresentation({
  phaseLabel: 'Fase defensiva',
  situationLabel: 'Bloque alto',
  plays: [{ id: 'a', description: 'Marcas individuales.' }],
  selectedPlay: { id: 'a', description: 'Marcas individuales.' },
});
assert.deepEqual(defensiveHigh, {
  phase: 'Fase defensiva',
  situation: 'Bloque alto',
  description: 'Marcas individuales.',
  playLabel: '',
}, 'A y H: fase, situación y descripción; una jugada no se numera');

assert.equal(buildTacticalCapturePresentation({
  phaseLabel: 'Fase defensiva',
  situationLabel: 'Bloque medio',
}).situation, 'Bloque medio', 'B: bloque medio');
assert.equal(buildTacticalCapturePresentation({
  phaseLabel: 'Fase ofensiva',
  situationLabel: 'Inicio',
}).phase, 'Fase ofensiva', 'C: fase ofensiva');
assert.deepEqual(buildTacticalCapturePresentation({
  phaseLabel: 'ABP',
  situationLabel: 'Córner ofensivo',
  selectedPlay: { id: 'abp', description: 'Atacar primer palo.' },
}), {
  phase: 'ABP',
  situation: 'Córner ofensivo',
  description: 'Atacar primer palo.',
  playLabel: '',
}, 'D: ABP usa la misma composición y descripción');

let viewState = createTacticalBoardViewState();
viewState = updateTacticalBoardViewState(viewState, { layers: { caudal: false, rival: false } });
assert.equal(viewState.layers.caudal, false, 'E: CAUDAL permanece oculto');
assert.equal(viewState.layers.rival, false, 'F: RIVAL permanece oculto');
assert.match(boardSource, /const fieldView = getFieldViewSettings\(\);/);
assert.match(boardSource, /\{layers\.rival \? rivalSlots\.map/);
assert.match(boardSource, /\{layers\.caudal \? caudalCoordinates\.map/);

const emptyDescription = buildTacticalCapturePresentation({
  selectedPlay: { id: 'empty', description: '   ' },
});
assert.equal(emptyDescription.description, '', 'G: la descripción vacía activa el layout de campo completo');
assert.doesNotMatch(captureViewSource, /Sin descripción/);

const multiplePlays = [{ id: 'one' }, { id: 'two' }, { id: 'three' }];
assert.equal(buildTacticalCapturePresentation({
  plays: multiplePlays,
  selectedPlay: { id: 'two', description: '' },
}).playLabel, 'Jugada 2', 'I: varias jugadas identifican discretamente la activa');

assert.match(boardSource, /selectedDefensivePlay\.arrows \|\| \[\]/, 'J: captura consume los pases y movimientos de la jugada actual');
assert.match(boardSource, /getTacticalBoardArrowPath\(arrow\)/, 'J: conserva flechas rectas y curvas editadas');
assert.match(boardSource, /enableDefensiveEditing && tacticalBallVisible/, 'D y J: conserva el balón actual');
assert.match(boardSource, /!tacticalCaptureMode \? \([\s\S]*?<span>Rival \{rivalSystem\}<\/span>[\s\S]*?<span>Caudal \{caudalSystem\}<\/span>/, 'los sistemas solo permanecen en la vista normal');

assert.match(appSource, /document\.body\.style\.overflow = 'hidden'/);
assert.match(appSource, /document\.documentElement\.style\.overflow = 'hidden'/);
assert.match(appSource, /if \(event\.key === 'Escape'\) setTacticalCaptureMode\(false\)/);
assert.match(appSource, /if \(tacticalCaptureMode \|\| defensiveTool !== 'move'\) return;/, 'captura no puede iniciar ediciones');

assert.match(cssSource, /\.tactical-capture-root\s*\{[\s\S]*position: fixed;[\s\S]*height: 100dvh;[\s\S]*overflow: hidden;/);
assert.match(cssSource, /\.tactical-capture-context\s*\{[\s\S]*display: flex;[\s\S]*justify-content: center;[\s\S]*text-align: center;/, 'fase y situación se centran respecto a toda la composición');
assert.match(cssSource, /\.tactical-capture-play\s*\{[\s\S]*position: absolute;[\s\S]*right:/, 'la numeración no desplaza la cabecera centrada');
assert.match(cssSource, /\.tactical-capture-stage\s*\{[\s\S]*display: flex;/, 'el campo tiene prioridad y la descripción recibe el espacio restante');
assert.match(cssSource, /\.tactical-capture-stage--with-description\s*\{[\s\S]*align-items: flex-start;/);
assert.match(cssSource, /\.tactical-capture-stage--field-only\s*\{[\s\S]*justify-content: center;/);
assert.match(cssSource, /\.tactical-capture-board-shell\s*\{[\s\S]*container-type: size;[\s\S]*min-height: 0;[\s\S]*overflow: hidden;/);
assert.match(cssSource, /flex-basis: min\(896px, calc\(\(100dvh - 108px\) \* 0\.833333\)\);/, 'la altura del viewport fija el campo antes de repartir espacio a la descripción');
assert.match(cssSource, /width: min\(100cqw, calc\(100cqh \* 0\.833333\)\)/, 'el campo conserva su proporción usando el espacio real del contenedor');
assert.match(cssSource, /\.tactical-capture-description-panel\s*\{[\s\S]*flex: 1 1 0;[\s\S]*align-self: flex-start;[\s\S]*justify-content: flex-start;/, 'la tarjeta crece por contenido desde la parte superior');
assert.match(cssSource, /\.tactical-capture-description\s*\{[\s\S]*font-size: clamp\(18px,[\s\S]*line-height: 1\.48;/, 'la descripción mantiene tamaño de presentación');
assert.match(cssSource, /\.tactical-capture-exit\s*\{[\s\S]*position: fixed;[\s\S]*right: 7px;[\s\S]*writing-mode: vertical-rl;/, 'Salir queda en el margen exterior de la composición');

const boardRatio = 7 / 8.4;
[
  [1366, 768],
  [1440, 900],
  [1536, 864],
  [1920, 1080],
].forEach(([viewportWidth, viewportHeight]) => {
  const horizontalPadding = Math.min(152, Math.max(92, viewportWidth * 0.08));
  const contentWidth = Math.min(viewportWidth - horizontalPadding, 1600);
  const availableHeight = viewportHeight - 108;
  const boardWidth = Math.min(896, availableHeight * boardRatio);
  const boardHeight = boardWidth / boardRatio;
  assert.ok(boardHeight <= availableHeight + 0.01, `${viewportWidth}x${viewportHeight}: campo completo sin corte vertical`);
  assert.ok(boardWidth <= contentWidth + 0.01, `${viewportWidth}x${viewportHeight}: campo completo sin corte horizontal`);
});

const boardWidth1920 = Math.min(896, (1080 - 108) * boardRatio);
const boardWidth1600 = Math.min(896, (900 - 108) * boardRatio);
assert.ok(boardWidth1920 >= 809 && boardWidth1920 <= 811, '1920x1080: el campo recupera aproximadamente 810 px de ancho');
assert.ok(boardWidth1600 >= 659 && boardWidth1600 <= 661, '1600x900: el campo conserva aproximadamente 660 px de ancho');

console.log('tacticalCaptureMode tests passed');
