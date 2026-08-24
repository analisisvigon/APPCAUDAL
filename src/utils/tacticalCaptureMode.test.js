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
assert.match(captureViewSource, /tactical-capture-sidebar/);
assert.match(captureViewSource, /tactical-capture-phase-block/);
assert.match(captureViewSource, /tactical-capture-description-block/);
assert.match(captureViewSource, />\s*Salir de captura\s*</);
assert.doesNotMatch(captureViewSource, /caudalSystem|rivalSystem|selectedTacticalPlay\.name/, 'la composición no muestra sistemas ni nombres técnicos de jugada');
assert.doesNotMatch(captureViewSource, /<header|tactical-capture-context/, 'no existe una cabecera superior que reste altura al campo');
assert.doesNotMatch(captureViewSource, /playLabel|Jugada\s*[1-9]/i, 'captura nunca presenta una numeración de jugada');
assert.doesNotMatch(captureViewSource, /Sin descripción|textarea|selectDefensiveSituation|createTacticalPlayForEditing|saveActiveTacticalWorkspace/);

const defensiveHigh = buildTacticalCapturePresentation({
  phaseLabel: 'Fase defensiva',
  situationLabel: 'Bloque alto',
  selectedPlay: { id: 'a', description: 'Marcas individuales.' },
});
assert.deepEqual(defensiveHigh, {
  phase: 'Fase defensiva',
  situation: 'Bloque alto',
  description: 'Marcas individuales.',
}, 'fase, situación y descripción comparten el panel derecho');

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

const singleLineDescription = buildTacticalCapturePresentation({
  selectedPlay: { id: 'single', description: 'Una sola línea.' },
}).description;
const manualLinesDescription = buildTacticalCapturePresentation({
  selectedPlay: { id: 'lines', description: '. Puntas con centrales y pivotes\n. Posibilidad de salto de extremo a central.' },
}).description;
const fourLinesDescription = buildTacticalCapturePresentation({
  selectedPlay: { id: 'four', description: 'Línea 1\nLínea 2\nLínea 3\nLínea 4' },
}).description;
const paragraphsDescription = buildTacticalCapturePresentation({
  selectedPlay: { id: 'paragraphs', description: 'Primera idea.\n\nSegunda idea.' },
}).description;
const templateDescription = buildTacticalCapturePresentation({
  selectedPlay: { id: 'template-play', sourceTemplateId: 'template-1', description: 'Línea A\nLínea B' },
}).description;
assert.equal(singleLineDescription, 'Una sola línea.', 'una línea no cambia');
assert.equal(manualLinesDescription, '. Puntas con centrales y pivotes\n. Posibilidad de salto de extremo a central.', 'dos saltos manuales llegan intactos al render');
assert.equal(fourLinesDescription.split('\n').length, 4, 'cuatro líneas conservan su estructura');
assert.equal(paragraphsDescription, 'Primera idea.\n\nSegunda idea.', 'una línea vacía entre párrafos se conserva');
assert.equal(templateDescription, 'Línea A\nLínea B', 'una descripción procedente de plantilla usa el mismo valor de jugada');
assert.equal(buildTacticalCapturePresentation({ selectedPlay: { description: manualLinesDescription } }).description, manualLinesDescription, 'salir y volver a captura no transforma el texto');

assert.deepEqual(buildTacticalCapturePresentation({
  selectedPlay: { id: 'two', description: '' },
}), { phase: '', situation: '', description: '' }, 'varias jugadas no añaden metadatos de numeración a captura');

