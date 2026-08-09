import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildSetPiecePrintPages,
  buildSetPiecePrintPlayModel,
  chunkSetPiecePrintPlays,
  getMeaningfulSetPiecePrintText,
} from './setPiecePrintModel.js';
import {
  getSetPieceGeometrySnapshot,
  setSetPieceTacticalMeta,
} from './setPieceProfessional.js';

const sheet = fs.readFileSync(new URL('../components/print/SetPieceDiagramPrintSheet.jsx', import.meta.url), 'utf8');
const editor = fs.readFileSync(new URL('../components/print/SetPieceDiagramEditor.jsx', import.meta.url), 'utf8');
const canvas = fs.readFileSync(new URL('../components/print/SetPieceDiagramCanvas.jsx', import.meta.url), 'utf8');
const toolbar = fs.readFileSync(new URL('../components/print/SetPieceDiagramToolbar.jsx', import.meta.url), 'utf8');
const matchPrint = fs.readFileSync(new URL('../components/print/MatchPrintTab.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../styles/print.css', import.meta.url), 'utf8');
const proCss = css.slice(css.indexOf('.set-piece-pro-sheet'), css.indexOf('@page portrait'));

assert.ok(sheet.includes('buildSetPiecePrintPages(diagrams, players)'), 'renderer y vista previa consumen un único modelo de impresión');
assert.ok(sheet.includes('abp-print-page'), 'cada bloque de dos jugadas se renderiza como una página independiente');
assert.equal((sheet.match(/<article/g) || []).length, 1, 'el renderer crea un nodo por página de impresión');
assert.ok(sheet.includes('play.chronology.map'), 'se imprimen todos los pasos cronológicos');
assert.equal(sheet.includes('chronology.slice'), false, 'la cronología no se corta silenciosamente');
assert.ok(css.includes('grid-template-rows: repeat(2, minmax(0, 1fr))'), 'la hoja se divide en dos mitades');
assert.ok(css.includes('font-size: 12.5pt'), 'el título supera el mínimo de 11 pt');
assert.ok(css.includes('font-size: 9.3pt'), 'la consigna respeta el mínimo de 9 pt');
assert.ok(css.includes('font-size: 8.5pt'), 'la secuencia respeta el mínimo operativo');
assert.equal(proCss.includes('text-overflow: ellipsis'), false, 'el layout ABP no utiliza elipsis');
assert.equal(proCss.includes('white-space: nowrap'), false, 'el layout ABP permite envolver instrucciones');
assert.ok(css.includes('size: A4 landscape') && css.includes('width: 297mm') && css.includes('height: 210mm'), 'el dossier utiliza una hoja A4 horizontal real');
assert.ok(css.includes('body.printing-set-piece-preview > #root'), 'la vista previa elimina el nodo de impresión duplicado');
assert.ok(matchPrint.includes('cloneSetPieceElementsWithFreshIds'), 'duplicar jugada regenera IDs internos');
assert.ok(matchPrint.includes("libraryId: String(item.id || '')"), 'la instancia conserva libraryId');
assert.ok(matchPrint.includes("linkStatus: 'linked'"), 'la instancia conserva el estado de vinculación');
assert.equal(editor.includes("['variants', 'Variantes']"), false, 'la interfaz no anuncia variantes gráficas');
assert.equal(editor.includes('Participa en Variante'), false, 'la participación ficticia en variantes desaparece');
assert.ok(editor.includes('label="Alternativa"'), 'solo queda Alternativa textual');
assert.ok(toolbar.indexOf("['block', 'Bloqueo']") > toolbar.indexOf("label: 'TRAZADO'") && toolbar.indexOf("['block', 'Bloqueo']") < toolbar.indexOf("label: 'ANOTACIONES'"), 'Bloqueo pertenece a Trazado');

