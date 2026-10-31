import assert from 'node:assert/strict';
import { calendarWeekDays } from '../utils/teamCalendar.js';
import { loadMicrocycleCollectiveRecovery } from './microcycleCollectiveRecovery.js';

const days = calendarWeekDays('2026-10-28');
const empty = (day_date) => ({ day_date, rpe_average: null, rpe_responses: null,
  rpe_state: 'absent', wellness_average: null, wellness_responses: null,
  wellness_state: 'absent' });
const rows = days.map(empty);
rows[0] = { ...rows[0], rpe_average: '7.50', rpe_responses: 5, rpe_state: 'available',
  wellness_state: 'below_threshold' };
rows[1] = { ...rows[1], wellness_average: '0', wellness_responses: 5,
  wellness_state: 'available' };
const calls = [];
const client = { async rpc(name, args) { calls.push([name, args]); return { data: rows, error: null }; } };
assert.deepEqual(await loadMicrocycleCollectiveRecovery(client, 'cts-almadina', days, true), rows);
assert.deepEqual(calls, [['get_microcycle_collective_recovery_4d', {
  p_club_team_season_id: 'cts-almadina', p_week_starts_on: days[0],
}]]);
await assert.rejects(loadMicrocycleCollectiveRecovery(client, 'cts-almadina', days), /no está activada/);
await assert.rejects(loadMicrocycleCollectiveRecovery(client, '', days, true), /equipo/);
await assert.rejects(loadMicrocycleCollectiveRecovery(client, 'cts', days.slice(1), true), /semana/);
await assert.rejects(loadMicrocycleCollectiveRecovery({ rpc: async () => ({ data: rows.slice(1) }) },
  'cts', days, true), /semana completa/);
await assert.rejects(loadMicrocycleCollectiveRecovery({ rpc: async () => ({ data: [
  { ...rows[0], day_date: '2026-10-19' }, ...rows.slice(1),
] }) }, 'cts', days, true), /incompatibles/);
await assert.rejects(loadMicrocycleCollectiveRecovery({ rpc: async () => ({ data: [
  { ...rows[0], jugador_id: 'private' }, ...rows.slice(1),
] }) }, 'cts', days, true), /incompatibles/);
await assert.rejects(loadMicrocycleCollectiveRecovery({ rpc: async () => ({ data: [
  { ...rows[0], rpe_state: 'below_threshold', rpe_average: 7.5 }, ...rows.slice(1),
] }) }, 'cts', days, true), /privacidad/);
await assert.rejects(loadMicrocycleCollectiveRecovery({ rpc: async () => ({ data: [
  { ...rows[0], rpe_responses: 4 }, ...rows.slice(1),
] }) }, 'cts', days, true), /privacidad/);
await assert.rejects(loadMicrocycleCollectiveRecovery({ rpc: async () => ({ error: new Error('denegado') }) },
  'cts', days, true), /denegado/);
console.log('microcycleCollectiveRecovery: contrato, privacidad y bloqueo previo OK');
