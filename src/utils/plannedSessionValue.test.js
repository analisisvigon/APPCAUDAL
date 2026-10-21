import assert from 'node:assert/strict';
import { savePlannedSessionValue } from '../data/plannedSessionsStore.js';
import { parsePlannedSessionValue, readPlannedSessionValue } from './plannedSessionValue.js';

assert.equal(parsePlannedSessionValue('7'), 7);
assert.equal(parsePlannedSessionValue('8,5'), 8.5);
assert.equal(parsePlannedSessionValue('8.5'), 8.5);
assert.equal(parsePlannedSessionValue('0'), 0);
assert.equal(parsePlannedSessionValue('10'), 10);
assert.equal(parsePlannedSessionValue(''), null);
for (const invalid of ['-1', '10.01', '11', 'texto', '1e1']) {
  assert.throws(() => parsePlannedSessionValue(invalid), { code: '22023' });
}
assert.deepEqual(readPlannedSessionValue({ session_value: 8.5 }), { supported: true, value: '8.5' });
assert.deepEqual(readPlannedSessionValue({ session_value: null }), { supported: true, value: '' });
assert.deepEqual(readPlannedSessionValue({ revision: 4 }), { supported: false, value: '' });

const calls = [];
const client = { async rpc(name, args) {
  calls.push([name, args]);
  if (args.p_expected_revision === 99) return { data: null, error: { code: '40001', message: 'Revisión obsoleta' } };
  return { data: args.p_expected_revision + 1, error: null };
} };
assert.equal(await savePlannedSessionValue(client, 'session-id', 4, '7'), 5);
assert.equal(await savePlannedSessionValue(client, 'session-id', 5, '8,5'), 6);
assert.equal(await savePlannedSessionValue(client, 'session-id', 6, ''), 7);
assert.deepEqual(calls.map(([, args]) => args.p_value), [7, 8.5, null]);
assert.ok(calls.every(([name]) => name === 'save_planned_session_value_06'));
await assert.rejects(savePlannedSessionValue(client, 'session-id', 99, '7'), { code: '40001' });
const countBeforeInvalid = calls.length;
await assert.rejects(savePlannedSessionValue(client, 'session-id', 7, '-1'), { code: '22023' });
await assert.rejects(savePlannedSessionValue(client, 'session-id', 7, '11'), { code: '22023' });
assert.equal(calls.length, countBeforeInvalid, 'los valores inválidos no llegan a la RPC');
console.log('planned session value tests passed');
