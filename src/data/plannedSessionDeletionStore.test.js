import assert from 'node:assert/strict';
import { checkPlannedSessionDeletion, canDeletePlannedSessionContext, deletePlannedSession } from './plannedSessionDeletionStore.js';

const sessionId = '10000000-0000-4000-8000-000000000001';
const contextId = '20000000-0000-4000-8000-000000000001';
const request = { sessionId, contextId, revision: 4, confirmed: true };
const receipt = { status: 'deleted', session_id: sessionId, club_team_season_id: contextId, revision: 4 };
assert.equal(await checkPlannedSessionDeletion({ rpc: async () => ({ data: true }) }), true);
assert.equal(await checkPlannedSessionDeletion({ rpc: async () => ({ error: { code: 'PGRST202' } }) }), false);
assert.equal(await checkPlannedSessionDeletion({ rpc: async () => ({ data: 'true' }) }), false);
await assert.rejects(checkPlannedSessionDeletion({ rpc: async () => ({ error: new Error('network') }) }), /network/);
assert.equal(await canDeletePlannedSessionContext({ rpc: async (name, args) => {
  assert.equal(name, 'can_write_club_team_season');
  assert.deepEqual(args, { target_club_team_season_id: contextId });
  return { data: true };
} }, contextId), true, 'STAFF asignado usa el permiso del servidor, no una concesión global de rol');

// Contract tests: the backend response is simulated, never a live deletion.
for (const kind of ['empty', 'roster', 'first_team', 'library_items']) {
  const calls = [];
  const client = {
    rpc: async (name, args) => {
      calls.push(name);
      assert.equal(name, 'delete_planned_session_v1');
      assert.deepEqual(args, { p_session_id: sessionId, p_club_team_season_id: contextId,
        p_expected_revision: 4, p_confirm: true });
      return { data: receipt };
    },
    from: (table) => {
      assert.equal(table, 'planned_training_sessions', `${kind}: solo verifica la sesión`);
      const filters = [];
      return { select(columns) { assert.equal(columns, 'id'); return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        async maybeSingle() {
          assert.deepEqual(filters, [['id', sessionId], ['club_team_season_id', contextId]]);
          return { data: null };
        } };
    },
  };
  assert.deepEqual(await deletePlannedSession(client, request), receipt);
  assert.equal(calls.length, 1, `${kind}: una transacción, sin cascada en cliente`);
}
for (const reason of ['Temporada cerrada', 'Sin permiso CTS', 'Revisión obsoleta', 'Dependencia externa']) {
  let read = false;
  await assert.rejects(deletePlannedSession({
    rpc: async () => ({ error: new Error(reason) }),
    from: () => { read = true; throw new Error('unexpected'); },
  }, request), new RegExp(reason));
  assert.equal(read, false, 'un rechazo nunca se presenta como eliminación confirmada');
}
let called = false;
await assert.rejects(deletePlannedSession({ rpc: () => { called = true; } }, { ...request, confirmed: false }), /Confirma/);
await assert.rejects(deletePlannedSession({ rpc: () => { called = true; } }, { ...request, revision: null }), /revisión/);
assert.equal(called, false);
await assert.rejects(deletePlannedSession({ rpc: async () => ({ data: { ...receipt, session_id: 'wrong' } }) }, request), /no confirmó/);
await assert.rejects(deletePlannedSession({ rpc: async () => ({ error: { code: 'PGRST202' } }) }, request), /Falta instalar/);
const queryClient = (response) => ({ rpc: async () => ({ data: receipt }),
  from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => response }) });
await assert.rejects(deletePlannedSession(queryClient({ data: { id: sessionId } }), request), /sigue visible/);
await assert.rejects(deletePlannedSession(queryClient({ error: new Error('failed confirmation read') }), request), /failed confirmation read/);
console.log('planned session deletion store: OK (simulated RPC/reads, no real database)');
