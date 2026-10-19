import assert from 'node:assert/strict';
import {
  confirmPlannedSession, listPlannedLibraryTasks, savePlannedSession,
} from './plannedSessionsStore.js';

const calls = [];
const client = {
  from(table) {
    assert.equal(table, 'training_tasks');
    const query = {
      select(columns) { calls.push(['select', columns]); return this; },
      eq(column, value) { calls.push(['eq', column, value]); return this; },
      order(column, options) { calls.push(['order', column, options]); return this; },
      then(resolve) { resolve({ data: [
        { id: 'allowed', club_id: 'current', name: 'Rondo' },
        { id: 'other', club_id: 'other', name: 'Ajena' },
      ], error: null }); },
    };
    return query;
  },
  async rpc(name, args) { calls.push(['rpc', name, args]); return { data: 5, error: null }; },
};
assert.deepEqual(await listPlannedLibraryTasks(client, null), []);
const visible = await listPlannedLibraryTasks(client, 'current');
assert.deepEqual(visible.map((row) => row.id), ['allowed'], 'defensa en profundidad del club');
assert.ok(calls.some((call) => call[0] === 'eq' && call[1] === 'club_id' && call[2] === 'current'));
assert.ok(calls.some((call) => call[0] === 'select' && call[1].includes('editor_payload')));
await savePlannedSession(client, { p_session_id: 'session-1' }, true);
await confirmPlannedSession(client, 'session-1', 5, true);
await savePlannedSession(client, { p_session_id: 'free-session' });
await confirmPlannedSession(client, 'free-session', 5);
assert.deepEqual(calls.filter((call) => call[0] === 'rpc').map((call) => call[1]), [
  'save_planned_session_03c', 'confirm_planned_session_03c',
  'save_planned_session', 'confirm_planned_session',
]);
assert.deepEqual(calls.find((call) => call[1] === 'confirm_planned_session_03c')[2],
  { p_session_id: 'session-1', p_expected_revision: 5 });

const deniedClient = { rpc: async () => ({ data: null, error: { code: '42501', message: 'Sin acceso' } }) };
await assert.rejects(savePlannedSession(deniedClient, {}, true), (error) => error.code === '42501');
const staleClient = { rpc: async () => ({ data: null, error: { code: '40001', message: 'Revisión obsoleta' } }) };
await assert.rejects(savePlannedSession(staleClient, {}, true), (error) => error.code === '40001');
const uploadClient = { rpc: async () => ({ data: null, error: { code: '0A000', message: 'Upload no admitido' } }) };
await assert.rejects(savePlannedSession(uploadClient, {}, true), (error) => error.code === '0A000');

console.log('planned sessions 03C store tests passed (mocks, sin Supabase)');
