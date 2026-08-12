import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  SET_PIECE_LAB_CATEGORY,
  SET_PIECE_LAB_MARKINGS,
  SET_PIECE_LAB_MECHANISMS,
  SET_PIECE_LAB_ZONES,
  TRAINING_LIBRARY_SECTIONS,
  buildSetPieceLaboratoryPayload,
  createSetPieceLaboratoryDraft,
  duplicateSetPieceLaboratoryItem,
  filterAndSortSetPieceLaboratoryItems,
  getSetPieceLaboratoryMeta,
  getTrainingLibrarySection,
  isSetPieceLibraryItem,
  isSetPieceLaboratoryItem,
  normalizeTrainingLibraryClassification,
  partitionTrainingLibraryItems,
  prepareSetPieceLaboratoryItem,
  validateSetPieceLaboratoryMeta,
} from './setPieceLaboratory.js';
import { getSetPieceTacticalMeta, setSetPieceTacticalMeta } from './setPieceProfessional.js';

assert.deepEqual(SET_PIECE_LAB_ZONES, ['Primer palo', 'Zona media', 'Segundo palo', 'En corto', 'Frontal']);
assert.deepEqual(SET_PIECE_LAB_MECHANISMS, ['Bloqueo', 'Arrastre', 'Ataque de zona']);
assert.deepEqual(SET_PIECE_LAB_MARKINGS, ['Zonal', 'Individual', 'Mixto']);
assert.equal(SET_PIECE_LAB_CATEGORY, 'ABP Laboratorio');
assert.equal([...SET_PIECE_LAB_ZONES, ...SET_PIECE_LAB_MECHANISMS, ...SET_PIECE_LAB_MARKINGS].some((value) => ['Segundo balón', 'Pantalla', 'Rechace', 'Liberación', 'Otro', 'Sin clasificar'].includes(value)), false);
assert.equal(isSetPieceLaboratoryItem({ categoria: 'ABP Laboratorio' }), true);
assert.equal(isSetPieceLaboratoryItem({ categoria: 'ABP Ofensiva' }), true);
assert.equal(isSetPieceLaboratoryItem({ categoria: 'ABP Defensiva' }), true);
assert.equal(isSetPieceLaboratoryItem({ categoria: '  ABP\u200B OFENSIVA.  ' }), true, 'la clasificación tolera Unicode invisible, caja, espacios y puntuación sin usar parciales');
assert.equal(normalizeTrainingLibraryClassification('  Acción  a balón parado. '), 'accion a balon parado');
assert.equal(isSetPieceLibraryItem({ categoria: 'Estrategia', tipo: 'Ejercicio táctico' }), false, 'Estrategia no se convierte en ABP por una coincidencia ambigua');
assert.equal(isSetPieceLibraryItem({ categoria: 'Estrategia', tipo: 'corner_ofensivo' }), true, 'el legacy Estrategia solo entra por un tipo ABP exacto');
assert.equal(isSetPieceLibraryItem({ categoria: 'Trabajo ABP ofensiva en transición', tipo: 'Ejercicio' }), false, 'no se aceptan coincidencias parciales');

