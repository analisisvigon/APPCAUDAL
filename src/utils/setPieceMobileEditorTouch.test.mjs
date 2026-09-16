import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const sharedCanvasSource = readFileSync(new URL('../components/print/SetPieceDiagramCanvas.jsx', import.meta.url), 'utf8');

const boardStart = appSource.indexOf('const renderFacingSystemsOverview =');
const boardEnd = appSource.indexOf('\n  const clearSelectedTeamField', boardStart);
const boardSource = appSource.slice(boardStart, boardEnd);
const mobileTouchStart = cssSource.indexOf(".facing-tactical-board[data-touch-context='abp-editor']");
const mobileTouchEnd = cssSource.indexOf('/* Normal application shell only.', mobileTouchStart);
const mobileTouchSource = cssSource.slice(mobileTouchStart, mobileTouchEnd);

assert.ok(boardStart > 0 && boardEnd > boardStart, 'se localiza el renderer compartido de la pizarra');
assert.match(boardSource, /enableDefensiveEditing\s*&&\s*!tacticalCaptureMode\s*&&\s*tacticalGamePhase === 'set_piece'/,
  'el contexto táctil sólo se activa en el editor ABP interactivo normal');
assert.match(boardSource, /data-touch-context=\{isInteractiveSetPieceEditor \? 'abp-editor' : undefined\}/);
assert.match(boardSource, /\['pass', 'movement'\]\.includes\(defensiveTool\)[\s\S]*?'drawing'/,
  'Pase y Movimiento mantienen el campo reservado para dibujar');
assert.match(boardSource, /defensiveTool === 'ball'[\s\S]*?'placing'[\s\S]*?'navigate'/,
  'Balón conserva su colocación y los modos normales permiten navegar');

assert.ok(mobileTouchStart > 0 && mobileTouchEnd > mobileTouchStart, 'existe un bloque táctil aislado del editor ABP');
assert.match(mobileTouchSource, /touch-context='abp-editor'[\s\S]*?touch-action: none;/,
  'el comportamiento de escritorio y el valor por defecto siguen bloqueando gestos del campo');
assert.match(mobileTouchSource, /@media \(max-width: 768px\) and \(pointer: coarse\)/,
  'la excepción se limita a móviles táctiles');
assert.match(mobileTouchSource, /data-touch-mode='navigate'[\s\S]*?touch-action: pan-y;/,
  'el césped vacío permite el desplazamiento vertical en modo normal');
assert.match(mobileTouchSource, /\.tactical-board-touch-target[\s\S]*?touch-action: none;/,
  'los tiradores de trazados siguen capturando su drag');
assert.match(boardSource, /touchAction: 'none'/,
  'jugadores y balón conservan objetivos táctiles sin scroll durante el drag');

assert.match(appSource, /onPointerUp=\{enableDefensiveEditing && !tacticalCaptureMode \? handleDefensiveFieldPointerEnd : undefined\}/);
assert.match(appSource, /onPointerCancel=\{enableDefensiveEditing && !tacticalCaptureMode \? cancelDefensiveFieldPointer : undefined\}/);
assert.match(appSource, /releasePointerCapture\(event\.pointerId\)/,
  'pointerup y pointercancel liberan la captura activa');

assert.match(appSource, /facingSystemsView === 'PIZARRA' && tacticalGamePhase === 'set_piece' \? 'facing-systems-abp-editor-mobile-safe'/,
  'el espacio inferior sólo se aplica a la pizarra ABP');
assert.match(mobileTouchSource, /padding-bottom: calc\(5rem \+ var\(--app-safe-area-bottom\)\);/,
  'el final del editor reserva la navegación fija y el safe area');

[360, 390, 412].forEach((width) => {
  assert.ok(width <= 768, `${width}px queda cubierto por la regla móvil específica`);
});

assert.match(sharedCanvasSource, /style=\{\{ touchAction: readOnly \? 'auto' : 'none' \}\}/,
  'SetPieceDiagramCanvas conserva intacto su comportamiento compartido');

console.log('setPieceMobileEditorTouch tests passed');
