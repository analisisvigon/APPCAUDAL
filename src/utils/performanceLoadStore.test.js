import assert from 'node:assert/strict';

import {
  getTrainingLoadForDate,
  loadTrainingLoadsRange,
  replaceTrainingLoadByDate,
  saveDailyTeamLoad,
} from './performanceLoadStore.js';

const queryCalls = [];
const loadedRows = [{
  id: 'session-1',
  session_date: '2026-08-10',
  session_type: 'training',
  actual_duration_minutes: 63,
  notes: null,
  record_kind: 'daily_team_load',
  updated_at: '2026-08-10T12:00:00Z',
  training_session_load_metrics: [{
    id: 'metrics-1',
    session_id: 'session-1',
    scope: 'team',
    jugador_id: null,
    aggregation_method: 'team_average',
    distance_m: 4250,
    hsr_m: 75,
    accelerations: 48,
    decelerations: 43,
    sprints: 2,
    meters_per_minute: 63,
    load_units: 320,
  }],
}];

const query = {
  select(value) { queryCalls.push(['select', value]); return this; },
  eq(column, value) { queryCalls.push(['eq', column, value]); return this; },
  gte(column, value) { queryCalls.push(['gte', column, value]); return this; },
  lte(column, value) { queryCalls.push(['lte', column, value]); return this; },
  order(column, options) {
    queryCalls.push(['order', column, options]);
    return Promise.resolve({ data: loadedRows, error: null });
  },
};
const loadClient = {
  from(table) { queryCalls.push(['from', table]); return query; },
};

const loads = await loadTrainingLoadsRange(loadClient, '2026-08-10', '2026-08-16');
assert.equal(loads.length, 1);
assert.equal(getTrainingLoadForDate(loads, '2026-08-10')?.metrics?.distance_m, 4250);
assert.equal(getTrainingLoadForDate(loads, '2026-08-11'), null);
assert.deepEqual(queryCalls.filter(([method]) => method === 'from'), [['from', 'training_sessions']]);
assert.ok(queryCalls.some((call) => call[0] === 'gte' && call[2] === '2026-08-10'));
assert.ok(queryCalls.some((call) => call[0] === 'lte' && call[2] === '2026-08-16'));

const savedByDate = new Map();
let createdSessions = 0;
const rpcCalls = [];
const saveClient = {
  async rpc(name, params) {
    rpcCalls.push([name, params]);
    let saved = savedByDate.get(params.p_session_date);
    if (!saved) {
      createdSessions += 1;
      saved = {
        session: {
          id: `session-${createdSessions}`,
          session_date: params.p_session_date,
          session_type: params.p_session_type,
          actual_duration_minutes: params.p_actual_duration_minutes,
          notes: params.p_notes,
          record_kind: 'daily_team_load',
        },
        metrics: {
          id: `metrics-${createdSessions}`,
          session_id: `session-${createdSessions}`,
          scope: 'team',
          jugador_id: null,
          aggregation_method: 'team_average',
        },
      };
      savedByDate.set(params.p_session_date, saved);
    }
    saved.session.session_type = params.p_session_type;
    saved.session.actual_duration_minutes = params.p_actual_duration_minutes;
    saved.metrics.distance_m = params.p_distance_m;
    saved.metrics.load_units = params.p_load_units;
    return { data: structuredClone(saved), error: null };
  },
};

const baseDraft = {
  sessionDate: '2026-08-10',
  sessionType: 'training',
  actualDurationMinutes: '63',
  distanceKm: '4,25',
  hsrM: '',
  accelerations: '',
  decelerations: '',
  sprints: '',
  metersPerMinute: '',
  loadUnits: '320',
  notes: '',
};
const firstSave = await saveDailyTeamLoad(saveClient, baseDraft);
const editedSave = await saveDailyTeamLoad(saveClient, { ...baseDraft, actualDurationMinutes: '70', distanceKm: '5' });
const repeatedSave = await saveDailyTeamLoad(saveClient, { ...baseDraft, actualDurationMinutes: '70', distanceKm: '5' });

assert.equal(createdSessions, 1, 'crear, editar y repetir no deben simular sesiones duplicadas');
assert.equal(savedByDate.size, 1);
assert.equal(firstSave.session.id, editedSave.session.id);
assert.equal(editedSave.session.id, repeatedSave.session.id);
assert.equal(editedSave.session.actual_duration_minutes, 70);
assert.equal(editedSave.metrics.distance_m, 5000);
assert.equal(editedSave.metrics.load_units, 320);
assert.equal(rpcCalls.length, 3);
assert.ok(rpcCalls.every(([name]) => name === 'upsert_team_daily_training_load'));

const replaced = replaceTrainingLoadByDate(loads, editedSave);
assert.equal(replaced.length, 1);
assert.equal(replaced[0].metrics.distance_m, 5000);
assert.equal(replaced[0].metrics.load_units, 320);

console.log('performanceLoadStore: all assertions passed');