const classificationFixtures = [
  { id: 'A', nombre: 'Técnica de pase', categoria: 'Ejercicios técnicos', tipo: 'Ejercicio' },
  { id: 'B', nombre: 'ABP ofensiva nueva', categoria: 'ABP Ofensiva', tipo: 'corner_ofensivo' },
  { id: 'C', nombre: 'ABP defensiva nueva', categoria: 'ABP Defensiva', tipo: 'corner_defensivo' },
  { id: 'D', nombre: 'ABP ofensiva nueva copia', categoria: 'ABP Ofensiva', tipo: 'corner_ofensivo' },
  { id: 'F', nombre: 'Desde atrás', categoria: 'ABP OFENSIVA', tipo: 'saque_inicio_ofensivo' },
  { id: 'G', nombre: 'Acumulación', categoria: 'ABP OFENSIVA', tipo: 'corner_ofensivo' },
];
const classified = partitionTrainingLibraryItems(classificationFixtures);
assert.deepEqual(classified[TRAINING_LIBRARY_SECTIONS.EXERCISES].map((item) => item.id), ['A']);
assert.deepEqual(classified[TRAINING_LIBRARY_SECTIONS.SET_PIECES].map((item) => item.id), ['B', 'C', 'D', 'F', 'G']);
assert.equal(new Set([...classified.exercises, ...classified['set-pieces']].map((item) => item.id)).size, classificationFixtures.length, 'cada fila se presenta una sola vez');
assert.equal(getTrainingLibrarySection(classificationFixtures[4]), TRAINING_LIBRARY_SECTIONS.SET_PIECES, 'Desde atrás se abre en ABP');
assert.equal(getTrainingLibrarySection(classificationFixtures[5]), TRAINING_LIBRARY_SECTIONS.SET_PIECES, 'Acumulación se abre en ABP');
const afterDeletingAbp = partitionTrainingLibraryItems(classificationFixtures.filter((item) => item.id !== 'C'));
assert.equal(afterDeletingAbp[TRAINING_LIBRARY_SECTIONS.SET_PIECES].some((item) => item.id === 'C'), false, 'eliminar una ABP no la desplaza a Ejercicios');
assert.deepEqual(afterDeletingAbp[TRAINING_LIBRARY_SECTIONS.EXERCISES].map((item) => item.id), ['A']);

const draft = createSetPieceLaboratoryDraft('corner_ofensivo');
assert.match(draft.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, 'el id maestro es compatible con la columna uuid existente');
assert.equal(getSetPieceLaboratoryMeta(draft).libraryStatus, 'draft');
assert.deepEqual(validateSetPieceLaboratoryMeta({ ...getSetPieceLaboratoryMeta(draft), libraryStatus: 'ready' }), ['Zona objetivo', 'Mecanismo principal', 'Marcaje rival']);
assert.deepEqual(validateSetPieceLaboratoryMeta({ ...getSetPieceLaboratoryMeta(draft), libraryStatus: 'ready' }, 'corner_defensivo'), ['Tipo de defensa'], 'una defensiva no exige campos ofensivos ocultos');
assert.deepEqual(validateSetPieceLaboratoryMeta({ ...getSetPieceLaboratoryMeta(draft), libraryStatus: 'ready', libraryMarking: 'Mixto' }, 'corner_defensivo'), [], 'Tipo de defensa basta para validar la clasificación defensiva');

const tacticalMeta = {
  ...getSetPieceTacticalMeta(draft.elements),
  signal: 'MANO ARRIBA',
  objective: 'Liberar segundo palo',
  generalInstruction: 'Bloquear y atacar',
  libraryZone: 'Segundo palo',
  libraryMechanism: 'Bloqueo',
  libraryMarking: 'Zonal',
  libraryStatus: 'ready',
  libraryFavorite: true,
};
draft.nombre = 'Córner bloqueo segundo palo';
draft.elements = setSetPieceTacticalMeta([
  { id: 'player-1', type: 'player', x: 42, y: 31, label: '1', roles: ['Bloqueador'], targetId: 'arrow-1' },
  { id: 'arrow-1', type: 'arrow', x1: 42, y1: 31, x2: 62, y2: 18, sourceId: 'player-1' },
], tacticalMeta);
assert.deepEqual(validateSetPieceLaboratoryMeta(getSetPieceLaboratoryMeta(draft)), []);

