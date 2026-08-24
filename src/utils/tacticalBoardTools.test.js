import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const toolbarStart = appSource.indexOf('<span className="mr-1 text-[8px] font-black uppercase tracking-[0.16em] text-slate-500">Visualización</span>');
const toolbarEnd = appSource.indexOf('<div\n                className="tactical-board-scroll"', toolbarStart);
const toolbarSource = appSource.slice(toolbarStart, toolbarEnd);
const captureStart = appSource.indexOf("if (tacticalCaptureMode && typeof document !== 'undefined')");
const captureEnd = appSource.indexOf("<div className={isPreTalkMode ? 'space-y-4' : 'space-y-5'}>", captureStart);
const captureSource = appSource.slice(captureStart, captureEnd);

assert.ok(toolbarStart > 0 && toolbarEnd > toolbarStart, 'la barra normal se localiza de forma inequívoca');
['Visualización', 'Edición', 'Trazados', 'Historial'].forEach((group) => {
  assert.match(toolbarSource, new RegExp(`>${group}<`), `${group} conserva su grupo visual`);
});

assert.match(toolbarSource, /\['move', 'Mover', 'Recolocar jugadores'\]/);
assert.match(toolbarSource, /\['select', 'Seleccionar', 'Seleccionar pases o movimientos'\]/);
assert.match(toolbarSource, /\['pass', 'Pase', 'Dibujar trayectoria de pase'\]/);
assert.match(toolbarSource, /\['movement', 'Movimiento', 'Dibujar desplazamiento táctico'\]/);
assert.match(toolbarSource, /aria-pressed=\{defensiveTool === tool\}/, 'la herramienta activa mantiene una única señal de estado');
assert.match(toolbarSource, /title="Eliminar el trazado o balón seleccionado"/);
assert.match(toolbarSource, /title="Deshacer la última edición de la jugada"/);
assert.match(toolbarSource, /title="Recuperar el preset de la fase y situación actuales"/);

assert.match(toolbarSource, />Elementos</);
assert.match(toolbarSource, /aria-pressed=\{defensiveTool === 'ball'\}/);
assert.match(toolbarSource, /activateTacticalBoardTool\('ball'\)/, 'Balón es un modo principal explícito y solo puede haber uno por jugada');
assert.match(toolbarSource, /Haz clic en el campo para colocar el único balón de la jugada/);
assert.match(toolbarSource, /Mover está disponible\. Crea una jugada para añadir y guardar pases o movimientos\./);
assert.match(toolbarSource, /Trazado seleccionado/);
assert.match(toolbarSource, /Convertir en curva/);
assert.match(toolbarSource, /Enderezar/);
assert.match(toolbarSource, /Duplicar/);
assert.match(toolbarSource, /Balón seleccionado/);

['names', 'zones', 'badges', 'rival', 'caudal', 'connections'].forEach((layer) => {
  assert.match(toolbarSource, new RegExp(`\\['${layer}',`), `${layer} sigue siendo una capa de visualización`);
});
assert.match(toolbarSource, /updateFieldViewSettings\(\{ layers:/, 'los toggles no se mezclan con defensiveTool');

assert.match(appSource, /useState\('move'\)/);
assert.match(appSource, /\['pass', 'movement'\]\.includes\(defensiveTool\)/, 'solo pase y movimiento inician trazados');
assert.match(appSource, /strokeDasharray=\{arrow\.type === 'movement' \? '8 6' : undefined\}/, 'movimiento mantiene el trazo discontinuo y pase el continuo');
assert.match(appSource, /if \(tacticalCaptureMode \|\| defensiveTool !== 'move'\) return;/, 'pase y movimiento no recolocan jugadores');
assert.match(appSource, /if \(tacticalCaptureMode \|\| defensiveTool !== 'move' \|\| !selectedDefensivePlay \|\| !tacticalBallVisible\) return;/, 'el balón solo se arrastra con Mover');

assert.match(appSource, /arrows: play\.arrows\.filter\(\(arrow\) => arrow\.id !== selectedTacticalArrow\.id\)/, 'Borrar elimina únicamente el trazado seleccionado');
assert.match(appSource, /updateTacticalPlay\(selectedDefensivePlay\.id, \{ ballVisible: false \}\)/, 'Borrar oculta el único balón sin destruir el contexto ABP');
assert.match(appSource, /playerPositions:[\s\S]*arrows:[\s\S]*ballStartPosition:/, 'el snapshot de deshacer conserva posiciones, trazados y balón');
assert.match(appSource, /updateTacticalPlay\(snapshot\.playId, \{[\s\S]*playerPositions: snapshot\.playerPositions,[\s\S]*arrows: snapshot\.arrows,[\s\S]*ballStartPosition/, 'Deshacer restaura el contrato completo de la jugada');

assert.match(appSource, /normalizeTacticalBoardArrows\(play\.arrows\)/, 'todos los workspaces usan el normalizador compatible con curvas');
assert.match(appSource, /onPointerDown=\{selectOrMoveTacticalBall\}/);
assert.match(appSource, /onPointerDown=\{\(event\) => beginDefensiveArrowHandleDrag\(event, arrow\.id, 'start'\)\}/);
assert.match(appSource, /beginDefensiveArrowHandleDrag\(event, arrow\.id, 'controlPoint'\)/);
assert.match(appSource, /beginDefensiveArrowHandleDrag\(event, arrow\.id, 'end'\)/);
assert.match(appSource, /getTacticalBoardArrowPath\(arrow\)/, 'rectas y curvas comparten el mismo renderer');
assert.match(appSource, /ballVisible: snapshot\.ballVisible/, 'Deshacer también restaura adición o eliminación del balón');

assert.ok(captureStart > 0 && captureEnd > captureStart, 'el modo captura conserva una rama exclusiva');
assert.doesNotMatch(captureSource, /Visualización|Edición|Trazados|Elementos|Historial|setDefensiveTool/, 'captura no expone herramientas de edición');
assert.match(captureSource, /renderFacingSystemsOverview\(true\)/, 'captura sigue mostrando el mismo contenido táctico');

console.log('tacticalBoardTools tests passed');
