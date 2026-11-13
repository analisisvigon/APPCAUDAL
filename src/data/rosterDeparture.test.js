import assert from 'node:assert/strict';
import { departRosterPlayer } from './ownPlayerDeletion.js';
const args = { jugadorId: 'ficha', ctsId: 'cts', confirmed: true };
let calls = 0;
const client = { rpc: async (name, payload) => {
  calls++;
  assert.equal(name, 'depart_roster_player_v1');
  assert.deepEqual(payload, { p_jugador_id: 'ficha', p_cts_id: 'cts', p_confirm: true, p_left_on: null });
  return { data: { status: 'departed', jugador_id: 'ficha', cts_id: 'cts' } };
} };
await assert.rejects(departRosterPlayer(client, { ...args, confirmed: false }));
assert.equal(calls, 0);
await departRosterPlayer(client, args);
assert.equal(calls, 1);
for (const error of [{ code: 'PGRST202' }, { message: 'SEASON_CLOSED' }, { message: 'PLAYER_CTS_DENIED' }, { message: 'transaction failed' }]) {
  await assert.rejects(departRosterPlayer({ rpc: async () => ({ error }) }, args));
}
for (const data of [null, { status: 'deleted', jugador_id: 'ficha', cts_id: 'cts' },
  { status: 'departed', jugador_id: 'ficha', cts_id: 'other' }]) {
  await assert.rejects(departRosterPlayer({ rpc: async () => ({ data }) }, args));
}
console.log('CTS departure: confirmation, explicit context, receipt and error handling OK (mock RPC).');