const baseElements = [
  ...Array.from({ length: 5 }, (_, index) => ({ id: `player-${index + 1}`, type: 'player', x: 20 + index * 11, y: 28 + index, label: String(index + 1), name: ['Agus Porto', 'Mario Boza', 'Pablo Acerete', 'Julio Delgado', 'Dani Blanco'][index], roles: [['Lanzador'], ['Bloqueador'], ['Rematador'], ['Arrastre'], ['Vigilancia']][index], note: ['Pase al primer palo', 'Fija al defensor', 'Ataca la zona', 'Libera el pasillo', 'Equilibra la segunda jugada'][index], sequenceOrder: index + 1 })),
  { id: 'arrow-1', type: 'curved_arrow', x1: 20, y1: 28, x2: 72, y2: 17, controlX: 54, controlY: 42, curvature: -8 },
  { id: 'arrow-2', type: 'dashed_arrow', x1: 30, y1: 38, x2: 66, y2: 21 },
  { id: 'block-1', type: 'block', x: 46, y: 25, width: 7, label: 'BLOQUEO' },
  { id: 'zone-1', type: 'zone', x: 62, y: 9, width: 22, height: 12, label: 'ZONA' },
  { id: 'text-1', type: 'text', x: 52, y: 45, label: 'SEGUNDA JUGADA' },
];
const printMeta = {
  objective: 'Liberar segundo palo',
  generalInstruction: 'Fijar y atacar con tres alturas.',
  whenToUse: 'Ante marcaje zonal.',
  risk: 'Pérdida sin vigilancia.',
  alternative: 'Saque corto.',
  observations: 'Confirmar perfil del lanzador.',
  libraryZone: 'Segundo palo',
  libraryMechanism: 'Bloqueo',
  libraryMarking: 'Zonal',
  printIdentityMode: 'number-and-abbreviation',
};
const createPlay = (id, order, meta = printMeta) => ({ id, orden: order, tipo: 'corner_ofensivo', titulo: `Jugada ${order}`, elements: setSetPieceTacticalMeta(baseElements, meta) });

assert.deepEqual([1, 2, 3, 4, 5, 6].map((count) => buildSetPiecePrintPages(Array.from({ length: count }, (_, index) => createPlay(`play-${index + 1}`, index + 1))).length), [1, 1, 2, 2, 3, 3], '1–6 jugadas generan exactamente 1, 1, 2, 2, 3 y 3 páginas');
assert.deepEqual(chunkSetPiecePrintPlays(Array.from({ length: 6 }, (_, index) => index + 1), 2).map((page) => page.length), [2, 2, 2], 'nunca se agrupan tres jugadas en una hoja');
const threePlayPages = buildSetPiecePrintPages([createPlay('one', 1), createPlay('two', 2), createPlay('three', 3)]);
assert.equal(threePlayPages.every((page) => page.plays.length > 0), true, 'no se generan páginas blancas');
assert.deepEqual(threePlayPages.flatMap((page) => page.plays.map((play) => play.id)), ['one', 'two', 'three'], 'no hay duplicaciones en una última página impar');

const sourcePlay = createPlay('geometry', 1);
const sourceIds = sourcePlay.elements.map((element) => element.id);
const printModel = buildSetPiecePrintPlayModel(sourcePlay, [], 1);
assert.deepEqual(getSetPieceGeometrySnapshot(printModel.elements), getSetPieceGeometrySnapshot(sourcePlay.elements), 'coordenadas editor e impresión son idénticas');
assert.deepEqual(sourcePlay.elements.map((element) => element.id), sourceIds, 'renderizar no modifica IDs');
const printArrow = printModel.elements.find((element) => element.id === 'arrow-1');
assert.deepEqual({ x1: printArrow.x1, y1: printArrow.y1, x2: printArrow.x2, y2: printArrow.y2, controlX: printArrow.controlX, controlY: printArrow.controlY, curvature: printArrow.curvature }, { x1: 20, y1: 28, x2: 72, y2: 17, controlX: 54, controlY: 42, curvature: -8 }, 'la flecha mantiene origen, destino y curvatura');
const printBlock = printModel.elements.find((element) => element.id === 'block-1');
assert.deepEqual({ x: printBlock.x, y: printBlock.y, width: printBlock.width }, { x: 46, y: 25, width: 7 }, 'el bloqueo mantiene su posición y tamaño');
assert.equal(printModel.chronology.length, 5, 'la secuencia conserva cinco pasos completos');
assert.equal(printModel.chronology.every((step) => step.identity && step.role && step.instruction), true, 'la secuencia utiliza identidad, rol e instrucción realmente almacenada');
assert.equal(new Set(printModel.chronology.map((step) => step.identity)).size, 5, 'las identidades abreviadas son estables y únicas en la jugada');
const chronologyOffPlay = createPlay('chronology-off', 1, {
  ...printMeta,
  displayLayers: { dorsals: true, abbreviations: true, roles: true, chronology: false, zones: true, texts: true },
});
const chronologyOffModel = buildSetPiecePrintPlayModel(chronologyOffPlay, [], 1);
assert.deepEqual(chronologyOffModel.chronology, [], 'Cronología OFF elimina por completo la Secuencia del preview y PDF');
assert.equal(chronologyOffModel.displayLayers.chronology, false, 'el dossier consume la capa persistida, no un estado local');
assert.deepEqual(getSetPieceGeometrySnapshot(chronologyOffModel.elements), getSetPieceGeometrySnapshot(chronologyOffPlay.elements), 'ocultar cronología no modifica geometría ni datos');

