import assert from 'node:assert/strict';
import {
  FINES_TRANSPARENCY_RPCS,
  FinesTransparencyError,
  getFinesTransparencyList,
  getFinesTransparencyRules,
  getFinesTransparencySubjects,
  getFinesTransparencySummary,
} from './finesTransparencyStore.js';

const calls = [];
const client = {
  async rpc(name, args) {
    calls.push([name, args]);
    if (name === FINES_TRANSPARENCY_RPCS.summary) return { data: [{ season_code: '2026', total_fines: 4, generated_total: '10.50' }], error: null };
    if (name === FINES_TRANSPARENCY_RPCS.subjects) return { data: [{ subject_name: 'Jugador visible', fine_count: 2, collected_total: '4.00', subject_id: 'hidden' }], error: null };
    if (name === FINES_TRANSPARENCY_RPCS.rules) return { data: [{ rule_name: 'Retraso', fine_count: 2, generated_total: '5.00', fine_rule_id: 'hidden' }], error: null };
    return { data: [{ subject_name: 'Jugador visible', rule_name: 'Retraso', occurred_on: '2026-09-01', original_amount: 2, surcharge_amount: 0, generated_amount: 2, collected_amount: 2, pending_amount: 0, due_on: '2026-09-30', financial_status: 'paid', lifecycle_status: 'active', is_overdue: false, note: 'Visible', club_id: 'hidden' }], error: null };
  },
};

const summary = await getFinesTransparencySummary(client);
const subjects = await getFinesTransparencySubjects(client);
const rules = await getFinesTransparencyRules(client);
const list = await getFinesTransparencyList(client);

assert.equal(summary.generated_total, 10.5);
assert.equal(summary.pending_total, 0);
assert.equal(subjects[0].collected_total, 4);
assert.equal(subjects[0].subject_id, undefined);
assert.equal(rules[0].fine_rule_id, undefined);
assert.equal(list[0].club_id, undefined);
assert.equal(list[0].note, 'Visible');
assert.deepEqual(calls, [
  ['get_fines_transparency_summary', undefined],
  ['get_fines_transparency_subjects', undefined],
  ['get_fines_transparency_rules', undefined],
  ['get_fines_transparency_list', { p_limit: 30, p_offset: 0 }],
]);

await assert.rejects(() => getFinesTransparencyList(client, { limit: 101 }), FinesTransparencyError);
await assert.rejects(() => getFinesTransparencySummary({ rpc: async () => ({ data: [], error: null }) }), FinesTransparencyError);
await assert.rejects(() => getFinesTransparencyRules(null), FinesTransparencyError);

console.log('finesTransparencyStore: cuatro RPC sanitizadas, allowlists, paginación y errores validados.');
