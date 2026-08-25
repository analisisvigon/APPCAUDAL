import assert from 'node:assert/strict';
import {
  getSetPieceDiagramIdentity,
  getSetPieceSelectionAfterDelete,
  normalizeSetPieceDiagramOrders,
  sortSetPieceDiagramsByOrder,
} from './setPieceDiagramOrder.js';

const makePlays = (orders, type = 'corner_ofensivo') => orders.map((orden, index) => ({
  id: `${type}-${index + 1}`,
  tipo: type,
  orden,
  titulo: `Contenido ${index + 1}`,
}));
const visibleOrders = (plays) => sortSetPieceDiagramsByOrder(normalizeSetPieceDiagramOrders(plays)).map((play) => play.orden);

const five = makePlays([1, 2, 3, 4, 5]);
assert.deepEqual(visibleOrders(five.slice(1)), [1, 2, 3, 4], 'A: eliminar la primera compacta 1..4');
assert.deepEqual(visibleOrders(five.filter((play) => play.id !== 'corner_ofensivo-3')), [1, 2, 3, 4], 'B: eliminar una intermedia compacta 1..4');
assert.deepEqual(visibleOrders(five.slice(0, -1)), [1, 2, 3, 4], 'C: eliminar la última conserva 1..4');
assert.deepEqual(visibleOrders(five.slice(2)), [1, 2, 3], 'D: eliminar dos iniciales compacta 1..3');

assert.equal(getSetPieceSelectionAfterDelete(five, five[1]), five[2].id, 'E: al borrar la activa se selecciona la siguiente por ID');
assert.equal(getSetPieceSelectionAfterDelete(five, five[4]), five[3].id, 'E: sin siguiente se selecciona la anterior por ID');
assert.equal(getSetPieceSelectionAfterDelete([five[0]], five[0]), '', 'F: borrar la única deja selección vacía');
assert.deepEqual(visibleOrders([five[4]]), [1], 'G: una única jugada mantiene índice interno 1');

const afterDelete = normalizeSetPieceDiagramOrders(five.slice(0, 3));
const added = [...afterDelete, { id: 'new', tipo: 'corner_ofensivo', orden: afterDelete.length + 1 }];
assert.deepEqual(visibleOrders(added), [1, 2, 3, 4], 'H: una nueva jugada recibe N + 1');
const duplicated = [...afterDelete, { ...afterDelete[1], id: 'duplicate', orden: afterDelete.length + 1 }];
assert.deepEqual(visibleOrders(duplicated), [1, 2, 3, 4], 'I: duplicar no deja huecos ni números repetidos');

const historical = makePlays([3, 4, 5]);
const historicalIds = historical.map(getSetPieceDiagramIdentity);
const normalizedHistorical = normalizeSetPieceDiagramOrders(historical);
assert.deepEqual(normalizedHistorical.map((play) => play.orden), [1, 2, 3], 'J: datos históricos con huecos se normalizan al cargar');
assert.deepEqual(normalizedHistorical.map(getSetPieceDiagramIdentity), historicalIds, 'la normalización no cambia IDs');
assert.deepEqual(normalizedHistorical.map((play) => play.titulo), historical.map((play) => play.titulo), 'la normalización no cambia contenido táctico');

const mixed = normalizeSetPieceDiagramOrders([
  ...makePlays([2, 4], 'corner_ofensivo'),
  ...makePlays([7, 9, 12], 'corner_defensivo'),
]);
assert.deepEqual(mixed.filter((play) => play.tipo === 'corner_ofensivo').map((play) => play.orden), [1, 2], 'cada tipo ofensivo se compacta de forma independiente');
assert.deepEqual(mixed.filter((play) => play.tipo === 'corner_defensivo').map((play) => play.orden), [1, 2, 3], 'cada tipo defensivo se compacta de forma independiente');

console.log('setPieceDiagramOrder tests passed');
