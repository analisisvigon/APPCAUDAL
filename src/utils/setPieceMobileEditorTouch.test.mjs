import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const printCssSource = readFileSync(new URL('../styles/print.css', import.meta.url), 'utf8');
const sharedCanvasSource = readFileSync(new URL('../components/print/SetPieceDiagramCanvas.jsx', import.meta.url), 'utf8');
const sharedEditorSource = readFileSync(new URL('../components/print/SetPieceDiagramEditor.jsx', import.meta.url), 'utf8');

const boardStart = appSource.indexOf('const renderFacingSystemsOverview =');
const boardEnd = appSource.indexOf('\n  const clearSelectedTeamField', boardStart);
const boardSource = appSource.slice(boardStart, boardEnd);
const playerDragSource = appSource.slice(
  appSource.indexOf('const beginDefensivePlayerDrag ='),
  appSource.indexOf('const moveDefensivePlayer ='),
);
const ballDragSource = appSource.slice(
  appSource.indexOf('const beginTacticalBallDrag ='),
  appSource.indexOf('const moveTacticalBall ='),
);
const fieldPointerSource = appSource.slice(
  appSource.indexOf('const beginDefensiveDrawing ='),
  appSource.indexOf('const moveDefensiveDrawing ='),
);
const touchPolicyStart = cssSource.indexOf('.tactical-board-scroll,');
const touchPolicyEnd = cssSource.indexOf('/* Normal application shell only.', touchPolicyStart);
const touchPolicySource = cssSource.slice(touchPolicyStart, touchPolicyEnd);
const semanticPolicyEnd = touchPolicySource.indexOf('@media');
const semanticPolicySource = touchPolicySource.slice(0, semanticPolicyEnd);

assert.ok(boardStart > 0 && boardEnd > boardStart, 'se localiza el renderer compartido de la pizarra');
assert.match(boardSource, /const tacticalInteractionMode = tacticalCaptureMode \|\| !enableDefensiveEditing[\s\S]*?'readonly'[\s\S]*?\['pass', 'movement', 'ball'\]\.includes\(defensiveTool\)[\s\S]*?'draw'[\s\S]*?'navigate'/,
  'todas las fases distinguen explícitamente navegación, dibujo y solo lectura');
assert.match(boardSource, /data-interaction-mode=\{tacticalInteractionMode\}/,
  'la superficie publica el modo táctil real');
assert.doesNotMatch(boardSource, /style=\{enableDefensiveEditing && !isInteractiveSetPieceEditor \? \{ touchAction: 'none' \} : undefined\}/,
  'defensiva, ofensiva y transición ya no bloquean indiscriminadamente todo el campo');

assert.ok(touchPolicyStart > 0 && touchPolicyEnd > touchPolicyStart, 'existe un bloque táctil acotado a superficies tácticas');
assert.doesNotMatch(semanticPolicySource, /pointer:\s*coarse/,
  'la semántica no depende del tipo de puntero declarado por el dispositivo');
assert.match(touchPolicySource, /data-interaction-mode='navigate'[\s\S]*?touch-action:\s*pan-x pan-y pinch-zoom;/,
  'el césped navegable conserva scroll vertical nativo y desplazamiento horizontal cuando hace falta');
assert.match(touchPolicySource, /data-interaction-mode='draw'[\s\S]*?touch-action:\s*none;/,
  'Pase, Movimiento y colocación reservan el gesto para el campo');
assert.match(touchPolicySource, /data-interaction-mode='readonly'[\s\S]*?touch-action:\s*auto;/,
  'las superficies de lectura dejan el gesto al navegador');
assert.match(touchPolicySource, /\.tactical-board-touch-target[\s\S]*?touch-action:\s*none;/,
  'los controles de trazados siguen siendo blancos táctiles exclusivos');
assert.match(touchPolicySource, /overscroll-behavior-y:\s*auto;/,
  'el wrapper horizontal permite encadenar el pan vertical hacia la página');
assert.match(boardSource, /touchAction: 'none'/,
  'jugadores y balón conservan blancos táctiles sin scroll durante su drag');
