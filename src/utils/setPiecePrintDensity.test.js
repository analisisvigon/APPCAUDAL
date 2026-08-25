import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  areSetPieceLabelsEquivalent,
  buildSetPiecePrintPages,
  buildSetPiecePrintPlayModel,
} from './setPiecePrintModel.js';

const diagram = (order, type = 'corner_defensivo', title = 'Córner defensivo') => ({
  id: `play-${order}`,
  orden: order,
  tipo: type,
  titulo: title,
  elements: [],
});

const singlePlay = buildSetPiecePrintPages([diagram(1)]).flatMap((page) => page.plays);
assert.equal(singlePlay[0].showPlayNumber, false, 'A: una única jugada no muestra JUGADA 1');

const twoPlays = buildSetPiecePrintPages([
  diagram(1, 'corner_defensivo', 'Mixto primer palo'),
  diagram(2, 'corner_defensivo', 'Mixto segundo palo'),
]).flatMap((page) => page.plays);
assert.deepEqual(twoPlays.map((play) => [play.order, play.showPlayNumber]), [[1, true], [2, true]], 'B: dos jugadas muestran JUGADA 1 y JUGADA 2');
const thirdPlayOnItsOwnPage = buildSetPiecePrintPages([diagram(3)], [], { totalPlayCount: 3, startOrder: 3 }).flatMap((page) => page.plays);
assert.deepEqual(thirdPlayOnItsOwnPage.map((play) => [play.order, play.showPlayNumber]), [[3, true]], 'una tercera jugada conserva JUGADA 3 aunque ocupe sola su página');

const repeatedTitle = buildSetPiecePrintPlayModel(diagram(1, 'corner_defensivo', 'Córner defensivo'));
assert.equal(repeatedTitle.typeLabel, 'Córner defensivo');
assert.equal(repeatedTitle.displayTitle, '', 'C: el nombre equivalente al tipo no se representa por segunda vez');
assert.equal(repeatedTitle.title, 'Córner defensivo', 'el dato original permanece disponible y no se modifica');

const meaningfulTitle = buildSetPiecePrintPlayModel(diagram(1, 'corner_defensivo', 'Mixto segundo palo'));
assert.equal(meaningfulTitle.typeLabel, 'Córner defensivo');
assert.equal(meaningfulTitle.displayTitle, 'Mixto segundo palo', 'D: un nombre táctico diferente se conserva junto al tipo');

assert.equal(areSetPieceLabelsEquivalent('CORNER_DEFENSIVO', 'Córner defensivo'), true, 'E: formato interno, guiones bajos y tildes se normalizan');
assert.equal(areSetPieceLabelsEquivalent('falta-lateral_defensiva', 'Falta lateral defensiva'), true, 'guiones, espacios y capitalización no crean duplicados');
assert.equal(areSetPieceLabelsEquivalent('Saque de inicio', 'Saque de inicio 1', 1), true, 'un sufijo de orden automático no convierte el tipo en un nombre distinto');
assert.equal(areSetPieceLabelsEquivalent('Córner defensivo', 'Mixto segundo palo', 1), false, 'la comparación no elimina títulos tácticos distintos');

const sheetSource = fs.readFileSync(new URL('../components/print/SetPieceDiagramPrintSheet.jsx', import.meta.url), 'utf8');
const editorSource = fs.readFileSync(new URL('../components/print/SetPieceDiagramEditor.jsx', import.meta.url), 'utf8');
const matchPrintSource = fs.readFileSync(new URL('../components/print/MatchPrintTab.jsx', import.meta.url), 'utf8');
const laboratorySource = fs.readFileSync(new URL('../components/library/SetPieceLaboratory.jsx', import.meta.url), 'utf8');
const cssSource = fs.readFileSync(new URL('../styles/print.css', import.meta.url), 'utf8');
assert.match(sheetSource, /buildSetPiecePrintPages\(diagrams, players, \{ totalPlayCount, startOrder \}\)/, 'F: preview y PDF consumen el mismo modelo con el total y el desplazamiento de sección');
assert.match(editorSource, /preview totalPlayCount=\{totalPlayCount\}/, 'F: la vista previa comunica el total real al renderer PDF');
assert.match(matchPrintSource, /totalPlayCount=\{dossierContent\.defensiveDiagrams\.length\}/, 'F: el dossier conserva la numeración aunque una página aislada contenga una sola jugada de varias');
assert.match(matchPrintSource, /if \(diagrams\.length <= 1\) return null;/, 'el editor tampoco reserva el selector JUGADA 1 cuando solo existe una');
assert.match(sheetSource, /play\.showPlayNumber \? <span>Jugada \{play\.order\}<\/span> : null/, 'el rótulo genérico se renderiza condicionalmente');
assert.match(sheetSource, /play\.displayTitle \? <h2>\{play\.displayTitle\}<\/h2> : null/, 'el título equivalente no deja un nodo vacío');
assert.match(cssSource, /\.set-piece-print-play\[data-has-title="false"\][\s\S]*grid-template-rows: auto minmax\(0, 1fr\)/, 'un título omitido no reserva su altura anterior');
assert.match(laboratorySource, /areSetPieceLabelsEquivalent\(classificationLabel, item\.nombre, item\.orden\)/, 'la vista previa y las tarjetas de Biblioteca reutilizan la misma equivalencia');
assert.match(matchPrintSource, /const displayName = areSetPieceLabelsEquivalent\(classificationLabel, item\.nombre, item\.orden\)/, 'el selector de Biblioteca tampoco duplica tipo y nombre equivalentes');

console.log('setPiecePrintDensity tests passed');
