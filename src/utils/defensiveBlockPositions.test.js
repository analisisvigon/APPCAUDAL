import assert from 'node:assert/strict';
import {
  DEFENSIVE_BLOCK_LINE_HEIGHTS,
  getDefensiveBlockInitialPositions,
  getHighBlockPositions,
  getLowBlockPositions,
  getMidBlockPositions,
  hasInitialPositionOverlap,
} from './defensiveBlockPositions.js';

const parseSystem = (system) => String(system).split('-').map(Number);
const spreadLine = (lineSize) => {
  if (lineSize === 1) return [50];
  const margin = lineSize >= 5 ? 12 : lineSize === 4 ? 17 : lineSize === 3 ? 25 : 39;
  return Array.from({ length: lineSize }, (_, index) => margin + ((100 - margin * 2) * index) / (lineSize - 1));
};
const buildFormationSlots = (system) => {
  const lineSizes = parseSystem(system);
  const slots = [{ slot: 0, role: 'Portero', x: 50, y: 89 }];
  lineSizes.forEach((lineSize, lineIndex) => {
    spreadLine(lineSize).forEach((x, playerIndex) => {
      slots.push({
        slot: slots.length,
        role: `Línea ${lineIndex + 1} · jugador ${playerIndex + 1}`,
        x,
        y: 75 - lineIndex * 25,
      });
    });
  });
  return slots;
};
const buildPreset = (defensiveSituation, rivalSystem, caudalSystem) => getDefensiveBlockInitialPositions({
  defensiveSituation,
  rivalSystem,
  caudalSystem,
  rivalFormationSlots: buildFormationSlots(rivalSystem),
  caudalFormationSlots: buildFormationSlots(caudalSystem),
});
const getLineKeys = (team, system, lineIndex) => {
  const lineSizes = parseSystem(system);
  const offset = 1 + lineSizes.slice(0, lineIndex).reduce((total, lineSize) => total + lineSize, 0);
  return Array.from({ length: lineSizes[lineIndex] }, (_, index) => `${team}:${offset + index}`);
};
const averageY = (positions, keys) => keys.reduce((total, key) => total + positions[key].y, 0) / keys.length;
const assertNoInitialOverlap = (positions, label) => {
  assert.equal(Object.keys(positions).length, 22, `${label}: deben generarse los 22 jugadores`);
  assert.equal(hasInitialPositionOverlap(positions), false, `${label}: no puede haber solapamientos iniciales`);
};

const lowBlock = buildPreset('low_block', '4-4-2', '4-4-2');
assertNoInitialOverlap(lowBlock, 'Bloque bajo 4-4-2 vs 4-4-2');
assert.equal(lowBlock['rival:0'].y, DEFENSIVE_BLOCK_LINE_HEIGHTS.low_block.rival.goalkeeper);
assert.equal(averageY(lowBlock, getLineKeys('rival', '4-4-2', 0)), 18, 'la defensa rival queda próxima a su área');
assert.equal(averageY(lowBlock, getLineKeys('rival', '4-4-2', 1)), 29, 'el medio rival protege por delante');
assert.equal(averageY(lowBlock, getLineKeys('rival', '4-4-2', 2)), 40, 'los delanteros rivales quedan cerca del sector central');
assert.equal(lowBlock['caudal:0'].y, 85, 'el portero del Caudal queda alejado de la acción');
assert.equal(averageY(lowBlock, getLineKeys('caudal', '4-4-2', 0)), 56, 'la defensa del Caudal adelanta sus vigilancias');
assert.equal(averageY(lowBlock, getLineKeys('caudal', '4-4-2', 2)), 24, 'los atacantes del Caudal fijan la última línea');