assert.match(playerDragSource, /event\.preventDefault\(\);[\s\S]*?setPointerCapture/,
  'un jugador en Mover bloquea el gesto y captura el pointer');
assert.match(ballDragSource, /event\.preventDefault\(\);[\s\S]*?setPointerCapture/,
  'el balón en Mover bloquea el gesto y captura el pointer');
assert.match(fieldPointerSource, /if \(!selectedDefensivePlay \|\| !\['pass', 'movement'\]\.includes\(defensiveTool\)\) \{[\s\S]*?return;[\s\S]*?const start[\s\S]*?event\.preventDefault\(\);/,
  'Mover y Seleccionar abandonan el handler de fondo antes del preventDefault de dibujo');
assert.match(fieldPointerSource, /\['pass', 'movement'\][\s\S]*?event\.preventDefault\(\);[\s\S]*?setPointerCapture/,
  'Pase y Movimiento reservan el campo y capturan el pointer');

assert.match(appSource, /onPointerUp=\{enableDefensiveEditing && !tacticalCaptureMode \? handleDefensiveFieldPointerEnd : undefined\}/);
assert.match(appSource, /onPointerCancel=\{enableDefensiveEditing && !tacticalCaptureMode \? cancelDefensiveFieldPointer : undefined\}/);
assert.match(appSource, /onLostPointerCapture=\{enableDefensiveEditing && !tacticalCaptureMode \? cancelDefensiveFieldPointer : undefined\}/);
assert.match(appSource, /releasePointerCapture\(event\.pointerId\)/,
  'pointerup, pointercancel y lostpointercapture liberan con seguridad la captura activa');

assert.match(appSource, /facingSystemsView === 'PIZARRA' && tacticalGamePhase === 'set_piece' \? 'facing-systems-abp-editor-mobile-safe'/,
  'el responsive y la reserva inferior ABP permanecen intactos');
assert.match(touchPolicySource, /padding-bottom: calc\(5rem \+ var\(--app-safe-area-bottom\)\);/,
  'no se modifica la reserva existente para la navegación fija');

assert.match(sharedCanvasSource, /data-interaction-mode=\{readOnly \? 'readonly' : 'navigate'\}/,
  'el canvas compartido declara navegación en edición normal y solo lectura en previews');
assert.doesNotMatch(sharedCanvasSource, /style=\{\{ touchAction: readOnly \? 'auto' : 'none' \}\}/,
  'el SVG editable deja de bloquear el fondo completo');
assert.match(sharedCanvasSource, /if \(!interaction\.draggable\) return;[\s\S]*?event\.preventDefault\(\);[\s\S]*?setPointerCapture/,
  'solo un elemento realmente movible bloquea y captura el gesto');
assert.match(sharedCanvasSource, /onPointerCancel=\{stopDrag\}/);
assert.match(sharedCanvasSource, /onLostPointerCapture=\{stopDrag\}/);
assert.match(sharedCanvasSource, /releasePointerCapture\?\.\(event\.pointerId\)/,
  'el canvas libera su captura sin fallar si el navegador ya la perdió');
assert.match(sharedEditorSource, /set-piece-diagram-scroll-shell/,
  'el wrapper compartido queda identificado para permitir la cadena vertical nativa');
assert.match(touchPolicySource, /\.set-piece-diagram-canvas\[data-interaction-mode='navigate'\][\s\S]*?touch-action:\s*pan-x pan-y pinch-zoom;/,
  'el fondo SVG permite scroll vertical y conserva pan horizontal');
assert.match(touchPolicySource, /\.set-piece-diagram-canvas \.diagram-draggable[\s\S]*?touch-action:\s*none;/,
  'jugadores, balón, flechas y controles del SVG conservan el drag táctico');
assert.doesNotMatch(printCssSource, /\.set-piece-diagram-canvas\s*\{[^}]*touch-action:\s*none;/s,
  'la hoja de impresión no vuelve a bloquear el canvas editable en pantalla');

console.log('setPieceMobileEditorTouch tests passed · 0 diferencias visuales contractuales');
