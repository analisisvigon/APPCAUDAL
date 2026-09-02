export const FINES_MANAGEMENT_RPCS = Object.freeze({
  rules: 'get_fine_rules_for_management',
  subjects: 'get_fine_subjects_for_management',
  list: 'get_fines_management_list',
  financialSummary: 'get_fines_financial_summary',
  subjectSummary: 'get_fines_subject_summary',
  createIndividual: 'create_fine_individual',
  createCollective: 'create_fine_collective',
  payment: 'record_fine_payment',
  refund: 'record_fine_refund',
  cancel: 'cancel_fine',
});

export class FinesManagementError extends Error {
  constructor(operation, cause = null) {
    super(`Fines management operation failed: ${operation}`);
    this.name = 'FinesManagementError';
    this.operation = operation;
    this.cause = cause;
  }
}

const assertClient = (client, operation) => {
  if (!client || typeof client.rpc !== 'function') throw new FinesManagementError(operation);
};

const callRpc = async (client, operation, rpcName, args) => {
  assertClient(client, operation);
  let response;
  try {
    response = args === undefined ? await client.rpc(rpcName) : await client.rpc(rpcName, args);
  } catch (error) {
    throw new FinesManagementError(operation, error);
  }
  if (response?.error) throw new FinesManagementError(operation, response.error);
  return response?.data;
};

const asRows = (data, operation) => {
  if (data === null || data === undefined) return [];
  if (!Array.isArray(data)) throw new FinesManagementError(operation);
  return data;
};

const firstRow = (data, operation) => asRows(data, operation)[0] || null;

export async function getFineRulesForManagement(client) {
  return asRows(await callRpc(client, 'rules', FINES_MANAGEMENT_RPCS.rules), 'rules');
}

export async function getFineSubjectsForManagement(client) {
  return asRows(await callRpc(client, 'subjects', FINES_MANAGEMENT_RPCS.subjects), 'subjects');
}

export async function getFinesManagementList(client, {
  status = 'all',
  limit = 50,
  offset = 0,
  seasonCode = null,
} = {}) {
  return asRows(await callRpc(client, 'list', FINES_MANAGEMENT_RPCS.list, {
    p_status: status,
    p_limit: limit,
    p_offset: offset,
    p_season_code: seasonCode || null,
  }), 'list');
}

export async function getFinesFinancialSummary(client, seasonCode = null) {
  return firstRow(await callRpc(client, 'financialSummary', FINES_MANAGEMENT_RPCS.financialSummary, {
    p_season_code: seasonCode || null,
  }), 'financialSummary');
}

export async function getFinesSubjectSummary(client, seasonCode = null) {
  return asRows(await callRpc(client, 'subjectSummary', FINES_MANAGEMENT_RPCS.subjectSummary, {
    p_season_code: seasonCode || null,
  }), 'subjectSummary');
}

export async function createFineIndividual(client, {
  ruleId,
  subjectId,
  occurredOn,
  note = null,
}) {
  return firstRow(await callRpc(client, 'createIndividual', FINES_MANAGEMENT_RPCS.createIndividual, {
    p_rule_id: ruleId,
    p_subject_id: subjectId,
    p_occurred_on: occurredOn,
    p_note: note || null,
  }), 'createIndividual');
}

export async function createFineCollective(client, {
  ruleId,
  subjectIds,
  occurredOn,
  note = null,
}) {
  return firstRow(await callRpc(client, 'createCollective', FINES_MANAGEMENT_RPCS.createCollective, {
    p_rule_id: ruleId,
    p_subject_ids: subjectIds,
    p_occurred_on: occurredOn,
    p_note: note || null,
  }), 'createCollective');
}

export async function recordFinePayment(client, { fineId, amount, paidOn, note = null }) {
  return firstRow(await callRpc(client, 'payment', FINES_MANAGEMENT_RPCS.payment, {
    p_fine_id: fineId,
    p_amount: amount,
    p_paid_on: paidOn,
    p_note: note || null,
  }), 'payment');
}

export async function recordFineRefund(client, { fineId, amount, paidOn, note = null }) {
  return firstRow(await callRpc(client, 'refund', FINES_MANAGEMENT_RPCS.refund, {
    p_fine_id: fineId,
    p_amount: amount,
    p_paid_on: paidOn,
    p_note: note || null,
  }), 'refund');
}

export async function cancelFine(client, { fineId, reason }) {
  return firstRow(await callRpc(client, 'cancel', FINES_MANAGEMENT_RPCS.cancel, {
    p_fine_id: fineId,
    p_reason: reason,
  }), 'cancel');
}
