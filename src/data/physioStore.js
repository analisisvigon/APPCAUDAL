const PHYSIO_TABLE = 'physio_treatments';
const PHYSIO_SUMMARY_RPC = 'get_physio_player_summary';
const PHYSIO_SELECT = `
  id,
  player_id,
  treatment_date,
  body_area,
  reason,
  treatment_types,
  case_type,
  availability_status,
  duration_minutes,
  notes,
  performed_by_name_snapshot,
  created_at,
  updated_at,
  player:jugadores!physio_treatments_player_id_fkey (
    id,
    name,
    shirt_name,
    number
  )
`;

export class PhysioStoreError extends Error {
  constructor(operation, cause = null) {
    super(`Physio operation failed: ${operation}`);
    this.name = 'PhysioStoreError';
    this.operation = operation;
    this.cause = cause;
  }
}

const assertClient = (client, operation) => {
  if (!client || typeof client.from !== 'function') throw new PhysioStoreError(operation);
};

const unwrap = async (operation, request) => {
  let response;
  try {
    response = await request;
  } catch (error) {
    throw new PhysioStoreError(operation, error);
  }
  if (response?.error) throw new PhysioStoreError(operation, response.error);
  return response?.data;
};

const normalizePlayer = (value) => (Array.isArray(value) ? value[0] || null : value || null);

export const normalizePhysioTreatment = (row) => row ? {
  ...row,
  treatment_types: Array.isArray(row.treatment_types) ? row.treatment_types : [],
  duration_minutes: row.duration_minutes === null || row.duration_minutes === undefined ? null : Number(row.duration_minutes),
  player: normalizePlayer(row.player),
} : null;

const normalizeRows = (rows) => (Array.isArray(rows) ? rows : []).map(normalizePhysioTreatment).filter(Boolean);

const editablePayload = (draft) => ({
  treatment_date: draft.treatmentDate,
  player_id: draft.playerId,
  body_area: draft.bodyArea,
  reason: String(draft.reason || '').trim(),
  treatment_types: [...new Set(draft.treatmentTypes || [])],
  case_type: draft.caseType,
  availability_status: draft.availabilityStatus,
  duration_minutes: String(draft.durationMinutes ?? '').trim() === '' ? null : Number(draft.durationMinutes),
  notes: String(draft.notes || '').trim() || null,
});

const orderedTreatmentQuery = (query) => query
  .order('treatment_date', { ascending: false })
  .order('created_at', { ascending: false })
  .order('id', { ascending: false });

export async function listTodayTreatments(client, treatmentDate) {
  assertClient(client, 'today');
  const query = orderedTreatmentQuery(client.from(PHYSIO_TABLE).select(PHYSIO_SELECT).eq('treatment_date', treatmentDate));
  return normalizeRows(await unwrap('today', query));
}

export async function listTreatmentsRange(client, startDate, endDate) {
  assertClient(client, 'range');
  const query = orderedTreatmentQuery(client.from(PHYSIO_TABLE).select(PHYSIO_SELECT)
    .gte('treatment_date', startDate)
    .lte('treatment_date', endDate));
  return normalizeRows(await unwrap('range', query));
}

export async function listTreatmentHistory(client, filters = {}, { limit = 50, offset = 0 } = {}) {
  assertClient(client, 'history');
  let query = client.from(PHYSIO_TABLE).select(PHYSIO_SELECT);
  if (filters.playerId) query = query.eq('player_id', filters.playerId);
  if (filters.dateFrom) query = query.gte('treatment_date', filters.dateFrom);
  if (filters.dateTo) query = query.lte('treatment_date', filters.dateTo);
  if (filters.bodyArea) query = query.eq('body_area', filters.bodyArea);
  if (filters.caseType) query = query.eq('case_type', filters.caseType);
  if (filters.availabilityStatus) query = query.eq('availability_status', filters.availabilityStatus);
  if (filters.performedByName) query = query.eq('performed_by_name_snapshot', filters.performedByName);
  query = orderedTreatmentQuery(query).range(offset, offset + limit - 1);
  return normalizeRows(await unwrap('history', query));
}

export async function createTreatment(client, draft) {
  assertClient(client, 'create');
  const request = client.from(PHYSIO_TABLE).insert(editablePayload(draft)).select(PHYSIO_SELECT).single();
  return normalizePhysioTreatment(await unwrap('create', request));
}

export async function updateTreatment(client, treatmentId, draft) {
  assertClient(client, 'update');
  const request = client.from(PHYSIO_TABLE).update(editablePayload(draft)).eq('id', treatmentId).select(PHYSIO_SELECT).single();
  return normalizePhysioTreatment(await unwrap('update', request));
}

export async function getPlayerPhysioSummary(client) {
  assertClient(client, 'summary');
  if (typeof client.rpc !== 'function') throw new PhysioStoreError('summary');
  return normalizeRows(await unwrap('summary', client.rpc(PHYSIO_SUMMARY_RPC)));
}

export const PHYSIO_STORE_CONTRACT = Object.freeze({ table: PHYSIO_TABLE, summaryRpc: PHYSIO_SUMMARY_RPC });
