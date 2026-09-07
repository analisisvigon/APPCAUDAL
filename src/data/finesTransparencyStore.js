export const FINES_TRANSPARENCY_PAGE_SIZE = 30;

export const FINES_TRANSPARENCY_RPCS = Object.freeze({
  summary: 'get_fines_transparency_summary',
  subjects: 'get_fines_transparency_subjects',
  rules: 'get_fines_transparency_rules',
  list: 'get_fines_transparency_list',
});

export class FinesTransparencyError extends Error {
  constructor(operation, cause = null) {
    super('No se pudo cargar la transparencia de multas.');
    this.name = 'FinesTransparencyError';
    this.operation = operation;
    this.cause = cause;
  }
}

const cleanText = (value) => String(value ?? '').trim();
const optionalText = (value) => cleanText(value) || null;
const amount = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};
const count = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
};
const date = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(cleanText(value)) ? cleanText(value) : null);

const callRpc = async (client, operation, rpc, args) => {
  if (!client || typeof client.rpc !== 'function') throw new FinesTransparencyError(operation);
  let response;
  try {
    response = args === undefined ? await client.rpc(rpc) : await client.rpc(rpc, args);
  } catch (error) {
    throw new FinesTransparencyError(operation, error);
  }
  if (response?.error) throw new FinesTransparencyError(operation, response.error);
  return response?.data;
};

const rows = (data, operation) => {
  if (data === null || data === undefined) return [];
  if (!Array.isArray(data)) throw new FinesTransparencyError(operation);
  return data;
};

export const normalizeFinesTransparencySummary = (row = {}) => ({
  season_code: optionalText(row.season_code),
  total_fines: count(row.total_fines),
  active_fines: count(row.active_fines),
  unpaid_count: count(row.unpaid_count),
  partial_count: count(row.partial_count),
  paid_count: count(row.paid_count),
  cancelled_count: count(row.cancelled_count),
  overdue_count: count(row.overdue_count),
  generated_total: amount(row.generated_total),
  collected_total: amount(row.collected_total),
  pending_total: amount(row.pending_total),
});

export const normalizeFinesTransparencySubject = (row = {}) => ({
  subject_name: optionalText(row.subject_name),
  fine_count: count(row.fine_count),
  active_count: count(row.active_count),
  paid_count: count(row.paid_count),
  overdue_count: count(row.overdue_count),
  generated_total: amount(row.generated_total),
  collected_total: amount(row.collected_total),
  pending_total: amount(row.pending_total),
});

export const normalizeFinesTransparencyRule = (row = {}) => ({
  rule_name: optionalText(row.rule_name),
  fine_count: count(row.fine_count),
  active_count: count(row.active_count),
  paid_count: count(row.paid_count),
  generated_total: amount(row.generated_total),
  collected_total: amount(row.collected_total),
  pending_total: amount(row.pending_total),
});

export const normalizeFinesTransparencyFine = (row = {}) => ({
  subject_name: optionalText(row.subject_name),
  rule_name: optionalText(row.rule_name),
  occurred_on: date(row.occurred_on),
  original_amount: amount(row.original_amount),
  surcharge_amount: amount(row.surcharge_amount),
  generated_amount: amount(row.generated_amount),
  collected_amount: amount(row.collected_amount),
  pending_amount: amount(row.pending_amount),
  due_on: date(row.due_on),
  financial_status: optionalText(row.financial_status),
  lifecycle_status: optionalText(row.lifecycle_status),
  is_overdue: row.is_overdue === true,
  note: optionalText(row.note),
});

export async function getFinesTransparencySummary(client) {
  const data = rows(await callRpc(client, 'summary', FINES_TRANSPARENCY_RPCS.summary), 'summary');
  if (data.length !== 1) throw new FinesTransparencyError('summary');
  return normalizeFinesTransparencySummary(data[0]);
}

export async function getFinesTransparencySubjects(client) {
  return rows(await callRpc(client, 'subjects', FINES_TRANSPARENCY_RPCS.subjects), 'subjects')
    .map(normalizeFinesTransparencySubject);
}

export async function getFinesTransparencyRules(client) {
  return rows(await callRpc(client, 'rules', FINES_TRANSPARENCY_RPCS.rules), 'rules')
    .map(normalizeFinesTransparencyRule);
}

export async function getFinesTransparencyList(client, { limit = FINES_TRANSPARENCY_PAGE_SIZE, offset = 0 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) {
    throw new FinesTransparencyError('list');
  }
  return rows(await callRpc(client, 'list', FINES_TRANSPARENCY_RPCS.list, {
    p_limit: limit,
    p_offset: offset,
  }), 'list').map(normalizeFinesTransparencyFine);
}
