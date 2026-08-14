import assert from 'node:assert/strict';
import {
  filterRpeEntriesByRange,
  getRpeWorkloadAvailability,
  getValidRpeValue,
  resolveRpePeriodEntries,
  resolveRpeRefreshEntries,
  summarizeRpeEntries,
} from './performanceRpe.js';

const realAugustFixture = [
  { jugador_id: 'vicente-uuid', entry_date: '2026-08-13', rpe: 5, session_id: null, duration_minutes: 0, load: 0 },
  { jugador_id: 'borja-uuid', entry_date: '2026-08-13', rpe: 4, session_id: null, duration_minutes: 0, load: 0 },
  { jugador_id: 'kike-uuid', entry_date: '2026-08-13', rpe: 2, session_id: null, duration_minutes: 0, load: 0 },
  { jugador_id: 'davo-uuid', entry_date: '2026-08-13', rpe: 3, session_id: null, duration_minutes: 0, load: 0 },
  { jugador_id: 'samu-uuid', entry_date: '2026-08-13', rpe: 6, session_id: null, duration_minutes: 0, load: 0 },
];

const realSummary = summarizeRpeEntries(realAugustFixture);
assert.equal(realSummary.count, 5);
assert.equal(realSummary.average, 4);
assert.deepEqual(realSummary.values, [5, 4, 2, 3, 6]);

assert.equal(getValidRpeValue(null), null, 'La ausencia de RPE no puede convertirse en cero.');
assert.equal(getValidRpeValue(''), null);
assert.equal(getValidRpeValue(0), null);
assert.equal(getValidRpeValue(6), 6);
assert.equal(summarizeRpeEntries([...realAugustFixture, { entry_date: '2026-08-13', rpe: null }]).average, 4);

realAugustFixture.forEach((entry) => {
  assert.deepEqual(
    getRpeWorkloadAvailability(entry),
    { durationMinutes: null, load: null },
    'Los ceros técnicos sin sesión deben presentarse como ausencia de duración y carga.',
  );
});

assert.deepEqual(
  getRpeWorkloadAvailability({ session_id: 'session-uuid', duration_minutes: 70, load: 420 }),
  { durationMinutes: 70, load: 420 },
);
assert.deepEqual(
  getRpeWorkloadAvailability({ session_id: 'session-uuid', duration_minutes: 70, load: null }),
  { durationMinutes: 70, load: null },
);

const multiPeriodFixture = [
  { jugador_id: 'vicente-uuid', entry_date: '2026-07-20', rpe: 4 },
  ...realAugustFixture,
  { jugador_id: 'vicente-uuid', entry_date: '2026-08-20', rpe: 7 },
  { jugador_id: 'vicente-uuid', entry_date: '2026-09-03', rpe: 6 },
];

assert.equal(filterRpeEntriesByRange(multiPeriodFixture, '2026-08-10', '2026-08-16').length, 5);
assert.equal(filterRpeEntriesByRange(multiPeriodFixture, '2026-08-17', '2026-08-23').length, 1);
const augustEntries = filterRpeEntriesByRange(multiPeriodFixture, '2026-08-01', '2026-08-31');
const seasonEntries = filterRpeEntriesByRange(multiPeriodFixture, '2026-07-01', '2027-06-30');
assert.equal(augustEntries.length, 6);
assert.equal(seasonEntries.length, 8);
assert.deepEqual([...new Set(seasonEntries.map((entry) => entry.entry_date.slice(0, 7)))], ['2026-07', '2026-08', '2026-09']);

assert.equal(resolveRpePeriodEntries({
  period: 'week',
  weeklyEntries: realAugustFixture,
  periodEntries: multiPeriodFixture,
}).length, 5);
assert.equal(resolveRpePeriodEntries({
  period: 'month',
  periodEntries: augustEntries,
  expectedPeriodKey: 'month:2026-08',
  loadedPeriodKey: 'month:2026-08',
}).length, 6);
assert.equal(resolveRpePeriodEntries({
  period: 'season',
  periodEntries: seasonEntries,
  expectedPeriodKey: 'season:2026',
  loadedPeriodKey: 'season:2026',
}).length, 8);
assert.deepEqual(resolveRpePeriodEntries({
  period: 'season',
  periodEntries: multiPeriodFixture,
  expectedPeriodKey: 'season:2026',
  loadedPeriodKey: 'season:2025',
}), [], 'Una caché de otro periodo no debe mezclarse con la temporada seleccionada.');

const initialFourResponses = realAugustFixture.slice(0, 4);
assert.equal(resolveRpeRefreshEntries(initialFourResponses, realAugustFixture, true).length, 5);
assert.deepEqual(
  resolveRpeRefreshEntries(initialFourResponses, [], false),
  initialFourResponses,
  'Si falla el refresco deben conservarse las cuatro respuestas ya visibles.',
);

console.log('performanceRpe: RPE diario, periodos y ausencia de carga validados.');