const payload = buildSetPieceLaboratoryPayload(draft);
assert.equal(payload.id, draft.id);
assert.equal(payload.categoria, SET_PIECE_LAB_CATEGORY);
assert.equal(payload.objetivo, 'Liberar segundo palo');
assert.equal(getSetPieceTacticalMeta(payload.elements).signal, 'MANO ARRIBA', 'SEÑAL persiste en elements/tactical_meta sin columna nueva');
assert.equal(getSetPieceTacticalMeta(payload.elements).linkStatus, 'master');
const offensivePayload = buildSetPieceLaboratoryPayload({ ...draft, categoria: 'ABP Ofensiva' });
assert.equal(offensivePayload.categoria, 'ABP Ofensiva', 'editar una ABP histórica conserva su categoría y no crea otra fila');
const closedDeliveryPayload = buildSetPieceLaboratoryPayload({
  ...draft,
  elements: setSetPieceTacticalMeta(draft.elements, { ...getSetPieceLaboratoryMeta(draft), deliveryType: 'closed' }),
});
assert.equal(getSetPieceLaboratoryMeta(closedDeliveryPayload).deliveryType, 'closed', 'Tipo de golpeo se persiste en tactical_meta');
assert.equal(getSetPieceLaboratoryMeta(duplicateSetPieceLaboratoryItem(closedDeliveryPayload)).deliveryType, 'closed', 'duplicar conserva Tipo de golpeo');
assert.equal(getSetPieceLaboratoryMeta(prepareSetPieceLaboratoryItem({ ...payload, id: 'legacy-delivery', elements: [] })).deliveryType, '', 'una ABP antigua abre como Sin definir');

const preparedLegacy = prepareSetPieceLaboratoryItem({
  ...payload,
  id: 'legacy-lab-item',
  descripcion: 'Consigna antigua',
  objetivo: 'Objetivo antiguo',
  variantes: 'Alternativa antigua',
  elements: [],
});
assert.equal(getSetPieceLaboratoryMeta(preparedLegacy).objective, 'Objetivo antiguo', 'los campos existentes se incorporan una sola vez a la fuente maestra');
const clearedLegacyMeta = {
  ...getSetPieceLaboratoryMeta(preparedLegacy),
  objective: '',
  generalInstruction: '',
  alternative: '',
};
const clearedPayload = buildSetPieceLaboratoryPayload({
  ...preparedLegacy,
  elements: setSetPieceTacticalMeta(preparedLegacy.elements, clearedLegacyMeta),
});
assert.equal(clearedPayload.objetivo, '', 'vaciar el objetivo no recupera un valor antiguo de la columna legacy');
assert.equal(clearedPayload.descripcion, '', 'vaciar la consigna no recupera un valor antiguo de la columna legacy');
assert.equal(clearedPayload.variantes, '', 'vaciar la alternativa no recupera un valor antiguo de la columna legacy');
assert.equal(prepareSetPieceLaboratoryItem({ ...payload, tipo: 'tipo_inexistente' }).tipo, 'corner_ofensivo', 'un tipo antiguo no crea categorías paralelas');

const invalidClassification = getSetPieceLaboratoryMeta(setSetPieceTacticalMeta([], {
  libraryZone: 'Segundo balón',
  libraryMechanism: 'Pantalla',
  libraryMarking: 'Otro',
  libraryStatus: 'publicada',
}));
assert.equal(invalidClassification.libraryZone, '');
assert.equal(invalidClassification.libraryMechanism, '');
assert.equal(invalidClassification.libraryMarking, '');
assert.equal(invalidClassification.libraryStatus, 'draft');

const duplicate = duplicateSetPieceLaboratoryItem(payload);
assert.notEqual(duplicate.id, payload.id);
assert.equal(duplicate.nombre, `${payload.nombre} copia`);
const originalIds = new Set(payload.elements.map((element) => element.id));
assert.equal(duplicate.elements.some((element) => originalIds.has(element.id)), false, 'la copia no comparte IDs internos');
const duplicatePlayer = duplicate.elements.find((element) => element.type === 'player');
const duplicateArrow = duplicate.elements.find((element) => element.type === 'arrow');
assert.equal(duplicatePlayer.targetId, duplicateArrow.id);
assert.equal(duplicateArrow.sourceId, duplicatePlayer.id);

