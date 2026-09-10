import assert from 'node:assert/strict';
import {
  PHYSIO_STORE_CONTRACT,
  PhysioStoreError,
  createTreatment,
  getPlayerPhysioSummary,
  listTodayTreatments,
  listTreatmentHistory,
  listTreatmentsRange,
  updateTreatment,
} from './physioStore.js';

const row = {
  id: 'treatment-1',
  player_id: 'player-1',
  treatment_date: '2026-09-10',
  treatment_types: ['massage_release'],
  duration_minutes: null,
  player: [{ id: 'player-1', name: 'Jugador Uno', shirt_name: 'UNO', number: 7 }],
};

const makeQuery = (result = { data: [row], error: null }) => {
  const calls = [];
  const query = {
    calls,
    select(value) { calls.push(['select', value]); return query; },
    eq(...args) { calls.push(['eq', ...args]); return query; },
    gte(...args) { calls.push(['gte', ...args]); return query; },
    lte(...args) { calls.push(['lte', ...args]); return query; },
    order(...args) { calls.push(['order', ...args]); return query; },
    range(...args) { calls.push(['range', ...args]); return query; },
    insert(value) { calls.push(['insert', value]); return query; },
    update(value) { calls.push(['update', value]); return query; },
    single() { calls.push(['single']); return Promise.resolve({ ...result, data: Array.isArray(result.data) ? result.data[0] : result.data }); },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
  };
  return query;
};

const makeClient = () => {
  const queries = [];
  const rpcCalls = [];
  return {
    queries,
    rpcCalls,
    from(table) { const query = makeQuery(); queries.push({ table, query }); return query; },
    async rpc(name, args) { rpcCalls.push([name, args]); return { data: [{ player_id: 'player-1', total_treatments: 2, body_area_counts: [] }], error: null }; },
  };
};

const client = makeClient();
assert.equal((await listTodayTreatments(client, '2026-09-10'))[0].player.name, 'Jugador Uno');
assert.deepEqual(client.queries[0].query.calls.filter(([name]) => name === 'eq')[0], ['eq', 'treatment_date', '2026-09-10']);

await listTreatmentsRange(client, '2026-09-07', '2026-09-13');
assert.ok(client.queries[1].query.calls.some((call) => call[0] === 'gte' && call[2] === '2026-09-07'));
assert.ok(client.queries[1].query.calls.some((call) => call[0] === 'lte' && call[2] === '2026-09-13'));

await listTreatmentHistory(client, {
  playerId: 'player-1', dateFrom: '2026-08-01', dateTo: '2026-09-10', bodyArea: 'knee',
  caseType: 'follow_up', availabilityStatus: 'limited', performedByName: 'Fisio Uno',
}, { limit: 25, offset: 50 });
const historyCalls = client.queries[2].query.calls;
for (const expected of [
  ['eq', 'player_id', 'player-1'], ['gte', 'treatment_date', '2026-08-01'], ['lte', 'treatment_date', '2026-09-10'],
  ['eq', 'body_area', 'knee'], ['eq', 'case_type', 'follow_up'], ['eq', 'availability_status', 'limited'],
  ['eq', 'performed_by_name_snapshot', 'Fisio Uno'], ['range', 50, 74],
]) assert.ok(historyCalls.some((call) => JSON.stringify(call) === JSON.stringify(expected)), `Falta filtro ${expected.join(':')}`);

const draft = {
  treatmentDate: '2026-09-10', playerId: 'player-1', bodyArea: 'hamstrings', reason: ' Sobrecarga ',
  treatmentTypes: ['massage_release', 'massage_release', 'stretching'], caseType: 'new', availabilityStatus: 'available',
  durationMinutes: '', notes: '  ',
};
await createTreatment(client, draft);
const insertPayload = client.queries[3].query.calls.find(([name]) => name === 'insert')[1];
assert.deepEqual(insertPayload, {
  treatment_date: '2026-09-10', player_id: 'player-1', body_area: 'hamstrings', reason: 'Sobrecarga',
  treatment_types: ['massage_release', 'stretching'], case_type: 'new', availability_status: 'available',
  duration_minutes: null, notes: null,
});
for (const protectedField of ['id', 'club_id', 'performed_by_user_id', 'performed_by_name_snapshot', 'created_at', 'updated_at']) {
  assert.equal(Object.hasOwn(insertPayload, protectedField), false, `${protectedField} debe derivarse en backend`);
}

await updateTreatment(client, 'treatment-1', { ...draft, durationMinutes: '30', notes: 'Trabajo suave' });
const updatePayload = client.queries[4].query.calls.find(([name]) => name === 'update')[1];
assert.equal(updatePayload.duration_minutes, 30);
assert.equal(updatePayload.notes, 'Trabajo suave');
assert.ok(client.queries[4].query.calls.some((call) => JSON.stringify(call) === JSON.stringify(['eq', 'id', 'treatment-1'])));

assert.deepEqual(await getPlayerPhysioSummary(client), [{ player_id: 'player-1', total_treatments: 2, body_area_counts: [], treatment_types: [], duration_minutes: null, player: null }]);
assert.deepEqual(client.rpcCalls, [[PHYSIO_STORE_CONTRACT.summaryRpc, undefined]]);
assert.equal(PHYSIO_STORE_CONTRACT.table, 'physio_treatments');

await assert.rejects(() => listTodayTreatments(null, '2026-09-10'), PhysioStoreError);
await assert.rejects(() => getPlayerPhysioSummary({ from() {} }), PhysioStoreError);

console.log('physioStore: CRUD PostgREST, filtros, paginación, payload protegido, NULL y RPC de resumen validados.');
