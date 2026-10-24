import assert from 'node:assert/strict';
import { deleteOwnPlayer } from './ownPlayerDeletion.js';

const playerId = '11111111-1111-4111-8111-111111111111';
let calls = [];
const client = {
  rpc: async (...args) => {
    calls.push(args);
    return { data: { status: 'deleted', jugador_id: playerId }, error: null };
  },
  from: () => { throw new Error('Direct table access is forbidden'); },
};
await deleteOwnPlayer(client, playerId);
assert.deepEqual(calls, [['delete_own_player_atomic_v1', { p_jugador_id: playerId }]]);

await assert.rejects(
  () => deleteOwnPlayer({ rpc: async () => ({ data: null, error: new Error('denied') }) }, playerId),
  /denied/,
);
await assert.rejects(
  () => deleteOwnPlayer({ rpc: async () => ({ data: null, error: { message: 'PLAYER_IMMUTABLE_FINE_PAYMENTS_REVIEW_REQUIRED' } }) }, playerId),
  /pagos de multas/,
);
await assert.rejects(
  () => deleteOwnPlayer({ rpc: async () => ({ data: null, error: { message: 'PLAYER_DELETE_DENIED' } }) }, playerId),
  /No tienes permiso/,
);
await assert.rejects(
  () => deleteOwnPlayer({ rpc: async () => ({ data: null, error: { message: 'PLAYER_DELETE_FK_REVIEW_REQUIRED: tabla.columna' } }) }, playerId),
  /datos relacionados/,
);
await assert.rejects(
  () => deleteOwnPlayer({ rpc: async () => ({ data: { status: 'deleted', jugador_id: 'wrong' } }) }, playerId),
  /no confirmo|no confirmó/,
);
await assert.rejects(() => deleteOwnPlayer(client, null), /identificador/);
console.log('ownPlayerDeletion: RPC-only contract passed');