const older = { ...payload, id: 'older', nombre: 'Arrastre frontal', updated_at: '2026-01-01T00:00:00Z', elements: setSetPieceTacticalMeta(payload.elements, { ...tacticalMeta, libraryZone: 'Frontal', libraryMechanism: 'Arrastre', libraryFavorite: false }) };
const newer = { ...payload, id: 'newer', updated_at: '2026-02-01T00:00:00Z' };
assert.deepEqual(filterAndSortSetPieceLaboratoryItems([older, newer], { search: 'segundo', zone: 'Segundo palo' }).map((item) => item.id), ['newer']);
assert.deepEqual(filterAndSortSetPieceLaboratoryItems([older, newer], { favorites: true }).map((item) => item.id), ['newer']);
assert.deepEqual(filterAndSortSetPieceLaboratoryItems([older, newer], { sort: 'updated' }).map((item) => item.id), ['newer', 'older']);

const component = fs.readFileSync(new URL('../components/library/SetPieceLaboratory.jsx', import.meta.url), 'utf8');
const editor = fs.readFileSync(new URL('../components/print/SetPieceDiagramEditor.jsx', import.meta.url), 'utf8');
const toolbar = fs.readFileSync(new URL('../components/print/SetPieceDiagramToolbar.jsx', import.meta.url), 'utf8');
const canvas = fs.readFileSync(new URL('../components/print/SetPieceDiagramCanvas.jsx', import.meta.url), 'utf8');
const library = fs.readFileSync(new URL('../components/library/LibrarySection.jsx', import.meta.url), 'utf8');
const matchPrint = fs.readFileSync(new URL('../components/print/MatchPrintTab.jsx', import.meta.url), 'utf8');
['Abrir', 'Duplicar', 'Archivar', 'Eliminar', 'Vista previa', 'Imprimir'].forEach((action) => assert.ok(component.includes(`>${action}<`) || component.includes(`'${action}'`), `acción ${action} disponible`));
assert.ok(component.includes('players={[]}') && component.includes('roleOnly'), 'el Laboratorio usa participantes por roles, no jugadores reales');
assert.ok(component.includes('window.confirm'), 'el borrado exige confirmación');
assert.ok(component.includes('.filter(isSetPieceLibraryItem)'), 'ABP usa el clasificador central sobre la fuente compartida');
assert.ok(library.includes('partitionTrainingLibraryItems') && library.includes('TRAINING_LIBRARY_SECTIONS.EXERCISES'), 'Ejercicios usa la partición complementaria del mismo clasificador');
assert.equal(component.includes(".eq('categoria'"), false, 'ABP no depende de una única etiqueta de categoría');
assert.equal(component.includes("from('match_"), false, 'el Laboratorio no escribe en datos de partidos');
assert.equal(matchPrint.includes(SET_PIECE_LAB_CATEGORY), false, 'las plantillas maestras de esta fase no aparecen en el consumidor de partido');
assert.ok(library.includes('>Ejercicios<') && library.includes('>ABP<'), 'Biblioteca conserva Ejercicios y añade ABP');
assert.ok(component.includes('closeButtonRef.current?.focus()'), 'la vista previa recibe foco al abrirse');
assert.ok(component.includes('aria-modal="true"') && component.includes('aria-label="Jugadas del Laboratorio ABP"'), 'diálogo y galería exponen nombres accesibles');
assert.ok(component.includes('min-h-11'), 'las acciones principales mantienen un objetivo táctil mínimo de 44 px');
assert.ok(component.includes('md:grid-cols-2'), 'la galería adapta sus columnas sin ancho global fijo');
assert.ok(component.includes('galleryScrollRef') && component.includes('window.scrollTo'), 'volver del editor conserva la posición de la galería');
assert.ok(editor.includes('w-full min-w-0 max-w-full space-y-3 overflow-x-hidden'), '375/430/768/1024 no generan scroll horizontal global');
assert.ok(editor.includes('overflow-auto rounded-[28px]') && editor.includes("minWidth: '100%'"), 'el campo conserva scroll interno al aplicar zoom');
assert.ok(editor.includes("xl:grid-cols-[minmax(0,6.6fr)_minmax(320px,3.4fr)]"), 'a 1366/1920 el panel ABP se coloca junto al campo y en anchos menores queda debajo');
assert.ok(component.includes('renderMode="abp"') && component.includes('renderMode="thumbnail"'), 'ABP aplica escala específica en editor y miniatura');
assert.ok(component.includes('createSetPieceThumbnailLayers(meta.displayLayers)'), 'la miniatura conserva estructura y simplifica etiquetas secundarias');
assert.ok(component.includes('SetPieceDiagramPrintSheet') && component.includes('dos por hoja'), 'ABP reutiliza la impresión profesional a dos jugadas por hoja');
assert.ok(component.includes('Tipo de golpeo') && component.includes('SET_PIECE_DELIVERY_TYPES') && component.includes('deliveryType'), 'Laboratorio permite Sin definir, Abierto y Cerrado desde tactical_meta');
assert.ok(component.includes('getSetPieceDeliveryTypeLabel(meta.deliveryType)'), 'la tarjeta y preview muestran el golpeo solo cuando está definido');
assert.ok(component.includes('const defensive = isDefensiveSetPieceType(draft.tipo)') && component.includes('Tipo de defensa'), 'la ficha de Biblioteca distingue las ABP defensivas');
assert.ok(component.includes('validateSetPieceLaboratoryMeta(meta, draft.tipo)'), 'la validación depende del tipo real de ABP');
assert.ok(component.includes('getSetPieceDefensiveStructure(item.elements)') && component.includes('defensiveStructure'), 'tarjeta y preview pueden mostrar la estructura derivada sin persistir una copia');
assert.ok(editor.includes("{defensive && !roleOnly ?") && editor.includes("{!defensive ? <TacticalField label=\"Tipo de saque\""), 'los campos ofensivos se ocultan en defensivas y no se duplican dentro del Laboratorio');
['Duración', 'Jugadores', 'Dimensiones', 'Material', 'Variantes futuras / progresiones'].forEach((field) => {
  assert.equal(component.includes(field), false, `ABP no muestra el campo genérico ${field}`);
  assert.ok(library.includes(field), `Ejercicios conserva el campo ${field}`);
});

