import assert from 'node:assert/strict';
import fs from 'node:fs';

const sheet = fs.readFileSync(new URL('../components/print/SetPieceDiagramPrintSheet.jsx', import.meta.url), 'utf8');
const editor = fs.readFileSync(new URL('../components/print/SetPieceDiagramEditor.jsx', import.meta.url), 'utf8');
const toolbar = fs.readFileSync(new URL('../components/print/SetPieceDiagramToolbar.jsx', import.meta.url), 'utf8');
const matchPrint = fs.readFileSync(new URL('../components/print/MatchPrintTab.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../styles/print.css', import.meta.url), 'utf8');
const proCss = css.slice(css.indexOf('.set-piece-pro-sheet'), css.indexOf('@page portrait'));

assert.ok(sheet.includes('const pageDiagrams = diagrams.slice(0, 2)'), 'cada hoja admite como máximo dos jugadas');
assert.equal((sheet.match(/<article/g) || []).length, 1, 'el renderer crea un único nodo de hoja');
assert.ok(sheet.includes('chronology.map'), 'se imprimen todos los pasos cronológicos');
assert.equal(sheet.includes('chronology.slice'), false, 'la cronología no se corta silenciosamente');
assert.ok(css.includes('grid-template-rows: repeat(2, minmax(0, 1fr))'), 'la hoja se divide en dos mitades');
assert.ok(css.includes('font-size: 14pt'), 'el título supera el mínimo de 12 pt');
assert.ok(css.includes('font-size: 9pt'), 'la consigna respeta el mínimo de 9 pt');
assert.ok(css.includes('font-size: 8pt'), 'la cronología respeta el mínimo de 8 pt');
assert.equal(proCss.includes('text-overflow: ellipsis'), false, 'el layout ABP no utiliza elipsis');
assert.equal(proCss.includes('white-space: nowrap'), false, 'el layout ABP permite envolver instrucciones');
assert.ok(css.includes('body.printing-set-piece-preview > #root'), 'la vista previa elimina el nodo de impresión duplicado');
assert.ok(matchPrint.includes('cloneSetPieceElementsWithFreshIds'), 'duplicar jugada regenera IDs internos');
assert.ok(matchPrint.includes("libraryId: String(item.id || '')"), 'la instancia conserva libraryId');
assert.ok(matchPrint.includes("linkStatus: 'linked'"), 'la instancia conserva el estado de vinculación');
assert.equal(editor.includes("['variants', 'Variantes']"), false, 'la interfaz no anuncia variantes gráficas');
assert.equal(editor.includes('Participa en Variante'), false, 'la participación ficticia en variantes desaparece');
assert.ok(editor.includes('label="Alternativa"'), 'solo queda Alternativa textual');
assert.ok(toolbar.indexOf("['block', 'Bloqueo']") < toolbar.indexOf("label: 'Anotaciones'"), 'Bloqueo pertenece a Dibujo');

console.log('setPiecePrintLayout tests passed');
