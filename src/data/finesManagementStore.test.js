import assert from 'node:assert/strict';
import {
  FINES_MANAGEMENT_RPCS,
  FinesManagementError,
  cancelFine,
  createFineCollective,
  createFineIndividual,
  getFineRulesForManagement,
  getFineSubjectsForManagement,
  getFinesFinancialSummary,
  getFinesManagementList,
  getFinesSubjectSummary,
  recordFinePayment,
  recordFineRefund,
} from './finesManagementStore.js';

const makeClient = (responses = {}) => {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push([name, args]);
      return responses[name] || { data: [], error: null };
    },
  };
};

const responses = Object.fromEntries(Object.values(FINES_MANAGEMENT_RPCS).map((rpc) => [rpc, { data: [{ ok: true }], error: null }]));
const client = makeClient(responses);

assert.deepEqual(await getFineRulesForManagement(client), [{ ok: true }]);
assert.deepEqual(await getFineSubjectsForManagement(client), [{ ok: true }]);
assert.deepEqual(await getFinesManagementList(client, { status: 'partial', limit: 50, offset: 10, seasonCode: '2026' }), [{ ok: true }]);
assert.deepEqual(await getFinesFinancialSummary(client, '2026'), { ok: true });
assert.deepEqual(await getFinesSubjectSummary(client, '2026'), [{ ok: true }]);
assert.deepEqual(await createFineIndividual(client, { ruleId: 'rule', subjectId: 'subject', occurredOn: '2026-09-02', note: 'nota' }), { ok: true });
assert.deepEqual(await createFineCollective(client, { ruleId: 'rule', subjectIds: ['a', 'b'], occurredOn: '2026-09-02', note: '' }), { ok: true });
assert.deepEqual(await recordFinePayment(client, { fineId: 'fine', amount: 2.5, paidOn: '2026-09-02', note: null }), { ok: true });
assert.deepEqual(await recordFineRefund(client, { fineId: 'fine', amount: 1, paidOn: '2026-09-02', note: 'ajuste' }), { ok: true });
assert.deepEqual(await cancelFine(client, { fineId: 'fine', reason: 'duplicada' }), { ok: true });

assert.deepEqual(client.calls, [
  ['get_fine_rules_for_management', undefined],
  ['get_fine_subjects_for_management', undefined],
  ['get_fines_management_list', { p_status: 'partial', p_limit: 50, p_offset: 10, p_season_code: '2026' }],
  ['get_fines_financial_summary', { p_season_code: '2026' }],
  ['get_fines_subject_summary', { p_season_code: '2026' }],
  ['create_fine_individual', { p_rule_id: 'rule', p_subject_id: 'subject', p_occurred_on: '2026-09-02', p_note: 'nota' }],
  ['create_fine_collective', { p_rule_id: 'rule', p_subject_ids: ['a', 'b'], p_occurred_on: '2026-09-02', p_note: null }],
  ['record_fine_payment', { p_fine_id: 'fine', p_amount: 2.5, p_paid_on: '2026-09-02', p_note: null }],
  ['record_fine_refund', { p_fine_id: 'fine', p_amount: 1, p_paid_on: '2026-09-02', p_note: 'ajuste' }],
  ['cancel_fine', { p_fine_id: 'fine', p_reason: 'duplicada' }],
]);

await assert.rejects(
  () => getFineRulesForManagement(makeClient({ get_fine_rules_for_management: { data: null, error: { message: 'denied' } } })),
  (error) => error instanceof FinesManagementError && error.operation === 'rules',
);
await assert.rejects(() => getFineRulesForManagement(null), FinesManagementError);

console.log('finesManagementStore: 10 RPC, parámetros exactos, respuestas y errores validados.');