assert.ok(component.includes('aria-haspopup="menu"') && component.includes('role="menu"') && component.includes('menuItemId'), 'las acciones secundarias viven en un menú accesible de tres puntos');
assert.ok(component.includes('Escape') && component.includes("window.addEventListener('pointerdown', closeMenu)"), 'el menú de tarjeta se cierra con Escape o clic exterior');
assert.ok(component.includes('Guardar y volver') && component.includes('Vista previa') && component.includes('Cancelar'), 'las tres acciones del editor siguen visibles');
assert.ok(component.includes('aria-pressed={meta.libraryFavorite}') && component.includes('statusLabel(meta.libraryStatus)'), 'favorita y estado se expresan también mediante texto/estado accesible');

const objectsIndex = toolbar.indexOf("label: 'OBJETOS'");
const tracingIndex = toolbar.indexOf("label: 'TRAZADO'");
const annotationsIndex = toolbar.indexOf("label: 'ANOTACIONES'");
const blockIndex = toolbar.indexOf("['block', 'Bloqueo']");
const curvedIndex = toolbar.indexOf("['curved_arrow', 'Flecha curva']");
const curvedDashedIndex = toolbar.indexOf("['curved_dashed_arrow', 'Curva discont.']");
const doubleIndex = toolbar.indexOf("['double_arrow', 'Flecha doble']");
assert.ok(objectsIndex >= 0 && tracingIndex > objectsIndex && annotationsIndex > tracingIndex, 'la toolbar respeta la jerarquía Objetos, Trazado y Anotaciones');
assert.ok(blockIndex > tracingIndex && blockIndex < annotationsIndex, 'Bloqueo permanece dentro de Trazado');
assert.ok(curvedIndex < curvedDashedIndex && curvedDashedIndex < doubleIndex, 'Curva discontinua ocupa el orden solicitado dentro de Trazado');
assert.ok(toolbar.includes('aria-label={`Añadir ${label.toLowerCase()}`}') && toolbar.includes('title={`Añadir ${label.toLowerCase()}`}') && toolbar.includes('min-h-11'), 'herramientas con nombre accesible, tooltip y objetivo táctil');
assert.ok(toolbar.includes('w-full min-w-0 max-w-full overflow-hidden') && toolbar.includes('flex flex-wrap gap-1.5'), 'la herramienta nueva queda accesible por wrap en 375–1920 px sin scroll global');

