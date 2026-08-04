import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  SET_PIECE_LAB_MARKINGS,
  SET_PIECE_LAB_MECHANISMS,
  SET_PIECE_LAB_ZONES,
  buildSetPieceLaboratoryPayload,
  createSetPieceLaboratoryDraft,
  duplicateSetPieceLaboratoryItem,
  filterAndSortSetPieceLaboratoryItems,
  getSetPieceLaboratoryMeta,
  validateSetPieceLaboratoryMeta,
} from './setPieceLaboratory.js';
import { getSetPieceTacticalMeta, setSetPieceTacticalMeta } from './setPieceProfessional.js';

assert.deepEqual(SET_PIECE_LAB_ZONES, ['Primer palo', 'Zona media', 'Segundo palo', 'En corto', 'Frontal']);
assert.deepEqual(SET_PIECE_LAB_MECHANISMS, ['Bloqueo', 'Arrastre', 'Ataque de zona']);
assert.deepEqual(SET_PIECE_LAB_MARKINGS, ['Zonal', 'Individual', 'Mixto']);
assert.equal([...SET_PIECE_LAB_ZONES, ...SET_PIECE_LAB_MECHANISMS, ...SET_PIECE_LAB_MARKINGS].some((value) => ['Segundo balón', 'Pantalla', 'Rechace', 'Liberación', 'Otro', 'Sin clasificar'].includes(value)), false);

const draft = createSetPieceLaboratoryDraft('corner_ofensivo');
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
assert.equal(payload.categoria, 'ABP Ofensiva');
assert.equal(payload.objetivo, 'Liberar segundo palo');
assert.equal(getSetPieceTacticalMeta(payload.elements).linkStatus, 'master');

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
const library = fs.readFileSync(new URL('../components/library/LibrarySection.jsx', import.meta.url), 'utf8');
['Abrir', 'Duplicar', 'Archivar', 'Eliminar', 'Vista previa'].forEach((action) => assert.ok(component.includes(`>${action}<`) || component.includes(`'${action}'`), `acción ${action} disponible`));
assert.ok(component.includes('players={[]}') && component.includes('roleOnly'), 'el Laboratorio usa participantes por roles, no jugadores reales');
assert.ok(component.includes('window.confirm'), 'el borrado exige confirmación');
assert.ok(component.includes(".ilike('categoria', 'ABP%')"), 'la carga ABP no elimina ni mezcla ejercicios');
assert.equal(component.includes("from('match_"), false, 'el Laboratorio no escribe en datos de partidos');
assert.ok(library.includes('>Ejercicios<') && library.includes('>ABP<'), 'Biblioteca conserva Ejercicios y añade ABP');

console.log('setPieceLaboratory tests passed');
