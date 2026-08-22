import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SET_PIECE_HEADER_MENUS, transitionSetPieceHeaderMenu } from './setPieceHeaderMenu.js';

const toggle = (openMenu, menu) => transitionSetPieceHeaderMenu(openMenu, { type: 'toggle', menu });

assert.equal(toggle(null, SET_PIECE_HEADER_MENUS.MANAGE), 'manage', 'A: Gestionar se abre al primer click');
assert.equal(toggle('manage', SET_PIECE_HEADER_MENUS.MANAGE), null, 'B: Gestionar se cierra al segundo click');
assert.equal(transitionSetPieceHeaderMenu('manage', { type: 'pointerdown', inside: false }), null, 'C: un pointerdown exterior cierra el menú');
assert.equal(transitionSetPieceHeaderMenu('manage', { type: 'pointerdown', inside: true }), 'manage', 'un pointerdown dentro del menú no lo cierra antes de seleccionar');
assert.equal(transitionSetPieceHeaderMenu('manage', { type: 'keydown', key: 'Escape' }), null, 'D: Escape cierra el menú');
assert.equal(transitionSetPieceHeaderMenu('manage', { type: 'keydown', key: 'ArrowDown' }), 'manage', 'otras teclas no bloquean ni cierran el menú');
assert.equal(transitionSetPieceHeaderMenu('manage', { type: 'select' }), null, 'E: seleccionar una opción cierra el menú');
assert.equal(toggle('manage', SET_PIECE_HEADER_MENUS.LIBRARY), 'library', 'F: abrir Biblioteca sustituye a Gestionar');
assert.equal(toggle('library', SET_PIECE_HEADER_MENUS.TRANSFORM), 'transform', 'solo puede quedar abierto un menú de cabecera');
assert.equal(transitionSetPieceHeaderMenu('manage', { type: 'context-change' }), null, 'G: cambiar de jugada o tipo ABP cierra el menú');

const componentSource = fs.readFileSync(new URL('../components/print/MatchPrintTab.jsx', import.meta.url), 'utf8');
assert.match(componentSource, /const \[openMenu, setOpenMenu\] = useState\(null\)/, 'la cabecera usa un único estado de menú');
assert.match(componentSource, /document\.addEventListener\('pointerdown', handlePointerDown\)/, 'el cierre exterior usa pointerdown global');
assert.match(componentSource, /document\.removeEventListener\('pointerdown', handlePointerDown\)/, 'el listener pointerdown se limpia');
assert.match(componentSource, /document\.addEventListener\('keydown', handleKeyDown\)/, 'Escape usa listener global de teclado');
assert.match(componentSource, /document\.removeEventListener\('keydown', handleKeyDown\)/, 'el listener de teclado se limpia');
assert.match(componentSource, /aria-expanded=\{open\}/, 'los botones publican el estado expandido');
assert.match(componentSource, /aria-haspopup="menu"/, 'los botones anuncian un menú contextual');
assert.match(componentSource, /role="menu"/, 'el panel usa semántica de menú');
assert.match(componentSource, /role: 'menuitem'/, 'las opciones usan semántica de elemento de menú');
assert.doesNotMatch(componentSource.slice(componentSource.indexOf('function SetPieceActionsMenu'), componentSource.indexOf('function SetPieceEditorHeader')), /<details|<summary/, 'los menús flotantes ya no dependen de details nativos sin control');

console.log('Set piece header menu interaction tests passed');
