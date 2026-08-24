import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildSetPiecePresentationCrop,
  buildSetPiecePresentationViewport,
  getSetPiecePresentationName,
} from './setPiecePresentation.js';

const lowerCorner = buildSetPiecePresentationViewport({
  setPieceAction: 'corner',
  ballStartPosition: { x: 5, y: 95 },
  playerPositions: {
    'rival:1': { x: 36, y: 88 },
    'caudal:1': { x: 42, y: 84 },
    'remote-keeper': { x: 50, y: 6 },
  },
  arrows: [{ start: { x: 5, y: 95 }, end: { x: 52, y: 84 } }],
});
assert.deepEqual(lowerCorner, { x: 0, y: 34, width: 100, height: 66 }, 'córner ofensivo encuadra el último tercio y excluye el portero remoto');

const upperCorner = buildSetPiecePresentationViewport({
  setPieceAction: 'corner',
  ballStartPosition: { x: 95, y: 5 },
  playerPositions: { 'caudal:1': { x: 60, y: 12 } },
});
assert.deepEqual(upperCorner, { x: 0, y: 0, width: 100, height: 66 }, 'córner defensivo refleja el encuadre hacia la portería superior');

const wideFreeKick = buildSetPiecePresentationViewport({
  setPieceAction: 'wide_free_kick',
  ballStartPosition: { x: 7, y: 74 },
  arrows: [{ start: { x: 7, y: 74 }, end: { x: 65, y: 91 }, controlPoint: { x: 32, y: 64 } }],
});
assert.ok(wideFreeKick.y <= 18 && wideFreeKick.height >= 82, 'falta lateral incluye golpeo, curva y área');

const centralFreeKick = buildSetPiecePresentationViewport({
  setPieceAction: 'central_free_kick',
  ballStartPosition: { x: 50, y: 82 },
});
assert.deepEqual(centralFreeKick, { x: 10, y: 24, width: 80, height: 76 }, 'falta frontal prioriza frontal, área y portería');

const leftThrow = buildSetPiecePresentationViewport({
  setPieceAction: 'throw_in',
  ballStartPosition: { x: 5, y: 50 },
});
const rightThrow = buildSetPiecePresentationViewport({
  setPieceAction: 'throw_in',
  ballStartPosition: { x: 95, y: 50 },
});
assert.equal(leftThrow.x, 0, 'saque de banda izquierdo conserva esa banda');
assert.ok(rightThrow.x > 15, 'saque de banda derecho desplaza el viewport a esa banda');

const expandedByArrow = buildSetPiecePresentationViewport({
  setPieceAction: 'corner',
  ballStartPosition: { x: 5, y: 95 },
  arrows: [{ start: { x: 5, y: 95 }, end: { x: 50, y: 18 } }],
});
assert.ok(expandedByArrow.y <= 14, 'una flecha fuera del encuadre base amplía el viewport con margen');

const crop = buildSetPiecePresentationCrop(lowerCorner);
assert.equal(crop.aspectRatio, 1.26);
assert.deepEqual(crop.hostStyle, { width: '100%', left: '0%', top: '-51.52%' });
assert.equal(getSetPiecePresentationName('Jugada 1'), '');
assert.equal(getSetPiecePresentationName('Jugada 2 · copia'), '');
assert.equal(getSetPiecePresentationName('Córner ofensivo A'), 'Córner ofensivo A');

const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const presentationStart = appSource.indexOf("if (tacticalCaptureMode && tacticalGamePhase === 'set_piece'");
const genericCaptureStart = appSource.indexOf("if (tacticalCaptureMode && typeof document !== 'undefined')", presentationStart);
const presentationSource = appSource.slice(presentationStart, genericCaptureStart);

assert.ok(presentationStart > 0 && genericCaptureStart > presentationStart, 'ABP tiene una presentación dedicada sin sustituir las demás fases');
assert.match(presentationSource, /data-set-piece-presentation="true"/);
assert.match(presentationSource, /renderFacingSystemsOverview\(true\)/, 'ABP reutiliza el renderer táctico completo');
assert.match(presentationSource, /setPieceTypeLabel/);
assert.match(presentationSource, /setPieceActionLabel/);
assert.match(presentationSource, /capturePresentation\.description/);
assert.doesNotMatch(presentationSource, /capturePresentation\.playStyle/, 'ABP conserva su cabecera específica sin tipo de juego artificial');
assert.match(presentationSource, /setPieceCaptureInformation\.map/);
assert.match(presentationSource, /selectSetPiecePlay\([\s\S]*?\{ markDirty: false, allowContextChange: true \}/, 'los controles externos cambian jugada y zona sin guardar contenido táctico');
assert.doesNotMatch(presentationSource, /caudalSystem|rivalSystem|Jugada 1|Jugada 2|Guardar|Duplicar|Eliminar|Plantillas|defensiveTool/, 'la superficie ABP no muestra sistemas, numeración ni herramientas editoriales');
assert.match(appSource, /getSetPiecePresentationName\(selectedSetPiecePlay\?\.name\)/, 'un nombre concreto puede mostrarse y los nombres genéricos se filtran');
assert.match(appSource, /getTacticalZones\(\)/, 'las zonas activas participan en el encuadre sin duplicarse');

assert.match(cssSource, /\.tactical-abp-presentation-frame\s*\{[\s\S]*aspect-ratio: 16 \/ 9;[\s\S]*grid-template-columns: minmax\(0, 2\.08fr\) minmax\(270px, 0\.92fr\);/);
assert.match(cssSource, /\.tactical-abp-presentation-controls\s*\{[\s\S]*position: fixed;/, 'anterior, siguiente, selector y salir quedan fuera del frame');
assert.match(cssSource, /\.tactical-abp-pitch-pane\s*\{[\s\S]*container-type: size;[\s\S]*overflow: hidden;/);
assert.match(cssSource, /\.tactical-abp-board-host \.facing-tactical-board\s*\{[\s\S]*max-width: none;/, 'el campo autoencuadrado no hereda el límite del tablero completo');
assert.match(cssSource, /\.tactical-abp-description p\s*\{[\s\S]*white-space: pre-wrap;/, 'la descripción ABP conserva saltos manuales');

[
  [1366, 768],
  [1440, 900],
  [1600, 900],
  [1920, 1080],
].forEach(([viewportWidth, viewportHeight]) => {
  const frameWidth = Math.min(viewportWidth - 24, (viewportHeight - 60) * (16 / 9));
  const frameHeight = frameWidth * (9 / 16);
  assert.ok(frameWidth <= viewportWidth - 24, `${viewportWidth}x${viewportHeight}: frame sin corte horizontal`);
  assert.ok(frameHeight <= viewportHeight - 60, `${viewportWidth}x${viewportHeight}: frame y controles sin scroll vertical`);
  assert.ok(frameWidth / frameHeight > 1.77 && frameWidth / frameHeight < 1.78, `${viewportWidth}x${viewportHeight}: superficie 16:9`);
});

console.log('setPiecePresentation tests passed');
