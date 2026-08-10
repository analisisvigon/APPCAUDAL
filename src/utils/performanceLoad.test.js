import assert from 'node:assert/strict';

import {
  buildDailyLoadDraft,
  buildDailyLoadRpcParams,
  isIsoCalendarDate,
  parseNullablePerformanceNumber,
  validateDailyLoad,
} from './performanceLoad.js';

assert.equal(parseNullablePerformanceNumber('4,25'), 4.25);
assert.equal(parseNullablePerformanceNumber('4.25'), 4.25);
assert.equal(parseNullablePerformanceNumber('80'), 80);
assert.equal(parseNullablePerformanceNumber('80,5'), 80.5);
assert.equal(parseNullablePerformanceNumber('  '), null);
assert.equal(parseNullablePerformanceNumber(null), null);
assert.throws(() => parseNullablePerformanceNumber('1,234.50'), /Formato numérico/);
assert.throws(() => parseNullablePerformanceNumber('1.2.3'), /Formato numérico/);

const validDraft = {
  sessionDate: '2026-08-10',
  sessionType: 'training',
  actualDurationMinutes: '63',
  distanceKm: '4,25',
  hsrM: '75',
  accelerations: '48',
  decelerations: '43',
  sprints: '2',
  metersPerMinute: '63',
  notes: 'Trabajo de campo reducido',
};

assert.equal(validateDailyLoad(validDraft).isValid, true);
assert.deepEqual(buildDailyLoadRpcParams(validDraft), {
  p_session_date: '2026-08-10',
  p_session_type: 'training',
  p_actual_duration_minutes: 63,
  p_distance_m: 4250,
  p_hsr_m: 75,
  p_accelerations: 48,
  p_decelerations: 43,
  p_sprints: 2,
  p_meters_per_minute: 63,
  p_notes: 'Trabajo de campo reducido',
});

const pointDraft = { ...validDraft, distanceKm: '4.25', hsrM: '80.5' };
assert.equal(buildDailyLoadRpcParams(pointDraft).p_distance_m, 4250);
assert.equal(buildDailyLoadRpcParams(pointDraft).p_hsr_m, 80.5);

const nullableRestDraft = {
  sessionDate: '2026-08-11',
  sessionType: 'rest',
  actualDurationMinutes: '',
  distanceKm: '',
  hsrM: '',
  accelerations: '',
  decelerations: '',
  sprints: '',
  metersPerMinute: '',
  notes: '',
};
assert.equal(validateDailyLoad(nullableRestDraft).isValid, true);
assert.deepEqual(buildDailyLoadRpcParams(nullableRestDraft), {
  p_session_date: '2026-08-11',
  p_session_type: 'rest',
  p_actual_duration_minutes: null,
  p_distance_m: null,
  p_hsr_m: null,
  p_accelerations: null,
  p_decelerations: null,
  p_sprints: null,
  p_meters_per_minute: null,
  p_notes: null,
});

const missingDuration = validateDailyLoad({ ...nullableRestDraft, sessionType: 'match' });
assert.equal(missingDuration.isValid, false);
assert.match(missingDuration.errors.actualDurationMinutes, /obligatorio/);

for (const field of ['actualDurationMinutes', 'distanceKm', 'hsrM', 'accelerations', 'decelerations', 'sprints', 'metersPerMinute']) {
  const result = validateDailyLoad({ ...validDraft, [field]: '-1' });
  assert.equal(result.isValid, false, `${field} debe rechazar negativos`);
  assert.match(result.errors[field], /negativo|mayor que cero/);
}

assert.equal(validateDailyLoad({ ...validDraft, accelerations: '2,5' }).isValid, false);
assert.equal(isIsoCalendarDate('2026-08-10'), true);
assert.equal(isIsoCalendarDate('2026-02-29'), false);
assert.equal(isIsoCalendarDate('2028-02-29'), true);
assert.equal(isIsoCalendarDate('10/08/2026'), false);
assert.equal(buildDailyLoadRpcParams(validDraft).p_session_date, '2026-08-10');

const loadedDraft = buildDailyLoadDraft({
  session: {
    id: 'session-1',
    session_date: '2026-08-10',
    session_type: 'training',
    actual_duration_minutes: 63,
    notes: 'Observación',
  },
  metrics: {
    distance_m: 4250,
    hsr_m: 75,
    accelerations: 48,
    decelerations: 43,
    sprints: 2,
    meters_per_minute: 63,
  },
});
assert.equal(loadedDraft.sessionDate, '2026-08-10');
assert.equal(loadedDraft.distanceKm, '4,25');
assert.equal(loadedDraft.notes, 'Observación');

console.log('performanceLoad: all assertions passed');
