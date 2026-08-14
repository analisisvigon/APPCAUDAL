import assert from 'node:assert/strict';
import { loadOwnCaptainPriorities, saveOwnCaptainPriorities } from './captainPriorityStore.js';

const ownPlayerId = '00000000-0000-4000-8000-000000000011';
const membershipId = '00000000-0000-4000-8000-000000000021';
const globalPlayerId = '00000000-0000-4000-8000-000000000031';
const players = [{ id: ownPlayerId, membershipId, name: 'Jugador Vinculado' }];

const query = {
  select() { return this; },
  in() { return this; },
  eq() { return this; },
  not() { return this; },
  order() {
    return Promise.resolve({ data: [{ id: membershipId, player_id: globalPlayerId, captain_priority: 1 }], error: null });
  },
};
const loaded = await loadOwnCaptainPriorities({ from: () => query }, players);
assert.deepEqual(loaded, {
  rows: [{ membershipId, globalPlayerId, jugadorId: ownPlayerId, captainPriority: 1 }],
  schemaAvailable: true,
  unlinkedPlayers: 0,
});

const missingQuery = {
  select() { return this; }, in() { return this; }, eq() { return this; }, not() { return this; },
  order() { return Promise.resolve({ data: null, error: { code: '42703', message: 'column captain_priority does not exist' } }); },
};
assert.equal((await loadOwnCaptainPriorities({ from: () => missingQuery }, players)).schemaAvailable, false, 'la app degrada de forma segura antes de aplicar la migración');

let receivedArgs = null;
const saved = await saveOwnCaptainPriorities({
  rpc(name, args) {
    receivedArgs = { name, args };
    return Promise.resolve({ data: [{ membership_id: membershipId, player_id: globalPlayerId, jugador_id: ownPlayerId, captain_priority: 1 }], error: null });
  },
}, players);
assert.deepEqual(receivedArgs, { name: 'save_own_captain_priorities', args: { p_membership_ids: [membershipId] } }, 'el guardado transmite solo UUID de relaciones y conserva el orden');
assert.equal(saved[0].jugadorId, ownPlayerId);
await assert.rejects(() => saveOwnCaptainPriorities({ rpc() { throw new Error('no debe llamarse'); } }, [{ id: ownPlayerId }]), /relación UUID vigente/i);

console.log('captainPriorityStore tests passed');