const midBlock = buildPreset('mid_block', '4-4-2', '4-3-3');
assertNoInitialOverlap(midBlock, 'Bloque medio 4-3-3 vs 4-4-2');
assert.equal(averageY(midBlock, getLineKeys('rival', '4-4-2', 0)), 32);
assert.equal(averageY(midBlock, getLineKeys('rival', '4-4-2', 1)), 45);
assert.equal(averageY(midBlock, getLineKeys('rival', '4-4-2', 2)), 58);
assert.equal(averageY(midBlock, getLineKeys('caudal', '4-3-3', 0)), 71);
assert.equal(averageY(midBlock, getLineKeys('caudal', '4-3-3', 1)), 55);
assert.equal(averageY(midBlock, getLineKeys('caudal', '4-3-3', 2)), 39);
assert.ok(
  averageY(midBlock, getLineKeys('caudal', '4-3-3', 1))
    < averageY(midBlock, getLineKeys('rival', '4-4-2', 2)),
  'en bloque medio los centrocampistas del Caudal se intercalan con la primera presión rival'
);

const highBlock = buildPreset('high_block', '5-3-2', '4-3-3');
assertNoInitialOverlap(highBlock, 'Bloque alto 4-3-3 vs 5-3-2');
assert.equal(averageY(highBlock, getLineKeys('rival', '5-3-2', 0)), 49, 'la defensa rival queda a la altura del medio campo');
assert.equal(averageY(highBlock, getLineKeys('rival', '5-3-2', 1)), 61);
assert.equal(averageY(highBlock, getLineKeys('rival', '5-3-2', 2)), 73, 'los puntas rivales presionan la salida');
assert.equal(highBlock['caudal:0'].y, 90, 'el Caudal inicia con su portero en el área');
assert.equal(averageY(highBlock, getLineKeys('caudal', '4-3-3', 0)), 80, 'los defensas del Caudal ofrecen la primera línea de pase');

const lowViaNamedFunction = getLowBlockPositions({
  rivalSystem: '4-4-2',
  caudalSystem: '4-4-2',
  rivalFormationSlots: buildFormationSlots('4-4-2'),
  caudalFormationSlots: buildFormationSlots('4-4-2'),
});
const midViaNamedFunction = getMidBlockPositions({
  rivalSystem: '4-4-2',
  caudalSystem: '4-3-3',
  rivalFormationSlots: buildFormationSlots('4-4-2'),
  caudalFormationSlots: buildFormationSlots('4-3-3'),
});
const highViaNamedFunction = getHighBlockPositions({
  rivalSystem: '5-3-2',
  caudalSystem: '4-3-3',
  rivalFormationSlots: buildFormationSlots('5-3-2'),
  caudalFormationSlots: buildFormationSlots('4-3-3'),
});
assert.deepEqual(lowViaNamedFunction, lowBlock);
assert.deepEqual(midViaNamedFunction, midBlock);
assert.deepEqual(highViaNamedFunction, highBlock);

const manuallyMovedLowPlay = {
  defensiveSituation: 'low_block',
  playerPositions: {
    ...lowBlock,
    'rival:1': { x: 33.25, y: 27.5 },
    'caudal:6': { x: 48.5, y: 42.75 },
  },
};
const reloadedLowPlay = JSON.parse(JSON.stringify(manuallyMovedLowPlay));
assert.deepEqual(reloadedLowPlay.playerPositions['rival:1'], { x: 33.25, y: 27.5 }, 'la posición manual rival sobrevive a la recarga');
assert.deepEqual(reloadedLowPlay.playerPositions['caudal:6'], { x: 48.5, y: 42.75 }, 'la posición manual del Caudal sobrevive a la recarga');
assert.notDeepEqual(midBlock['rival:1'], reloadedLowPlay.playerPositions['rival:1'], 'el bloque medio permanece aislado');
assert.notDeepEqual(highBlock['caudal:6'], reloadedLowPlay.playerPositions['caudal:6'], 'el bloque alto permanece aislado');

const sourceSlots = buildFormationSlots('4-4-2');
const sourceSnapshot = JSON.stringify(sourceSlots);
buildPreset('low_block', '4-4-2', '4-4-2');
assert.equal(JSON.stringify(sourceSlots), sourceSnapshot, 'generar un preset no modifica la formación de origen');

console.log('defensiveBlockPositions tests passed');
