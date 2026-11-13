import assert from 'node:assert/strict';
import { deleteOwnPlayer, getPlayerHistoricalSummary } from './ownPlayerDeletion.js';

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

// Retirada conservando pagos o historial
const retiredWithFines = await deleteOwnPlayer({
  rpc: async () => ({ data: { status: 'retired', jugador_id: playerId, fine_payments_preserved: true }, error: null }),
  from: () => { throw new Error('No debe acceder directamente a tablas'); },
}, playerId);
assert.equal(retiredWithFines.status, 'retired');
assert.equal(retiredWithFines.fine_payments_preserved, true);

const retiredWithHistory = await deleteOwnPlayer({
  rpc: async () => ({ data: { status: 'retired', jugador_id: playerId, history_preserved: true }, error: null }),
  from: () => { throw new Error('No debe acceder directamente a tablas'); },
}, playerId);
assert.equal(retiredWithHistory.status, 'retired');
assert.equal(retiredWithHistory.history_preserved, true);

await assert.rejects(
  () => deleteOwnPlayer({ rpc: async () => ({ data: { status: 'retired', jugador_id: playerId }, error: null }) }, playerId),
  /no confirmo|no confirmó/,
);

// Manejo de errores
await assert.rejects(
  () => deleteOwnPlayer({ rpc: async () => ({ data: null, error: new Error('denied') }) }, playerId),
  /Consulta al administrador/,
);
await assert.rejects(
  () => deleteOwnPlayer({ rpc: async () => ({ data: null, error: { message: 'SEASON_CLOSED' } }) }, playerId),
  /temporada cerrada/,
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
  (error) => error.message.includes('datos relacionados')
    && error.message.includes('Código: PLAYER_DELETE_FK_REVIEW_REQUIRED')
    && !error.message.includes('tabla.columna'),
);
await assert.rejects(
  () => deleteOwnPlayer({ rpc: async () => ({ data: { status: 'deleted', jugador_id: 'wrong' } }) }, playerId),
  /no confirmo|no confirmó/,
);
await assert.rejects(() => deleteOwnPlayer(client, null), /identificador/);

// Resumen historico
const cleanSummary = getPlayerHistoricalSummary({ id: 'dummy-1' }, { matches: [], stats: { minutes: 0, starts: 0 } });
assert.equal(cleanSummary.hasHistory, false);
assert.equal(cleanSummary.matchCount, 0);

const matchWithPlayer = {
  id: 'match-1',
  callup: [{ id: 'dummy-1' }],
  lineup: [],
  substitutions: [],
  quickEvents: [],
};
const historySummary = getPlayerHistoricalSummary({ id: 'dummy-1' }, { matches: [matchWithPlayer], stats: { minutes: 0 } });
assert.equal(historySummary.hasHistory, true);
assert.equal(historySummary.matchCount, 1);

const statsSummary = getPlayerHistoricalSummary({ id: 'dummy-2' }, { matches: [], stats: { minutes: 90, starts: 1 } });
assert.equal(statsSummary.hasHistory, true);
assert.equal(statsSummary.minutes, 90);

console.log('ownPlayerDeletion: RPC-only contract passed');
