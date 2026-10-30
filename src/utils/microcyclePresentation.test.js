import assert from 'node:assert/strict';
import { microcycleDayIntensity, normalizeMicrocycleDay,
  plannedMicrocycleMinutes } from './microcyclePresentation.js';

assert.deepEqual(microcycleDayIntensity({ intensity: 'Media' }),
  { level: 3, label: 'Media', peak: false });
assert.deepEqual(microcycleDayIntensity({ type: 'Descanso', intensity: 'Alta' }),
  { level: 0, label: 'Descanso', peak: false });
assert.deepEqual(microcycleDayIntensity({ type: 'Partido', intensity: 'Baja' }),
  { level: 5, label: 'Partido', peak: true });
assert.deepEqual(microcycleDayIntensity({ intensity: 'Baja' }, true),
  { level: 5, label: 'Partido', peak: true });
assert.equal(plannedMicrocycleMinutes(['a', 'b', 'c'], {
  a: { durationMinutes: '60' }, b: { durationMinutes: 30 }, c: { durationMinutes: '' },
}), 90);
assert.deepEqual(normalizeMicrocycleDay({ type: 'Partido', intensity: 'Media', objective: 'Competir' }),
  { type: 'Partido', intensity: 'Muy alta', objective: 'Competir' });
assert.deepEqual(normalizeMicrocycleDay({ type: 'Entrenamiento', intensity: 'Media' }),
  { type: 'Entrenamiento', intensity: 'Media' });

console.log('microcycle presentation: OK');
