export const PLAYER_FINES_PAGE_SIZE = 30;

export const PLAYER_FINES_RPCS = Object.freeze({
  list: 'get_my_fines',
  summary: 'get_my_fines_summary',
});

export class PlayerFinesLoadError extends Error {
  constructor(operation, kind = 'network') {
    super(kind === 'invalid_session'
      ? 'La sesión ya no es válida.'
      : kind === 'invalid_response'
        ? 'No se pudo validar la respuesta de Mis multas.'
        : 'No se pudieron cargar tus multas.');
    this.name = 'PlayerFinesLoadError';
    this.operation = operation;
    this.kind = kind;
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

export const normalizePlayerFine = (row = {}) => ({
  fine_id: optionalText(row.fine_id),
  occurred_on: date(row.occurred_on),
  rule_name: optionalText(row.rule_name),
  rule_description: optionalText(row.rule_description),
  note: optionalText(row.note),
  original_amount: amount(row.original_amount),
  surcharge_amount: amount(row.surcharge_amount),
  generated_amount: amount(row.generated_amount),
  collected_amount: amount(row.collected_amount),
  pending_amount: amount(row.pending_amount),
  financial_status: optionalText(row.financial_status),
  lifecycle_status: optionalText(row.lifecycle_status),
  due_on: date(row.due_on),
  cancellation_reason: optionalText(row.cancellation_reason),
});

export const normalizePlayerFinesSummary = (row = {}) => ({
  active_fines: count(row.active_fines),
  paid_count: count(row.paid_count),
  surcharge_total: amount(row.surcharge_total),
  collected_total: amount(row.collected_total),
  pending_total: amount(row.pending_total),
});

const getErrorKind = (error) => {
  const status = Number(error?.status || error?.statusCode);
  const code = cleanText(error?.code).toUpperCase();
  const message = cleanText(error?.message).toLowerCase();
  return status === 401 || code === 'PGRST301' || message.includes('jwt expired') || message.includes('invalid jwt')
    ? 'invalid_session'
    : 'network';
};

const assertClient = (client, operation) => {
  if (!client || typeof client.rpc !== 'function') throw new PlayerFinesLoadError(operation, 'invalid_session');
};

export async function getMyFines(client, { limit = PLAYER_FINES_PAGE_SIZE, offset = 0 } = {}) {
  const operation = 'list';
  assertClient(client, operation);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) {
    throw new PlayerFinesLoadError(operation, 'invalid_response');
  }

  let response;
  try {
    response = await client.rpc(PLAYER_FINES_RPCS.list, { p_limit: limit, p_offset: offset });
  } catch (error) {
    throw new PlayerFinesLoadError(operation, getErrorKind(error));
  }
  if (response?.error) throw new PlayerFinesLoadError(operation, getErrorKind(response.error));
  if (response?.data === null || response?.data === undefined) return [];
  if (!Array.isArray(response.data)) throw new PlayerFinesLoadError(operation, 'invalid_response');
  return response.data.map(normalizePlayerFine);
}

export async function getMyFinesSummary(client) {
  const operation = 'summary';
  assertClient(client, operation);
  let response;
  try {
    response = await client.rpc(PLAYER_FINES_RPCS.summary);
  } catch (error) {
    throw new PlayerFinesLoadError(operation, getErrorKind(error));
  }
  if (response?.error) throw new PlayerFinesLoadError(operation, getErrorKind(response.error));
  if (!Array.isArray(response?.data) || response.data.length !== 1) {
    throw new PlayerFinesLoadError(operation, 'invalid_response');
  }
  return normalizePlayerFinesSummary(response.data[0]);
}