assert.match(boardSource, /selectedDefensivePlay\.arrows \|\| \[\]/, 'J: captura consume los pases y movimientos de la jugada actual');
assert.match(boardSource, /getTacticalBoardArrowPath\(arrow\)/, 'J: conserva flechas rectas y curvas editadas');
assert.match(boardSource, /enableDefensiveEditing && tacticalBallVisible/, 'D y J: conserva el balón actual');
assert.match(boardSource, /!tacticalCaptureMode \? \([\s\S]*?<span>Rival \{rivalSystem\}<\/span>[\s\S]*?<span>Caudal \{caudalSystem\}<\/span>/, 'los sistemas solo permanecen en la vista normal');

assert.match(appSource, /document\.body\.style\.overflow = 'hidden'/);
assert.match(appSource, /document\.documentElement\.style\.overflow = 'hidden'/);
assert.match(appSource, /if \(event\.key === 'Escape'\) setTacticalCaptureMode\(false\)/);
assert.match(appSource, /if \(tacticalCaptureMode \|\| defensiveTool !== 'move'\) return;/, 'captura no puede iniciar ediciones');

assert.match(cssSource, /\.tactical-capture-root\s*\{[\s\S]*position: fixed;[\s\S]*height: 100dvh;[\s\S]*overflow: hidden;/);
assert.match(cssSource, /\.tactical-capture-root\s*\{[\s\S]*display: flex;[\s\S]*padding: 16px;/, 'el portal dedica toda la altura salvo 16 px por borde');
assert.doesNotMatch(cssSource, /\.tactical-capture-context|\.tactical-capture-play|stage--with-description|stage--field-only/, 'se eliminaron las reglas del layout anterior');
assert.match(cssSource, /\.tactical-capture-stage\s*\{[\s\S]*display: flex;[\s\S]*height: 100%;/, 'campo y panel forman una única fila a altura completa');
assert.match(cssSource, /\.tactical-capture-board-shell\s*\{[\s\S]*container-type: size;[\s\S]*min-height: 0;[\s\S]*overflow: hidden;/);
assert.match(cssSource, /flex-basis: min\(896px, calc\(\(100dvh - 32px\) \* 0\.833333\)\);/, 'el campo usa toda la altura salvo los dos márgenes de 16 px');
assert.match(cssSource, /width: min\(100cqw, calc\(100cqh \* 0\.833333\)\)/, 'el campo conserva su proporción usando el espacio real del contenedor');
assert.match(cssSource, /\.tactical-capture-sidebar\s*\{[\s\S]*flex: 1 1 0;[\s\S]*align-self: flex-start;[\s\S]*justify-content: flex-start;/, 'fase y descripción comparten un panel compacto');
assert.match(cssSource, /\.tactical-capture-description\s*\{[\s\S]*font-size: clamp\(18px,[\s\S]*line-height: 1\.48;/, 'la descripción mantiene tamaño de presentación');
assert.match(cssSource, /\.tactical-capture-description\s*\{[\s\S]*overflow-wrap: anywhere;[\s\S]*white-space: pre-wrap;/, 'captura conserva saltos manuales y mantiene wrap automático');
assert.match(cssSource, /\.tactical-capture-exit\s*\{[\s\S]*position: fixed;[\s\S]*right: 7px;[\s\S]*writing-mode: vertical-rl;/, 'Salir queda en el margen exterior de la composición');

const boardRatio = 7 / 8.4;
[
  [1366, 768],
  [1440, 900],
  [1536, 864],
  [1920, 1080],
].forEach(([viewportWidth, viewportHeight]) => {
  const contentWidth = viewportWidth - 32;
  const availableHeight = viewportHeight - 32;
  const boardWidth = Math.min(896, availableHeight * boardRatio);
  const boardHeight = boardWidth / boardRatio;
  assert.ok(boardHeight <= availableHeight + 0.01, `${viewportWidth}x${viewportHeight}: campo completo sin corte vertical`);
  assert.ok(boardWidth <= contentWidth + 0.01, `${viewportWidth}x${viewportHeight}: campo completo sin corte horizontal`);
});

const boardWidth1920 = Math.min(896, (1080 - 32) * boardRatio);
const boardWidth1600 = Math.min(896, (900 - 32) * boardRatio);
assert.ok(boardWidth1920 >= 872 && boardWidth1920 <= 874, '1920x1080: el campo crece hasta aproximadamente 873 px de ancho');
assert.ok(boardWidth1600 >= 722 && boardWidth1600 <= 724, '1600x900: el campo crece hasta aproximadamente 723 px de ancho');
assert.equal(Math.round(boardWidth1920 / boardRatio), 1048, '1920x1080: el campo aprovecha 1048 px de altura');
assert.equal(Math.round(boardWidth1600 / boardRatio), 868, '1600x900: el campo aprovecha 868 px de altura');

console.log('tacticalCaptureMode tests passed');