const rolesOffModel = buildSetPiecePrintPlayModel(createPlay('roles-off', 1, {
  ...printMeta,
  displayLayers: { dorsals: true, abbreviations: true, roles: false, chronology: true, zones: true, texts: true },
}), [], 1);
assert.equal(rolesOffModel.chronology.every((step) => step.role === ''), true, 'Roles OFF conserva la secuencia pero no imprime roles');

const dorsalsOnlyModel = buildSetPiecePrintPlayModel(createPlay('dorsals-only', 1, {
  ...printMeta,
  displayLayers: { dorsals: true, abbreviations: false, roles: true, chronology: true, zones: true, texts: true },
}), [], 1);
assert.deepEqual(dorsalsOnlyModel.chronology.map((step) => step.identity), ['1', '2', '3', '4', '5'], 'Dorsales ON y Abreviaturas OFF imprime solo dorsales');

const abbreviationsOnlyModel = buildSetPiecePrintPlayModel(createPlay('abbreviations-only', 1, {
  ...printMeta,
  displayLayers: { dorsals: false, abbreviations: true, roles: true, chronology: true, zones: true, texts: true },
}), [], 1);
assert.equal(abbreviationsOnlyModel.chronology.every((step) => step.identity && !/^\d+$/.test(step.identity)), true, 'Dorsales OFF y Abreviaturas ON imprime solo abreviaturas');

const noIdentityModel = buildSetPiecePrintPlayModel(createPlay('no-identity', 1, {
  ...printMeta,
  displayLayers: { dorsals: false, abbreviations: false, roles: true, chronology: true, zones: false, texts: false },
}), [], 1);
assert.equal(noIdentityModel.chronology.every((step) => step.identity === ''), true, 'el PDF no fuerza una identidad cuando ambas capas están ocultas');
assert.equal(noIdentityModel.displayLayers.zones || noIdentityModel.displayLayers.texts, false, 'Zonas y Textos OFF llegan al renderer de impresión');

assert.equal(getMeaningfulSetPiecePrintText('Consigna pendiente de definir'), '');
assert.equal(getMeaningfulSetPiecePrintText('Sin observaciones.'), '');
const emptyModel = buildSetPiecePrintPlayModel(createPlay('empty', 1, { generalInstruction: 'Consigna pendiente de definir', objective: 'Sin definir', risk: 'Sin riesgo', alternative: 'Sin alternativa', observations: 'Sin observaciones' }));
assert.equal(emptyModel.instruction || emptyModel.objective || emptyModel.risk || emptyModel.alternative || emptyModel.observations, '', 'los placeholders no generan bloques');
assert.deepEqual(emptyModel.classifications, [], 'clasificaciones vacías no generan etiquetas');
assert.deepEqual(printModel.classifications, ['Segundo palo', 'Bloqueo', 'Zonal'], 'solo se incluyen clasificaciones definidas');
assert.equal((sheet.match(/<h3>Consigna<\/h3>/g) || []).length, 1, 'la consigna se renderiza una sola vez por jugada');
assert.ok(sheet.includes('visibleLayers={play.displayLayers}'), 'preview y PDF respetan las capas persistidas de cada jugada');
assert.equal(sheet.includes('visibleLayers={{ numbers: true'), false, 'el dossier ya no fuerza capas propias');
assert.ok(sheet.includes('set-piece-print-play-body--field-forward') && css.includes('.set-piece-print-play-body--field-forward'), 'sin consigna ni cronología el campo aprovecha el espacio liberado');
assert.ok(canvas.includes("element.type === 'zone'") && canvas.includes("['text', 'text_box'].includes(element.type)"), 'Zonas y Textos se ocultan solo en render, sin borrar datos');
assert.ok(canvas.includes('const showDorsal = normalizedVisibleLayers.dorsals') && canvas.includes('const showAbbreviation = normalizedVisibleLayers.abbreviations'), 'Dorsales y Abreviaturas admiten las cuatro combinaciones sin fallback automático');
assert.ok(editor.includes('{visibleLayers.chronology ? <section') && sheet.includes('play.chronology.length > 0'), 'Cronología OFF elimina el bloque inferior del editor y la Secuencia impresa');
assert.ok(sheet.includes("step.role ? <span>{step.identity ? ' · ' : ''}{step.role}</span> : null"), 'Roles OFF no deja etiquetas de rol en la Secuencia');
assert.ok(canvas.includes('selected && !readOnly') && canvas.includes('set-piece-curve-control'), 'el punto de control solo existe como ayuda de edición y no aparece en preview/PDF');
assert.ok(sheet.includes('preparedForPrint') && sheet.includes('data-render-model="set-piece-print"'), 'preview y PDF comparten elementos preparados y el mismo renderer táctico');

console.log('setPiecePrintLayout tests passed');
