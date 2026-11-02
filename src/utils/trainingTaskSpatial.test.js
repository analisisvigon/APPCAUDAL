import assert from 'node:assert/strict';
import {
  accreditTrainingTaskZone,
  applyTrainingTaskZoneMetres,
  getTrainingTaskSpatialPosition,
  getTrainingTaskZoneMetres,
  readTrainingTaskSpace,
  synchronizeTrainingTaskSpatialMetadata,
} from './trainingTaskSpatial.js';

const space = readTrainingTaskSpace(20, 40);
assert.deepEqual(space, { widthM: 20, lengthM: 40 });
assert.equal(readTrainingTaskSpace(0, 40), null);

const zone = { id: 'zone-1', type: 'zone', x: 10, y: 18, width: 50, height: 36 };
assert.deepEqual(getTrainingTaskZoneMetres(zone, space), { widthM: 10, lengthM: 20 });

const measured = accreditTrainingTaskZone(zone, space);
assert.equal(measured.spatialMode, 'measured');
assert.equal(measured.zoneWidthM, 10);
assert.equal(measured.zoneLengthM, 20);

const resized = applyTrainingTaskZoneMetres(measured, space, { widthM: 8, lengthM: 12 });
assert.equal(resized.zoneWidthM, 8);
assert.equal(resized.zoneLengthM, 12);
assert.equal(Math.round(resized.width), 40);
assert.equal(Math.round(resized.height), 22);

const cone = { id: 'cone-1', type: 'cone', x: 25, y: 36 };
assert.deepEqual(getTrainingTaskSpatialPosition(cone, space), { widthM: 5, lengthM: 20 });
const synchronized = synchronizeTrainingTaskSpatialMetadata([resized, cone], space);
assert.equal(synchronized[0].spatialMode, 'measured');
assert.deepEqual(synchronized[1].spatialPosition, { version: 1, widthM: 5, lengthM: 20 });
assert.equal(synchronizeTrainingTaskSpatialMetadata([zone], null)[0], zone);

console.log('trainingTaskSpatial tests passed');
