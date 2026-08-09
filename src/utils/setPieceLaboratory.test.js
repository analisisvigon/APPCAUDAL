import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  SET_PIECE_LAB_CATEGORY,
  SET_PIECE_LAB_MARKINGS,
  SET_PIECE_LAB_MECHANISMS,
  SET_PIECE_LAB_ZONES,
  buildSetPieceLaboratoryPayload,
  createSetPieceLaboratoryDraft,
  duplicateSetPieceLaboratoryItem,
  filterAndSortSetPieceLaboratoryItems,
  getSetPieceLaboratoryMeta,
  isSetPieceLaboratoryItem,
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
assert.equal(isSetPieceLaboratoryItem({ categoria: 'ABP Ofensiva' }), false, 'los recursos ABP anteriores no se reclasifican como plantillas del Laboratorio');

const draft = createSetPieceLaboratoryDraft('corner_ofensivo');
assert.match(draft.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, 'el id maestro es compatible con la columna uuid existente');
assert.equal(getSetPieceLaboratoryMeta(draft).libraryStatus, 'draft');
assert.deepEqual(validateSetPieceLaboratoryMeta({ ...getSetPieceLaboratoryMeta(draft), libraryStatus: 'ready' }), ['Zona objetivo', 'Mecanismo principal', 'Marcaje rival']);

const tacticalMeta = {
  ...getSetPieceTacticalMeta(draft.elements),
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
assert.equal(getSetPieceTacticalMeta(payload.elements).linkStatus, 'master');

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
['Abrir', 'Duplicar', 'Archivar', 'Eliminar', 'Vista previa'].forEach((action) => assert.ok(component.includes(`>${action}<`) || component.includes(`'${action}'`), `acción ${action} disponible`));
assert.ok(component.includes('players={[]}') && component.includes('roleOnly'), 'el Laboratorio usa participantes por roles, no jugadores reales');
assert.ok(component.includes('window.confirm'), 'el borrado exige confirmación');
assert.ok(component.includes(".eq('categoria', SET_PIECE_LAB_CATEGORY)"), 'la carga usa exclusivamente el espacio interno del Laboratorio');
assert.equal(component.includes("from('match_"), false, 'el Laboratorio no escribe en datos de partidos');
assert.equal(matchPrint.includes(SET_PIECE_LAB_CATEGORY), false, 'las plantillas maestras de esta fase no aparecen en el consumidor de partido');
assert.ok(library.includes('>Ejercicios<') && library.includes('>ABP<'), 'Biblioteca conserva Ejercicios y añade ABP');
assert.ok(component.includes('closeButtonRef.current?.focus()'), 'la vista previa recibe foco al abrirse');
assert.ok(component.includes('aria-modal="true"') && component.includes('aria-label="Jugadas del Laboratorio ABP"'), 'diálogo y galería exponen nombres accesibles');
assert.ok(component.includes('min-h-11'), 'las acciones principales mantienen un objetivo táctil mínimo de 44 px');
assert.ok(component.includes('md:grid-cols-2'), 'la galería adapta sus columnas sin ancho global fijo');
assert.ok(component.includes('galleryScrollRef') && component.includes('window.scrollTo'), 'volver del editor conserva la posición de la galería');

assert.ok(component.includes('aria-haspopup="menu"') && component.includes('role="menu"') && component.includes('menuItemId'), 'las acciones secundarias viven en un menú accesible de tres puntos');
assert.ok(component.includes('Escape') && component.includes("window.addEventListener('pointerdown', closeMenu)"), 'el menú de tarjeta se cierra con Escape o clic exterior');
assert.ok(component.includes('Guardar y volver') && component.includes('Vista previa') && component.includes('Cancelar'), 'las tres acciones del editor siguen visibles');
assert.ok(component.includes('aria-pressed={meta.libraryFavorite}') && component.includes('statusLabel(meta.libraryStatus)'), 'favorita y estado se expresan también mediante texto/estado accesible');

const objectsIndex = toolbar.indexOf("label: 'OBJETOS'");
const tracingIndex = toolbar.indexOf("label: 'TRAZADO'");
const annotationsIndex = toolbar.indexOf("label: 'ANOTACIONES'");
const blockIndex = toolbar.indexOf("['block', 'Bloqueo']");
assert.ok(objectsIndex >= 0 && tracingIndex > objectsIndex && annotationsIndex > tracingIndex, 'la toolbar respeta la jerarquía Objetos, Trazado y Anotaciones');
assert.ok(blockIndex > tracingIndex && blockIndex < annotationsIndex, 'Bloqueo permanece dentro de Trazado');
assert.ok(toolbar.includes('aria-label={`Añadir ${label.toLowerCase()}`}') && toolbar.includes('title={`Añadir ${label.toLowerCase()}`}') && toolbar.includes('min-h-11'), 'herramientas con nombre accesible, tooltip y objetivo táctil');

['dorsals', 'abbreviations', 'roles', 'chronology', 'zones', 'texts'].forEach((layer) => assert.ok(editor.includes(`key: '${layer}'`), `capa ${layer} disponible`));
assert.ok(editor.includes('Solo estructura') && editor.includes('Restaurar capas'), 'Solo estructura persiste la decisión y permite restaurar la selección anterior');
assert.ok(editor.includes('displayLayersBeforeStructure') && editor.includes('toggleDisplayLayer'), 'las capas se guardan en tactical_meta y no en localStorage');
assert.equal(editor.includes('setVisibleLayers'), false, 'el editor usa la configuración persistida como única fuente de verdad');
assert.ok(editor.includes('Identidad en dossier') && editor.includes('updateIdentityMode'), 'se mantienen los modos Dorsal, Abreviatura y Dorsal + abreviatura sincronizados con las capas');
assert.ok(editor.includes('EditorAccordion') && editor.includes('aria-expanded={open}') && editor.includes('openSections'), 'el panel usa acordeones accesibles y recuerda su estado durante la edición');
assert.ok(editor.includes("setPanel(['player', 'opponent'].includes(element?.type) ? 'player' : 'tactic')"), 'la selección de un participante abre Rol y el resto conserva Ficha');
assert.ok(editor.includes("disabled={disabled}") && editor.includes("id === 'player' && !isSelectedPlayer"), 'Rol no se muestra sin participante seleccionado');
assert.ok(editor.includes('Empieza añadiendo participantes, balón o trazados.'), 'el campo vacío ofrece una ayuda discreta');
assert.ok(editor.includes('lg:flex-row') && editor.includes('aria-current={selectedId === step.id'), 'la cronología es horizontal en escritorio, vertical en móvil y mantiene el vínculo seleccionable');
assert.ok(canvas.includes('stroke="#3DD9FF"') && canvas.includes('selected && !readOnly'), 'la selección tiene halo de alto contraste sin alterar las coordenadas tácticas');

console.log('setPieceLaboratory tests passed');
