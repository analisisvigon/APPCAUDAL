import assert from 'node:assert/strict';
import {
  PLAYER_FINES_PAGE_SIZE,
  PLAYER_FINES_RPCS,
  PlayerFinesLoadError,
  getMyFines,
  getMyFinesSummary,
  normalizePlayerFine,
  normalizePlayerFinesSummary,
} from './playerFinesStore.js';

const calls = [];
const client = {
  async rpc(name, payload) {
    calls.push([name, payload]);
    if (name === PLAYER_FINES_RPCS.list) return {
      data: [{
        fine_id: 'fine-1', occurred_on: '2026-09-12', rule_name: 'Llegar tarde',
        rule_description: 'Retraso', note: 'Aviso visible', original_amount: '2.00',
        surcharge_amount: '1.00', generated_amount: '3.00', collected_amount: '1.00',
        pending_amount: '2.00', financial_status: 'partial', lifecycle_status: 'active',
        due_on: '2026-09-30', cancellation_reason: null, subject_name: 'dato no permitido',
      }],
      error: null,
    };
    return {
      data: [{ active_fines: 2, paid_count: 3, surcharge_total: '1.00', collected_total: '7.50', pending_total: '2.00', team_total: 999 }],
      error: null,
    };
  },
};

const fines = await getMyFines(client);
const summary = await getMyFinesSummary(client);
assert.equal(PLAYER_FINES_PAGE_SIZE, 30);
assert.deepEqual(calls, [
  ['get_my_fines', { p_limit: 30, p_offset: 0 }],
  ['get_my_fines_summary', undefined],
]);
assert.equal(fines.length, 1);
assert.equal(fines[0].pending_amount, 2);
assert.equal(fines[0].subject_name, undefined, 'El store solo expone el contrato propio permitido.');
assert.deepEqual(summary, { active_fines: 2, paid_count: 3, surcharge_total: 1, collected_total: 7.5, pending_total: 2 });

assert.deepEqual(normalizePlayerFinesSummary({}), {
  active_fines: 0, paid_count: 0, surcharge_total: 0, collected_total: 0, pending_total: 0,
});
assert.equal(normalizePlayerFine({ occurred_on: 'fecha-invalida' }).occurred_on, null);

await assert.rejects(() => getMyFines(client, { limit: 101 }), PlayerFinesLoadError);
await assert.rejects(() => getMyFines(null), (error) => error instanceof PlayerFinesLoadError && error.kind === 'invalid_session');
await assert.rejects(
  () => getMyFinesSummary({ rpc: async () => ({ data: [], error: null }) }),
  (error) => error instanceof PlayerFinesLoadError && error.kind === 'invalid_response',
);
await assert.rejects(
  () => getMyFines({ rpc: async () => ({ data: null, error: { message: 'denied' } }) }),
  (error) => error instanceof PlayerFinesLoadError && error.operation === 'list',
);

console.log('playerFinesStore: dos RPC propias, paginación, allowlist, vacíos y errores validados.');
