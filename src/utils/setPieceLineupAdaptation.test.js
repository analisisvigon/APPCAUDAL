import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildSetPiecePrintPlayModel } from './setPiecePrintModel.js';
import { cloneSetPieceElementsWithFreshIds, getSetPieceGeometrySnapshot } from './setPieceProfessional.js';
import {
  UNASSIGNED_SET_PIECE_PLAYER_NAME,
  applySetPieceLineupAdaptation,
  buildSetPieceLineupAdaptation,
} from './setPieceLineupAdaptation.js';

const uuid = (index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const positions = ['Portero', 'Lateral izquierdo', 'Defensa central', 'Defensa central', 'Lateral derecho', 'Extremo izquierdo', 'Mediocentro', 'Mediocentro', 'Extremo derecho', 'Delantero centro', 'Delantero centro'];
const players = Array.from({ length: 15 }, (_, index) => ({
  id: uuid(index + 1),
  name: `Jugador ${index + 1}`,
  shirtName: `J${index + 1}`,
  number: index + 1,
  position: index === 0 ? 'Portero' : index < 5 ? 'Defensa' : index < 9 ? 'Centrocampista' : 'Atacante',
  specificPosition: positions[index] || (index === 11 ? 'Delantero centro' : index === 12 ? 'Defensa central' : 'Mediocentro'),
}));
const slots = (ids) => ids.map((id, slot) => ({ scope: 'stats', slot, jugador_id: id, player_name: players.find((player) => player.id === id)?.name || id }));
const sourceIds = players.slice(0, 11).map((player) => player.id);
const element = (id, x, fields = {}) => ({ id: `element-${id}-${x}`, type: 'player', x, y: 22, label: String(players.find((player) => player.id === id)?.number || 99), player_id: id, roles: ['Rematador'], sequenceOrder: x, note: 'ATACAR PRIMER PALO', ...fields });
const arrow = { id: 'arrow-1', type: 'curved_arrow', x1: 12, y1: 55, x2: 72, y2: 18, controlX: 61, controlY: 43, dashed: true };
const diagrams = [
  { id: 'play-1', tipo: 'corner_ofensivo', orden: 1, titulo: 'Desde atrás', consigna: 'MISMA CONSIGNA', elements: [element(sourceIds[9], 1), element(sourceIds[2], 2), arrow] },
  { id: 'play-2', tipo: 'corner_ofensivo', orden: 2, titulo: 'Acumulación', consigna: 'MISMA CONSIGNA', elements: [element(sourceIds[9], 3), arrow] },
];

const oneChangeIds = [...sourceIds.slice(0, 9), players[11].id, sourceIds[10]];
let plan = buildSetPieceLineupAdaptation({ diagrams, sourceSlots: slots(sourceIds), currentSlots: slots(oneChangeIds), sourceSystem: '4-4-2', currentSystem: '4-4-2', players });
assert.equal(plan.substitutionMap[sourceIds[9]], players[11].id, 'un único cambio usa el mismo slot');
assert.equal(plan.changeOccurrenceCount, 2, 'el mapa global se refleja en todas las jugadas');
assert.equal(plan.substitutionMap[sourceIds[2]], undefined, 'un titular que continúa no se toca');

const adapted = applySetPieceLineupAdaptation(diagrams[0].elements, plan, players);
assert.equal(adapted[0].player_id, players[11].id);
assert.equal(adapted[0].roles[0], 'Rematador');
assert.equal(adapted[0].note, 'ATACAR PRIMER PALO');
assert.equal(adapted[0].sequenceOrder, 1);
assert.deepEqual(getSetPieceGeometrySnapshot(adapted), getSetPieceGeometrySnapshot(diagrams[0].elements), 'la identidad no altera la geometría');
assert.equal(diagrams[0].elements[0].player_id, sourceIds[9], 'el original permanece intacto');

const copied = cloneSetPieceElementsWithFreshIds(adapted);
assert.notEqual(copied[0].id, adapted[0].id, 'la copia recibe IDs internos nuevos');
assert.deepEqual(getSetPieceGeometrySnapshot(copied).map(({ id, ...geometry }) => geometry), getSetPieceGeometrySnapshot(adapted).map(({ id, ...geometry }) => geometry));

const twoChangeIds = [...sourceIds];
twoChangeIds[2] = players[12].id;
twoChangeIds[9] = players[11].id;
plan = buildSetPieceLineupAdaptation({ diagrams, sourceSlots: slots(sourceIds), currentSlots: slots(twoChangeIds), sourceSystem: '4-4-2', currentSystem: '4-4-2', players });
assert.deepEqual(plan.substitutionMap, { [sourceIds[2]]: players[12].id, [sourceIds[9]]: players[11].id }, 'resuelve dos cambios independientes');
assert.equal(new Set(Object.values(plan.substitutionMap)).size, 2, 'dos participantes distintos no comparten sustituto');

const sameStarterMoved = [...sourceIds];
[sameStarterMoved[8], sameStarterMoved[9]] = [sameStarterMoved[9], sameStarterMoved[8]];
plan = buildSetPieceLineupAdaptation({ diagrams, sourceSlots: slots(sourceIds), currentSlots: slots(sameStarterMoved), sourceSystem: '4-4-2', currentSystem: '4-4-2', players });
assert.deepEqual(plan.substitutionMap, {}, 'un titular que sigue en el XI se conserva aunque cambie de slot');

const retainedOccupiesOutgoingSlot = [...sourceIds];
retainedOccupiesOutgoingSlot[8] = players[11].id;
retainedOccupiesOutgoingSlot[9] = sourceIds[8];
plan = buildSetPieceLineupAdaptation({ diagrams, sourceSlots: slots(sourceIds), currentSlots: slots(retainedOccupiesOutgoingSlot), sourceSystem: '4-4-2', currentSystem: '4-4-2', players });
assert.equal(plan.substitutionMap[sourceIds[9]], players[11].id, 'no reutiliza a un titular conservado que ahora ocupa el slot del saliente');

const legacyDiagram = [{ ...diagrams[0], elements: [{ ...diagrams[0].elements[0], player_id: '', name: players[9].name }] }];
plan = buildSetPieceLineupAdaptation({ diagrams: legacyDiagram, sourceSlots: slots(sourceIds), currentSlots: slots(oneChangeIds), sourceSystem: '4-4-2', currentSystem: '4-4-2', players });
assert.equal(plan.substitutionMap[sourceIds[9]], players[11].id, 'un nombre legacy se resuelve solo contra una identidad inequívoca del XI origen');
assert.equal(applySetPieceLineupAdaptation(legacyDiagram[0].elements, plan, players)[0].player_id, players[11].id);

const ambiguousPlayers = players.map((player) => ({ ...player }));
ambiguousPlayers[11].specificPosition = 'Delantero centro';
ambiguousPlayers[12].specificPosition = 'Delantero centro';
const changedSystemIds = [...sourceIds];
changedSystemIds[9] = ambiguousPlayers[11].id;
changedSystemIds[10] = ambiguousPlayers[12].id;
const ambiguousDiagrams = [{ ...diagrams[0], elements: [element(sourceIds[9], 1)] }];
plan = buildSetPieceLineupAdaptation({ diagrams: ambiguousDiagrams, sourceSlots: slots(sourceIds), currentSlots: slots(changedSystemIds), sourceSystem: '4-2-3-1', currentSystem: '4-3-3', players: ambiguousPlayers });
assert.equal(plan.substitutionMap[sourceIds[9]], undefined, 'un cambio de sistema no fuerza el mismo slot');
assert.equal(plan.manualReviewCount, 1, 'dos candidatos compatibles generan revisión manual');
const unassigned = applySetPieceLineupAdaptation(ambiguousDiagrams[0].elements, plan, ambiguousPlayers)[0];
assert.equal(unassigned.player_id, '');
assert.equal(unassigned.name, UNASSIGNED_SET_PIECE_PLAYER_NAME);
assert.equal(unassigned.note, 'ATACAR PRIMER PALO');

const uniqueChangedSystemIds = [...sourceIds];
uniqueChangedSystemIds[9] = players[11].id;
plan = buildSetPieceLineupAdaptation({ diagrams: ambiguousDiagrams, sourceSlots: slots(sourceIds), currentSlots: slots(uniqueChangedSystemIds), sourceSystem: '4-2-3-1', currentSystem: '4-3-3', players });
assert.equal(plan.substitutionMap[sourceIds[9]], players[11].id, 'un cambio de sistema permite una posición específica única sin usar el slot');

plan = buildSetPieceLineupAdaptation({ diagrams, sourceSlots: slots(sourceIds), currentSlots: slots(sourceIds).slice(0, 10), sourceSystem: '4-4-2', currentSystem: '4-4-2', players });
assert.equal(plan.canAdapt, false);
assert.equal(plan.message, 'No hay XI titular definido para adaptar las jugadas.');

const printPlan = buildSetPieceLineupAdaptation({ diagrams: [diagrams[0]], sourceSlots: slots(sourceIds), currentSlots: slots(oneChangeIds), sourceSystem: '4-4-2', currentSystem: '4-4-2', players });
const printElements = applySetPieceLineupAdaptation(diagrams[0].elements, printPlan, players);
const printModel = buildSetPiecePrintPlayModel({ ...diagrams[0], elements: printElements }, players);
assert.equal(printModel.chronology[0].playerName, 'J12', 'la vista previa/PDF resuelve la identidad nueva');
assert.equal(printModel.chronology[0].instruction, 'ATACAR PRIMER PALO');
assert.equal(printModel.instruction, 'MISMA CONSIGNA');

const tabSource = fs.readFileSync(new URL('../components/print/MatchPrintTab.jsx', import.meta.url), 'utf8');
assert.ok(tabSource.includes('Adaptar jugadores al XI titular actual'));
assert.ok(tabSource.includes('Duplicar y adaptar'));
assert.ok(tabSource.includes('Duplicar sin adaptar'));
assert.ok(tabSource.includes(".eq('scope', 'stats')"), 'la auditoría UI usa exclusivamente slots stats');
assert.ok(tabSource.includes('cloneSetPieceElementsWithFreshIds'), 'las copias renuevan IDs internos');

console.log('setPieceLineupAdaptation tests passed');
