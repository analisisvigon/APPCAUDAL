import assert from 'node:assert/strict';
import {
  appendCaptainOrderId,
  moveCaptainOrderId,
  normalizeCaptainOrderIds,
  removeCaptainOrderId,
  replaceCaptainOrderId,
} from './captainOrder.js';

const ids = ['captain-a', 'captain-b', 'captain-c', 'captain-d'];
assert.deepEqual(moveCaptainOrderId(ids, 3, -1), ['captain-a', 'captain-b', 'captain-d', 'captain-c']);
assert.deepEqual(moveCaptainOrderId(moveCaptainOrderId(ids, 3, -1), 2, -1), ['captain-a', 'captain-d', 'captain-b', 'captain-c'], 'el cuarto puede subir hasta la segunda prioridad');
assert.deepEqual(removeCaptainOrderId(ids, 1), ['captain-a', 'captain-c', 'captain-d'], 'eliminar compacta el orden sin huecos');
assert.deepEqual(replaceCaptainOrderId(ids, 1, 'captain-e'), ['captain-a', 'captain-e', 'captain-c', 'captain-d']);
assert.deepEqual(replaceCaptainOrderId(ids, 1, 'captain-c'), ids, 'no permite duplicar un UUID ya seleccionado');
assert.deepEqual(appendCaptainOrderId(ids, 'captain-e'), [...ids, 'captain-e']);
assert.deepEqual(appendCaptainOrderId(ids, 'captain-a'), ids, 'añadir el mismo UUID no crea duplicados');
assert.deepEqual(normalizeCaptainOrderIds(['captain-a', '', 'captain-a', 'captain-b']), ['captain-a', 'captain-b']);

console.log('captainOrder tests passed');
