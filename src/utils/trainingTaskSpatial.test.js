import assert from 'node:assert/strict';
import {
  activateTrainingTaskMetricCalibration,
  applyTrainingTaskMetricZoneDimensions,
  createTrainingTaskMeasurement,
  createTrainingTaskMetricCalibration,
  getTrainingTaskBoardBounds,
  getTrainingTaskMeasurementDistance,
  getTrainingTaskMetricZoneDimensions,
  setTrainingTaskMeasurementDistance,
  updateTrainingTaskMetricPitch,
} from './trainingTaskSpatial.js';

const full = createTrainingTaskMetricCalibration('full');
assert.deepEqual(
  { length: full.viewLengthM, width: full.viewWidthM },
  { length: 105, width: 60 },
  'el campo completo usa 105 × 60 m',
);
assert.deepEqual(getTrainingTaskBoardBounds({ metricCalibration: full }), {
  width: 105, height: 60, metric: true,
});

const legacy = {
  pitchType: 'full',
  elements: [
    { id: 'cone-a', type: 'cone', x: 20, y: 18 },
    { id: 'zone-a', type: 'zone', x: 25, y: 20, width: 40, height: 24 },
  ],
};
const calibrated = activateTrainingTaskMetricCalibration(legacy);
assert.deepEqual(legacy, {
  pitchType: 'full',
  elements: [
    { id: 'cone-a', type: 'cone', x: 20, y: 18 },
    { id: 'zone-a', type: 'zone', x: 25, y: 20, width: 40, height: 24 },
  ],
}, 'activar la escala no muta la pizarra histórica');
assert.equal(calibrated.elements[0].x / 105, 20 / 100, 'conserva la posición visual horizontal');
assert.equal(calibrated.elements[0].y / 60, 18 / 72, 'conserva la posición visual vertical');

const exactZone = applyTrainingTaskMetricZoneDimensions(
  calibrated.elements[1], calibrated, { lengthM: 25, widthM: 20 },
);
assert.deepEqual(getTrainingTaskMetricZoneDimensions(exactZone, calibrated), {
  lengthM: 25, widthM: 20,
});

const elements = [
  { id: 'cone-1', type: 'cone', x: 10, y: 10 },
  { id: 'pole-1', type: 'pole', x: 13, y: 14 },
];
const measurement = createTrainingTaskMeasurement(
  { kind: 'element', elementId: 'cone-1' },
  { kind: 'element', elementId: 'pole-1' },
  'measurement-1',
);
assert.equal(getTrainingTaskMeasurementDistance(measurement, elements), 5, 'mide de centro a centro en metros');
const adjusted = setTrainingTaskMeasurementDistance(measurement, elements, 10, calibrated);
assert.equal(getTrainingTaskMeasurementDistance(measurement, adjusted), 10, 'ajusta el segundo objeto a una distancia exacta');

const half = updateTrainingTaskMetricPitch({ ...calibrated, measurements: [measurement] }, 'half');
assert.deepEqual(getTrainingTaskBoardBounds(half), { width: 52.5, height: 60, metric: true });
assert.equal(half.elements[0].x / 52.5, calibrated.elements[0].x / 105, 'cambiar a medio campo conserva la composición relativa');

console.log('training task metric spatial tests passed');
