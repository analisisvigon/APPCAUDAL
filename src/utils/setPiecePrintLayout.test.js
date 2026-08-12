import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildSetPiecePrintPages,
  buildSetPiecePrintPlayModel,
  chunkSetPiecePrintPlays,
  getMeaningfulSetPiecePrintText,
  paginateSetPiecePrintPlays,
  shouldUseSingleSetPiecePrintPage,
} from './setPiecePrintModel.js';
import {
  getSetPieceGeometrySnapshot,
  setSetPieceTacticalMeta,
} from './setPieceProfessional.js';

const sheet = fs.readFileSync(new URL('../components/print/SetPieceDiagramPrintSheet.jsx', import.meta.url), 'utf8');
const lineupSheet = fs.readFileSync(new URL('../components/print/LineupPrintSheet.jsx', import.meta.url), 'utf8');
const takersSheet = fs.readFileSync(new URL('../components/print/SetPieceTakersPrintSheet.jsx', import.meta.url), 'utf8');
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
  { id: 'arrow-3', type: 'curved_arrow', dashed: true, x1: 18, y1: 46, x2: 74, y2: 24, controlX: 58, controlY: 52 },
  { id: 'block-1', type: 'block', x: 46, y: 25, width: 7, label: 'BLOQUEO' },
  { id: 'zone-1', type: 'zone', x: 62, y: 9, width: 22, height: 12, label: 'ZONA' },
  { id: 'text-1', type: 'text', x: 52, y: 45, label: 'SEGUNDA JUGADA' },
];
const printMeta = {
  signal: 'MANO ARRIBA',
  objective: 'Liberar segundo palo',
  generalInstruction: 'Fijar y atacar con tres alturas.',
  whenToUse: 'Ante marcaje zonal.',
  risk: 'Pérdida sin vigilancia.',
  alternative: 'Saque corto.',
  observations: 'Confirmar perfil del lanzador.',
  libraryZone: 'Segundo palo',
  libraryMechanism: 'Bloqueo',
  libraryMarking: 'Zonal',
  deliveryType: 'closed',
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
const printDashedCurve = printModel.elements.find((element) => element.id === 'arrow-3');
assert.deepEqual({ type: printDashedCurve.type, dashed: printDashedCurve.dashed, x1: printDashedCurve.x1, y1: printDashedCurve.y1, x2: printDashedCurve.x2, y2: printDashedCurve.y2, controlX: printDashedCurve.controlX, controlY: printDashedCurve.controlY }, { type: 'curved_arrow', dashed: true, x1: 18, y1: 46, x2: 74, y2: 24, controlX: 58, controlY: 52 }, 'preview y PDF conservan la curva discontinua completa');
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

const identityPlayers = [
  { id: 'agus', name: 'AGUS PORTO', shirt_name: 'AGUS PORTO' },
  { id: 'boza', name: 'DIEGO BOZA', abbreviation: 'BOZA' },
  { id: 'acerete', name: 'ACERETE', shortName: 'ACERETE' },
];
const identityElements = [
  { id: 'agus-el', type: 'player', x: 24, y: 38, label: '10', player_id: 'agus', roles: ['Bloqueador'], note: 'correr', sequenceOrder: 2 },
  { id: 'boza-el', type: 'player', x: 46, y: 30, label: '4', player_id: 'boza', roles: ['Arrastre'], note: 'fijar al central', sequenceOrder: 1 },
  { id: 'acerete-el', type: 'player', x: 68, y: 24, label: '9', player_id: 'acerete', roles: ['Rematador'], note: 'atacar primer palo', sequenceOrder: 3 },
];
const identityDiagram = {
  id: 'identity-on',
  orden: 1,
  tipo: 'corner_ofensivo',
  titulo: 'Identidades reales',
  elements: setSetPieceTacticalMeta(identityElements, {
    ...printMeta,
    printIdentityMode: 'number-and-abbreviation',
    displayLayers: { dorsals: true, abbreviations: true, roles: true, chronology: true, zones: true, texts: true },
  }),
};
const identityOnModel = buildSetPiecePrintPlayModel(identityDiagram, identityPlayers, 1);
assert.deepEqual(identityOnModel.chronology.map((step) => step.identity), ['4 BOZA', '10 AGUS PORTO', '9 ACERETE'], 'Cronología ON lleva dorsal e identidad útil al PDF sin recortes automáticos');
assert.deepEqual(identityOnModel.chronology.map((step) => step.instruction), ['fijar al central', 'correr', 'atacar primer palo'], 'Cronología ON muestra cada consigna individual junto al orden');
assert.deepEqual(identityOnModel.individualInstructions.map((item) => item.dorsal), ['4', '9', '10'], 'Cronología ON no elimina participantes vinculados con consigna de Indicaciones');
assert.deepEqual(identityOnModel.instructionGroups.map((group) => group.label), ['Bloqueos', 'Remate'], 'la ofensiva agrupa Indicaciones por roles reales y omite grupos vacíos');
assert.deepEqual(identityOnModel.instructionGroups[0].items.map((item) => item.dorsal), ['4', '10'], 'Bloqueos conserva orden numérico dentro del grupo');

const identityOffDiagram = {
  ...identityDiagram,
  id: 'identity-off',
  elements: setSetPieceTacticalMeta(identityElements, {
    ...printMeta,
    printIdentityMode: 'abbreviation',
    displayLayers: { dorsals: false, abbreviations: true, roles: true, chronology: false, zones: true, texts: true },
  }),
};
const identityOffModel = buildSetPiecePrintPlayModel(identityOffDiagram, identityPlayers, 1);
assert.deepEqual(identityOffModel.chronology, [], 'Cronología OFF elimina orden y Secuencia');
assert.deepEqual(identityOffModel.individualInstructions.map((item) => [item.identity, item.instruction]), [
  ['BOZA', 'fijar al central'],
  ['ACERETE', 'atacar primer palo'],
  ['AGUS PORTO', 'correr'],
], 'Cronología OFF conserva las consignas en Indicaciones con identidad útil y orden de dorsal');
assert.deepEqual(identityOffModel.individualInstructions.map((item) => [item.dorsal, item.playerName]), [
  ['4', 'BOZA'],
  ['9', 'ACERETE'],
  ['10', 'AGUS PORTO'],
], 'cada indicación expone dorsal e identidad real por separado');

assert.equal(getMeaningfulSetPiecePrintText('Consigna pendiente de definir'), '');
assert.equal(getMeaningfulSetPiecePrintText('Sin observaciones.'), '');
const emptyModel = buildSetPiecePrintPlayModel(createPlay('empty', 1, { generalInstruction: 'Consigna pendiente de definir', objective: 'Sin definir', risk: 'Sin riesgo', alternative: 'Sin alternativa', observations: 'Sin observaciones' }));
assert.equal(emptyModel.signal || emptyModel.instruction || emptyModel.objective || emptyModel.risk || emptyModel.alternative || emptyModel.observations, '', 'los placeholders no generan bloques');
assert.deepEqual(emptyModel.headerFacts, [], 'Destino y Golpeo vacíos no generan una fila');
assert.deepEqual(printModel.headerFacts, [
  { id: 'destination', label: 'Destino', value: 'Segundo palo' },
  { id: 'delivery', label: 'Golpeo', value: 'Cerrado' },
], 'la cabecera impresa solo presenta Destino y Golpeo');
assert.equal(JSON.stringify(printModel.headerFacts).includes('Bloqueo') || JSON.stringify(printModel.headerFacts).includes('Zonal'), false, 'mecanismo y marcaje no llegan visualmente a la cabecera');
assert.equal(printModel.deliveryType, 'closed');
assert.equal(printModel.deliveryTypeLabel, 'Cerrado');
assert.equal(printModel.signal, 'MANO ARRIBA', 'SEÑAL llega al modelo impreso como concepto propio');
assert.equal(printModel.objective, 'Liberar segundo palo', 'CLAVE conserva su valor independiente de SEÑAL');
const undefinedDeliveryModel = buildSetPiecePrintPlayModel(createPlay('delivery-undefined', 1, { ...printMeta, deliveryType: '' }));
assert.deepEqual(undefinedDeliveryModel.headerFacts, [{ id: 'destination', label: 'Destino', value: 'Segundo palo' }], 'golpeo sin definir deja únicamente Destino');
const undefinedDestinationModel = buildSetPiecePrintPlayModel(createPlay('destination-undefined', 1, { ...printMeta, libraryZone: '' }));
assert.deepEqual(undefinedDestinationModel.headerFacts, [{ id: 'delivery', label: 'Golpeo', value: 'Cerrado' }], 'zona sin definir deja únicamente Golpeo');
const undefinedHeaderModel = buildSetPiecePrintPlayModel(createPlay('header-undefined', 1, { ...printMeta, libraryZone: '', deliveryType: '' }));
assert.deepEqual(undefinedHeaderModel.headerFacts, [], 'si ambos valores faltan no aparece una fila vacía');
[
  ['Primer palo', 'open', 'Abierto'],
  ['Segundo palo', 'closed', 'Cerrado'],
  ['Zona media', 'open', 'Abierto'],
  ['En corto', 'closed', 'Cerrado'],
].forEach(([zone, deliveryType, deliveryLabel], index) => {
  const model = buildSetPiecePrintPlayModel(createPlay(`header-combination-${index}`, 1, { ...printMeta, libraryZone: zone, deliveryType }));
  assert.deepEqual(model.headerFacts.map((fact) => fact.value), [zone, deliveryLabel], `${zone} + ${deliveryLabel} conserva los valores persistidos`);
});
assert.equal((sheet.match(/<h3>Consigna<\/h3>/g) || []).length, 1, 'la consigna se renderiza una sola vez por jugada');
assert.ok(sheet.includes('visibleLayers={play.displayLayers}'), 'preview y PDF respetan las capas persistidas de cada jugada');
assert.equal(sheet.includes('visibleLayers={{ numbers: true'), false, 'el dossier ya no fuerza capas propias');
assert.ok(sheet.includes('set-piece-print-play-body--field-forward') && css.includes('.set-piece-print-play-body--field-forward'), 'sin consigna ni cronología el campo aprovecha el espacio liberado');
assert.ok(canvas.includes("element.type === 'zone'") && canvas.includes("['text', 'text_box'].includes(element.type)"), 'Zonas y Textos se ocultan solo en render, sin borrar datos');
assert.ok(canvas.includes('const showDorsal = normalizedVisibleLayers.dorsals') && canvas.includes('const showAbbreviation = normalizedVisibleLayers.abbreviations'), 'Dorsales y Abreviaturas admiten las cuatro combinaciones sin fallback automático');
assert.ok(editor.includes('{visibleLayers.chronology ? <section') && sheet.includes('play.chronology.length > 0'), 'Cronología OFF elimina el bloque inferior del editor y la Secuencia impresa');
assert.ok(sheet.includes("step.role ? <span>{step.identity ? ' · ' : ''}{step.role}</span> : null"), 'Roles OFF no deja etiquetas de rol en la Secuencia');
assert.ok(sheet.includes('<h3>Indicaciones</h3>') && sheet.includes('play.individualInstructions'), 'las consignas individuales tienen un bloque independiente de Cronología');
assert.ok(sheet.includes('const indications = play.individualInstructions;'), 'Indicaciones no se deduplica contra Cronología');
assert.ok(sheet.includes('play.instructionGroups.map') && sheet.includes('<h4>{group.label}</h4>'), 'las indicaciones se renderizan bajo encabezados funcionales');
assert.ok(sheet.includes('data-density={indicationDensity}') && css.includes('.set-piece-print-indications[data-density="roomy"]') && css.includes('.set-piece-print-indications[data-density="dense"]'), 'la columna adapta separación y tamaño a la cantidad de indicaciones');
assert.ok(sheet.includes('data-density={indicationDensity}>'), 'la jugada completa expone su densidad para adaptar consigna y espacios');
assert.equal(sheet.includes('>Lanzador<'), false, 'no reaparece una etiqueta independiente de Lanzador');
assert.ok(sheet.includes('set-piece-print-signal') && sheet.includes('Señal de la jugada:'), 'la señal tiene un bloque semántico propio en cabecera');
assert.ok(sheet.includes('item.dorsal') && sheet.includes('item.playerName') && sheet.includes('set-piece-print-indication-text'), 'cada indicación separa dorsal, nombre e instrucción');
assert.match(css, /\.set-piece-print-operational-details section \{\s*display: block;/, 'Clave, Riesgo y Alternativa usan etiqueta y texto apilados');
assert.equal(css.includes('grid-template-columns: 28mm minmax(0, 1fr)'), false, 'el bloque lateral ya no usa una tabla comprimida');
assert.ok(canvas.includes('Number(element.x) + 4.1') && canvas.includes('Number(element.y) - 4.1') && canvas.includes('stroke="white"'), 'el número cronológico se separa visualmente del dorsal');
assert.ok(canvas.includes('selected && !readOnly') && canvas.includes('set-piece-curve-control'), 'el punto de control solo existe como ayuda de edición y no aparece en preview/PDF');
assert.ok(canvas.includes("element.type === 'dashed_arrow' || element.dashed") && canvas.includes("element.type === 'curved_arrow'"), 'el renderer combina curva y discontinuidad sin geometría paralela');
assert.ok(canvas.includes("strokeDasharray={dashed ? '2.2 1.8' : ''}"), 'el patrón discontinuo llega al SVG usado por preview, presentación y PDF');
assert.ok(sheet.includes('preparedForPrint') && sheet.includes('data-render-model="set-piece-print"'), 'preview y PDF comparten elementos preparados y el mismo renderer táctico');
assert.ok(sheet.includes('headerFacts.length') && sheet.includes('fact.label') && sheet.includes('fact.value'), 'preview, PDF e impresión comparten la cabecera Destino/Golpeo/Estructura y la Clave densa');
assert.equal(sheet.includes('play.classifications'), false, 'la cabecera ya no renderiza chips tácticos genéricos');
assert.ok(css.includes('.set-piece-print-header-facts strong') && css.includes('font-size: 9pt') && css.includes('border-left: 1.25pt solid #111827'), 'Destino/Golpeo tienen jerarquía compacta y contraste apto para B/N');
assert.match(css, /\.set-piece-print-signal \{[\s\S]*border: 1\.4pt solid #111827;/, 'SEÑAL conserva jerarquía visible también en blanco y negro');
assert.match(css, /\.set-piece-print-indication-identity b \{[\s\S]*border: 0\.8pt solid #111827;/, 'el dorsal no depende de un fondo de color para destacar');
assert.match(css, /\.set-piece-print-indications li \{[\s\S]*border: 0;/, 'cada jugador se presenta como fila editorial, no como microtarjeta');
assert.match(css, /\.set-piece-print-operational-details \{[\s\S]*margin-top: auto;/, 'la clave y recordatorios aprovechan el fondo de la columna textual');
assert.ok(css.includes('.set-piece-pro-plays[data-count="1"] .set-piece-print-play-body') && css.includes('minmax(90mm, 1fr)'), 'una jugada amplía la columna de información sin dejar media hoja vacía');
assert.match(css, /\.set-piece-pro-plays\[data-count="2"\] \.set-piece-print-indications\[data-density="balanced"\] \.set-piece-print-indication-group ul,[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/, 'dos jugadas reparten jugadores dentro de cada grupo antes de reducir tipografía');
assert.ok(sheet.includes("const movesObjectiveToHeader = indicationDensity !== 'roomy'"), 'desde densidad media la clave libera altura textual y pasa completa a cabecera');
assert.ok(sheet.includes('set-piece-print-play-body--balanced-indications') && css.includes('minmax(110mm, 1fr)'), 'la densidad media amplía la zona textual antes de compactar tipografía');
assert.match(css, /\.set-piece-print-play-body--dense-indications \{[\s\S]*minmax\(175mm, 1fr\);/, 'la densidad alta amplía la zona textual sin alterar la geometría interna de la pizarra');
assert.match(css, /\.set-piece-pro-plays\[data-count="2"\] \.set-piece-print-indications\[data-density="dense"\] \.set-piece-print-indication-group ul \{[\s\S]*repeat\(2, minmax\(0, 1fr\)\);/, 'la media hoja densa reparte filas en dos columnas anchas para conservar 2–3 líneas legibles');
assert.ok(takersSheet.includes('visibleOrders') && takersSheet.includes('? [1, 2, 3] : [1, 2]'), 'Lanzadores no dibuja una tercera fila vacía cuando no existe tercer lanzador');
assert.ok(css.includes('.set-piece-row:last-child') && css.includes('border-bottom: 0'), 'Lanzadores no deja una línea final que simule un dato pendiente');
assert.ok(lineupSheet.includes('print-sheet-meta') && css.includes('.print-sheet-header .print-sheet-meta strong'), 'la cabecera de alineación conserva sus datos con una jerarquía reforzada');
assert.ok(css.includes('min-height: 9.2mm') && css.includes('gap: 0.9mm'), 'el banquillo gana separación vertical sin alterar campo ni posiciones');

const controlDorsals = [11, 6, 5, 4, 10, 9, 22, 14, 21, 19];
const controlPlayers = controlDorsals.map((dorsal) => ({
  id: `control-player-${dorsal}`,
  number: String(dorsal),
  name: `Nombre completo ${dorsal}`,
  shirt_name: dorsal === 5 ? 'J. RODRÍGUEZ' : `JUGADOR ${dorsal}`,
}));
const controlElements = [
  ...controlDorsals.map((dorsal, index) => ({
    id: `control-element-${dorsal}`,
    type: 'player',
    x: 12 + (index % 5) * 18,
    y: 20 + Math.floor(index / 5) * 24,
    label: String(dorsal),
    player_id: `control-player-${dorsal}`,
    roles: ['Movimiento'],
    sequenceOrder: controlDorsals.length - index,
    note: dorsal === 5
      ? 'Movimiento desde punto de penalti a primera zona y continuación hacia el segundo balón'
      : `Indicación individual del dorsal ${dorsal}`,
  })),
  { id: 'control-without-note', type: 'player', x: 50, y: 60, label: '2', player_id: 'control-player-without-note', note: '' },
  { id: 'control-without-link', type: 'player', x: 56, y: 62, label: '3', player_id: '', note: 'No debe imprimirse sin jugador vinculado' },
  { id: 'control-ball', type: 'ball', x: 7, y: 8 },
  { id: 'control-arrow', type: 'arrow', x1: 20, y1: 30, x2: 68, y2: 18 },
];
const controlMeta = {
  ...printMeta,
  signal: 'MANO ARRIBA',
  objective: 'Balón a 1ª zona tras bloqueos al rematador',
  libraryZone: 'Primer palo',
  deliveryType: 'open',
  displayLayers: { dorsals: true, abbreviations: true, roles: true, chronology: false, zones: true, texts: true },
};
const controlDiagram = {
  id: 'control-desde-atras',
  orden: 1,
  tipo: 'corner_ofensivo',
  titulo: 'Desde atrás',
  elements: setSetPieceTacticalMeta(controlElements, controlMeta),
};
const controlModel = buildSetPiecePrintPlayModel(controlDiagram, controlPlayers, 1);
assert.equal(controlModel.signal, 'MANO ARRIBA', 'A: la jugada de control imprime la señal');
assert.equal(controlModel.objective, 'Balón a 1ª zona tras bloqueos al rematador', 'B: la clave no se sustituye por la señal');
assert.deepEqual(controlModel.individualInstructions.map((item) => Number(item.dorsal)), [4, 5, 6, 9, 10, 11, 14, 19, 21, 22], 'C: orden numérico obligatorio de los diez dorsales');
assert.equal(controlModel.individualInstructions.every((item) => item.dorsal && item.playerName), true, 'D: todas las indicaciones muestran dorsal y nombre real');
assert.match(controlModel.individualInstructions.find((item) => item.dorsal === '5').instruction, /continuación hacia el segundo balón/, 'E: la consigna larga llega completa y puede envolver');
assert.equal(controlModel.individualInstructions.some((item) => item.id === 'control-without-note'), false, 'F: un jugador sin consigna no genera una fila inventada');
assert.equal(controlModel.individualInstructions.some((item) => item.id === 'control-without-link'), false, 'F: una consigna sin jugador vinculado no genera una indicación');
assert.deepEqual(controlModel.chronology, [], 'G: Cronología OFF no genera Secuencia');
assert.equal(controlModel.individualInstructions.length, 10, 'G: Cronología OFF conserva las diez indicaciones');
const chronologyOnControlDiagram = {
  ...controlDiagram,
  id: 'control-desde-atras-chronology-on',
  elements: setSetPieceTacticalMeta(controlElements, {
    ...controlMeta,
    displayLayers: { ...controlMeta.displayLayers, chronology: true },
  }),
};
const chronologyOnControlModel = buildSetPiecePrintPlayModel(chronologyOnControlDiagram, controlPlayers, 1);
assert.equal(chronologyOnControlModel.individualInstructions.find((item) => item.dorsal === '6')?.instruction, 'Indicación individual del dorsal 6', 'dorsal 6 vinculado y con consigna permanece en Indicaciones con Cronología ON');
const twoControlPlays = buildSetPiecePrintPages([controlDiagram, { ...controlDiagram, id: 'control-desde-atras-2', orden: 2 }], controlPlayers);
assert.deepEqual(twoControlPlays.map((page) => page.plays.length), [2], 'H: dos jugadas siguen agrupadas en una sola página A4');
assert.deepEqual(getSetPieceGeometrySnapshot(controlModel.elements), getSetPieceGeometrySnapshot(controlDiagram.elements), 'J: el modelo de QA no modifica geometría táctica');
const verboseControlElements = controlElements.map((element) => element.type === 'player' && element.player_id ? {
  ...element,
  note: 'Temporizar el movimiento, atacar el espacio asignado y asegurar la segunda acción sin abandonar la vigilancia posterior.',
} : element);
const verboseControlDiagram = {
  ...controlDiagram,
  id: 'control-verbose-dense',
  elements: setSetPieceTacticalMeta(verboseControlElements, controlMeta),
};
const verboseControlModel = buildSetPiecePrintPlayModel(verboseControlDiagram, controlPlayers, 1);
assert.equal(shouldUseSingleSetPiecePrintPage(verboseControlModel), true, 'H: diez consignas largas activan la hoja completa para no cortar texto');
assert.deepEqual(paginateSetPiecePrintPlays([verboseControlModel, { ...verboseControlModel, id: 'verbose-2', order: 2 }]).map((page) => page.length), [1, 1], 'H: dos jugadas extremas generan dos hojas completas sin superar el máximo de dos');
assert.deepEqual(buildSetPiecePrintPages([verboseControlDiagram, { ...verboseControlDiagram, id: 'control-verbose-dense-2', orden: 2 }], controlPlayers).map((page) => page.plays.length), [1, 1], 'H: la paginación final conserva completas ambas jugadas verbosas');

const defensiveDorsals = [14, 5, 22, 9, 4, 6, 10, 11, 2, 21];
const defensivePlayers = defensiveDorsals.map((dorsal) => ({
  id: `def-player-${dorsal}`,
  number: String(dorsal),
  shirt_name: dorsal === 5 ? 'J. RODRÍGUEZ' : `DEFENSA ${dorsal}`,
}));
const defensiveRoles = [
  ['Zona 2'], ['Zona 1'], ['Segundo rechace'], ['Primer rechace'],
  ['Marca individual'], ['Marca individual'], ['Marca individual'], ['Marca individual'], ['Marca individual'], ['Marca individual'],
];
const defensiveElements = defensiveDorsals.map((dorsal, index) => ({
  id: `def-element-${dorsal}`,
  type: 'player',
  x: 12 + (index % 5) * 17,
  y: 18 + Math.floor(index / 5) * 25,
  label: String(dorsal),
  player_id: `def-player-${dorsal}`,
  roles: defensiveRoles[index],
  note: `Responsabilidad defensiva ${dorsal}`,
}));
defensiveElements.push({ id: 'marcas-text', type: 'text', x: 23, y: 31, label: 'Marcas' });
const defensiveDiagram = {
  id: 'corner-defensive-control',
  orden: 1,
  tipo: 'corner_defensivo',
  titulo: 'Córner defensivo 1',
  elements: setSetPieceTacticalMeta(defensiveElements, {
    ...printMeta,
    libraryMarking: 'Mixto',
    libraryZone: 'Primer palo',
    deliveryType: 'closed',
    objective: 'GANAR 1ER CONTACTO',
    generalInstruction: 'AGRESIVOS EN PRIMER CONTACTO. PROTEGER RECHACE.',
    displayLayers: { ...printMeta.displayLayers, chronology: false },
  }),
};
const defensiveModel = buildSetPiecePrintPlayModel(defensiveDiagram, defensivePlayers, 1);
assert.equal(defensiveModel.defensive, true);
assert.equal(defensiveModel.defenseTypeLabel, 'Mixta');
assert.equal(defensiveModel.defensiveStructure, '2 ZONA · 2 RECHACE · 6 MARCAS');
assert.deepEqual(defensiveModel.headerFacts, [{ id: 'structure', label: 'Estructura', value: '2 ZONA · 2 RECHACE · 6 MARCAS' }], 'una defensiva no muestra destino/golpeo ofensivos aunque existan datos históricos');
assert.deepEqual(defensiveModel.instructionGroups.map((group) => group.label), ['Zona', 'Marcas', 'Rechace']);
assert.deepEqual(defensiveModel.instructionGroups.find((group) => group.id === 'zone').items.map((item) => item.dorsal), ['5', '14']);
assert.deepEqual(defensiveModel.instructionGroups.find((group) => group.id === 'marks').items.map((item) => item.dorsal), ['2', '4', '6', '10', '11', '21']);
assert.deepEqual(defensiveModel.instructionGroups.find((group) => group.id === 'rebound').items.map((item) => item.dorsal), ['9', '22']);
assert.equal(new Set(defensiveModel.instructionGroups.flatMap((group) => group.items.map((item) => item.id))).size, 10, 'ningún defensor se duplica entre grupos');
assert.equal(defensiveModel.signal, 'MANO ARRIBA');
assert.equal(defensiveModel.objective, 'GANAR 1ER CONTACTO');
assert.equal(defensiveModel.instruction, 'AGRESIVOS EN PRIMER CONTACTO. PROTEGER RECHACE.');
const legacyDefensiveModel = buildSetPiecePrintPlayModel({ ...defensiveDiagram, id: 'legacy-defense', elements: setSetPieceTacticalMeta([{ id: 'legacy-player', type: 'player', x: 30, y: 30 }], {}) }, [], 1);
assert.equal(legacyDefensiveModel.defenseTypeLabel, '');
assert.equal(legacyDefensiveModel.defensiveStructure, '');
assert.deepEqual(legacyDefensiveModel.headerFacts, [], 'una defensiva antigua no inventa cabecera ni estructura');
const duplicateDefenseCopyModel = buildSetPiecePrintPlayModel({
  ...defensiveDiagram,
  id: 'deduplicated-defense-copy',
  elements: setSetPieceTacticalMeta(defensiveElements, {
    ...printMeta,
    libraryMarking: 'Mixto',
    objective: 'DEFENSA MIXTA',
    generalInstruction: '2 ZONA · 2 RECHACE · 6 MARCAS',
  }),
}, defensivePlayers, 1);
assert.equal(duplicateDefenseCopyModel.objective, '', 'CLAVE idéntica al tipo defensivo no se repite en impresión');
assert.equal(duplicateDefenseCopyModel.instruction, '', 'CONSIGNA idéntica a la estructura no se repite en impresión');
assert.deepEqual(buildSetPiecePrintPages([defensiveDiagram, controlDiagram], [...defensivePlayers, ...controlPlayers]).map((page) => page.plays.length), [2], 'ofensiva y defensiva mantienen dos jugadas en una A4');

console.log('setPiecePrintLayout tests passed');
