import assert from 'node:assert/strict';
import {
  SET_PIECE_ELEMENT_DIMENSIONS,
  getSetPieceDimensionRange,
  normalizeSetPieceDimensionValue,
  normalizeSetPieceElementDimensions,
} from './setPieceElementDimensions.js';

const zone = { type: 'zone', x: 34, y: 18, width: 22, height: 12 };
const textBox = { type: 'text_box', x: 58, y: 10, width: 32, height: 24 };
const block = { type: 'block', x: 42, y: 34, width: 18, height: 8 };

assert.deepEqual(SET_PIECE_ELEMENT_DIMENSIONS.block, {
  width: { min: 5, max: 18, defaultValue: 18 },
});

assert.equal(normalizeSetPieceDimensionValue(zone, 'width', -20, zone.width), 4);
assert.equal(normalizeSetPieceDimensionValue(zone, 'width', 200, zone.width), 60);
assert.equal(normalizeSetPieceDimensionValue(zone, 'height', 0, zone.height), 4);
assert.equal(normalizeSetPieceDimensionValue(zone, 'height', 90, zone.height), 42);
assert.equal(normalizeSetPieceDimensionValue(zone, 'width', '', zone.width), 22);
assert.equal(normalizeSetPieceDimensionValue(zone, 'height', 'texto', zone.height), 12);

assert.equal(getSetPieceDimensionRange(textBox, 'width').max, 42);
assert.equal(getSetPieceDimensionRange({ ...zone, y: 60 }, 'height').max, 12);
assert.equal(normalizeSetPieceDimensionValue(textBox, 'width', 60, textBox.width), 42);
assert.equal(normalizeSetPieceDimensionValue(textBox, 'width', -1, textBox.width), 8);
assert.equal(normalizeSetPieceDimensionValue(textBox, 'height', -1, textBox.height), 6);
assert.equal(normalizeSetPieceDimensionValue(textBox, 'height', 100, textBox.height), 42);
assert.equal(normalizeSetPieceDimensionValue(block, 'width', -1, block.width), 5);
assert.equal(normalizeSetPieceDimensionValue(block, 'width', 100, block.width), 18);
assert.equal(getSetPieceDimensionRange(block, 'height'), null);

const legacy = { type: 'zone', x: 80, y: 64, width: 140, height: -8 };
const legacySnapshot = { ...legacy };
const normalizedLegacyCopy = normalizeSetPieceElementDimensions(legacy);
assert.deepEqual(legacy, legacySnapshot);
assert.deepEqual(normalizedLegacyCopy, { ...legacy, width: 20, height: 4 });

const unsupported = { type: 'player', x: 50, y: 30, width: 999 };
assert.deepEqual(normalizeSetPieceElementDimensions(unsupported), unsupported);
assert.equal(normalizeSetPieceElementDimensions(unsupported), unsupported);

console.log('setPieceElementDimensions tests passed');
