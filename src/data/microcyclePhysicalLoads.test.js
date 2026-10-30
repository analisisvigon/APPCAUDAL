import assert from 'node:assert/strict';
import { calendarWeekDays } from '../utils/teamCalendar.js';
import { PERFORMANCE_LOAD_METRIC_CONFIG } from '../utils/performanceLoad.js';
import { loadMicrocyclePhysicalLoads, summarizeMicrocyclePhysicalLoads } from './microcyclePhysicalLoads.js';

const days = calendarWeekDays('2026-10-28');
const row = (id, date, overrides = {}) => ({
  training_session_id: id, session_date: date, session_type: 'training',
  actual_duration_minutes: 60, load_units: 100, distance_m: 4000,
  hsr_m: 120, accelerations: 20, decelerations: 15, sprints: 2,
  meters_per_minute: 80, has_team_metrics: true, ...overrides,
});
const rows = [row('s1', days[0]), row('s2', days[0], {
  actual_duration_minutes: 30, load_units: 50, distance_m: 2000,
  meters_per_minute: 100, hsr_m: null,
}), row('s3', days[2], { session_type: 'match', load_units: 70 })];
const config = (key) => PERFORMANCE_LOAD_METRIC_CONFIG.find((item) => item.key === key);

const uc = summarizeMicrocyclePhysicalLoads(rows, days, config('loadUnits'));
assert.equal(uc.sessionCount, 3);
assert.equal(uc.trainingCount, 2);
assert.equal(uc.matchCount, 1);
assert.equal(uc.daily[0].value, 150, 'doble sesion: suma una vez por sesion');
assert.equal(uc.daily[0].sessionCount, 2);
assert.equal(uc.daily[1].value, null, 'sin registro no equivale a cero');
assert.equal(uc.value, 220);
assert.equal(uc.partial, false);
assert.equal(summarizeMicrocyclePhysicalLoads(rows, days, config('distanceKm')).daily[0].value, 6);
const hsr = summarizeMicrocyclePhysicalLoads(rows, days, config('hsrM'));
assert.equal(hsr.daily[0].value, 120);
assert.equal(hsr.daily[0].partial, true);
assert.equal(hsr.partial, true);
const speed = summarizeMicrocyclePhysicalLoads(rows, days, config('metersPerMinute'));
assert.equal(speed.daily[0].value, (80 * 60 + 100 * 30) / 90,
  'M/min conserva la ponderacion por duracion');
assert.equal(summarizeMicrocyclePhysicalLoads(rows, days, config('actualDurationMinutes')).daily[0].value, 90);
assert.equal(summarizeMicrocyclePhysicalLoads([], days, config('loadUnits')).value, null);
assert.equal(summarizeMicrocyclePhysicalLoads([row('zero', days[0], { load_units: 0 })],
  days, config('loadUnits')).daily[0].value, 0, 'cero acreditado se conserva');

const calls = [];
const client = { async rpc(name, args) { calls.push([name, args]); return { data: rows, error: null }; } };
assert.deepEqual(await loadMicrocyclePhysicalLoads(client, 'cts-almadina', days), rows);
assert.deepEqual(calls, [['get_microcycle_team_loads_4a', {
  p_club_team_season_id: 'cts-almadina', p_week_starts_on: days[0],
}]]);
await assert.rejects(loadMicrocyclePhysicalLoads(client, '', days), /equipo/);
await assert.rejects(loadMicrocyclePhysicalLoads(client, 'cts', days.slice(1)), /semana/);
await assert.rejects(loadMicrocyclePhysicalLoads({ rpc: async () => ({ data: [row('caudal', '2026-10-19')] }) },
  'cts-almadina', days), /incompatibles/);
await assert.rejects(loadMicrocyclePhysicalLoads({ rpc: async () => ({ data: [rows[0], rows[0]] }) },
  'cts-almadina', days), /incompatibles/);
await assert.rejects(loadMicrocyclePhysicalLoads({ rpc: async () => ({ error: new Error('sin acceso') }) },
  'cts-almadina', days), /sin acceso/);
console.log('microcyclePhysicalLoads: consulta CTS y agregaciones locales OK');