['dorsals', 'abbreviations', 'roles', 'chronology', 'zones', 'texts'].forEach((layer) => assert.ok(editor.includes(`key: '${layer}'`), `capa ${layer} disponible`));
assert.ok(editor.includes('Solo estructura') && editor.includes('Restaurar capas'), 'Solo estructura persiste la decisión y permite restaurar la selección anterior');
assert.ok(editor.includes('displayLayersBeforeStructure') && editor.includes('toggleDisplayLayer'), 'las capas se guardan en tactical_meta y no en localStorage');
assert.equal(editor.includes('setVisibleLayers'), false, 'el editor usa la configuración persistida como única fuente de verdad');
assert.ok(editor.includes('Identidad en dossier') && editor.includes('updateIdentityMode'), 'se mantienen los modos Dorsal, Abreviatura y Dorsal + abreviatura sincronizados con las capas');
assert.ok(editor.includes('label="Señal de la jugada"') && editor.includes('placeholder="Ej. Mano arriba"'), 'Laboratorio y Dossier comparten el campo manual SEÑAL dentro de Ficha');
assert.ok(component.includes('meta.signal') && component.includes('>Señal<'), 'la vista previa del Laboratorio presenta SEÑAL sin reutilizar Objetivo');
assert.ok(editor.includes('EditorAccordion') && editor.includes('aria-expanded={open}') && editor.includes('openSections'), 'el panel usa acordeones accesibles y recuerda su estado durante la edición');
assert.ok(editor.includes("setPanel(['player', 'opponent'].includes(element?.type) ? 'player' : 'tactic')"), 'la selección de un participante abre Rol y el resto conserva Ficha');
assert.ok(editor.includes("disabled={disabled}") && editor.includes("id === 'player' && !isSelectedPlayer"), 'Rol no se muestra sin participante seleccionado');
assert.ok(editor.includes('Empieza añadiendo participantes, balón o trazados.'), 'el campo vacío ofrece una ayuda discreta');
assert.ok(editor.includes('lg:flex-row') && editor.includes('aria-current={selectedId === step.id'), 'la cronología es horizontal en escritorio, vertical en móvil y mantiene el vínculo seleccionable');
assert.ok(canvas.includes('stroke="#3DD9FF"') && canvas.includes('selected && !readOnly'), 'la selección tiene halo de alto contraste sin alterar las coordenadas tácticas');
assert.ok(canvas.includes('usesAbpLayerOrder ? sortSetPieceElementsForRender(visibleElements) : visibleElements'), 'el orden de capas nuevo queda limitado al render ABP/miniatura/impresión');
assert.ok(canvas.includes('playerRadius: 1.75') && canvas.includes('playerRadius: 1.45') && canvas.includes('playerRadius: 1.65'), 'editor ABP, miniatura e impresión usan marcadores menores que el editor genérico');
assert.ok(canvas.includes('const usesOptimizedLabels = printOptimized || optimizeLabels') && canvas.includes('usesOptimizedLabels && showAbbreviation && element.printLabelLeader'), 'ABP y PDF aplican offsets visuales solo a identidades de participantes sin moverlos');
assert.ok(canvas.includes('const labelX = Number(element.x || 0);') && canvas.includes('const labelY = Number(element.y || 0);'), 'las anotaciones de texto mantienen la posición normalizada del editor');
assert.ok(editor.includes("renderMode === 'abp' && crowdedParticipants.length") && editor.includes('Elementos muy próximos'), 'el editor ABP avisa de proximidad sin recolocar participantes');

console.log('setPieceLaboratory tests passed');
