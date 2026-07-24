import assert from 'node:assert/strict';
import {
  OFFENSIVE_PHASE_LINE_HEIGHTS,
  getOffensiveBuildUpPositions,
  getOffensiveCreationPositions,
  getOffensiveFinishingPositions,
} from './offensivePhasePositions.js';
import { hasInitialPositionOverlap } from './defensiveBlockPositions.js';

const buildFormationSlots = (system) => {
  const lines = system.split('-').map(Number);
  const slots = [{ slot: 0, role: 'Portero', x: 50, y: 89 }];
  lines.forEach((lineSize, lineIndex) => {
    const margin = lineSize >= 5 ? 12 : lineSize === 4 ? 17 : lineSize === 3 ? 25 : lineSize === 2 ? 39 : 50;
    Array.from({ length: lineSize }, (_, playerIndex) => (
      lineSize === 1 ? 50 : margin + ((100 - margin * 2) * playerIndex) / (lineSize - 1)
    )).forEach((x) => slots.push({ slot: slots.length, x, y: 75 - lineIndex * 25 }));
  });
  return slots;
};
const averageY = (positions, team, start, count) => (
  Array.from({ length: count }, (_, index) => positions[`${team}:${start + index}`].y)
    .reduce((total, y) => total + y, 0) / count
);

const buildUp = getOffensiveBuildUpPositions({
  rivalSystem: '4-4-2',
  caudalSystem: '4-4-2',
  rivalFormationSlots: buildFormationSlots('4-4-2'),
  caudalFormationSlots: buildFormationSlots('4-4-2'),
});

assert.equal(Object.keys(buildUp).length, 22, 'Inicio genera los 22 jugadores');
assert.equal(hasInitialPositionOverlap(buildUp), false, 'Inicio no genera solapamientos');
assert.equal(buildUp['rival:0'].y, OFFENSIVE_PHASE_LINE_HEIGHTS.build_up.rival.goalkeeper);
assert.equal(averageY(buildUp, 'rival', 1, 4), 20, 'los defensas rivales inician abiertos cerca de su área');
assert.equal(averageY(buildUp, 'rival', 5, 4), 34.5, 'los medios rivales ofrecen líneas de pase');
assert.equal(averageY(buildUp, 'rival', 9, 2), 49, 'los atacantes rivales ocupan posiciones adelantadas');
assert.equal(buildUp['caudal:0'].y, 91, 'el portero del Caudal protege su área');
assert.equal(averageY(buildUp, 'caudal', 1, 4), 73, 'la defensa del Caudal queda retrasada');
assert.equal(averageY(buildUp, 'caudal', 9, 2), 28, 'los delanteros del Caudal presionan la primera línea rival');

const creation = getOffensiveCreationPositions({
  rivalSystem: '4-4-2',
  caudalSystem: '4-3-3',
  rivalFormationSlots: buildFormationSlots('4-4-2'),
  caudalFormationSlots: buildFormationSlots('4-3-3'),
});

assert.equal(Object.keys(creation).length, 22, 'Creación genera los 22 jugadores');
assert.equal(hasInitialPositionOverlap(creation), false, 'Creación no genera solapamientos');
assert.equal(creation['rival:0'].y, OFFENSIVE_PHASE_LINE_HEIGHTS.creation.rival.goalkeeper);
assert.equal(averageY(creation, 'rival', 1, 4), 36, 'la primera línea rival ya está adelantada');
assert.equal(averageY(creation, 'rival', 5, 4), 51.5, 'los medios rivales progresan en zona central');
assert.equal(averageY(creation, 'rival', 9, 2), 67, 'los atacantes rivales ocupan espacios avanzados');
assert.equal(averageY(creation, 'caudal', 1, 4), 76, 'la defensa del Caudal se relaciona con los atacantes');
assert.equal(averageY(creation, 'caudal', 5, 3), 59.5, 'el medio del Caudal protege los pasillos interiores');
assert.equal(averageY(creation, 'caudal', 8, 3), 43, 'los atacantes del Caudal orientan la progresión');
assert.ok(
  averageY(creation, 'caudal', 5, 3) < averageY(creation, 'rival', 9, 2),
  'las líneas de Creación quedan enfrentadas e intercaladas'
);

const finishing = getOffensiveFinishingPositions({
  rivalSystem: '5-3-2',
  caudalSystem: '4-3-3',
  rivalFormationSlots: buildFormationSlots('5-3-2'),
  caudalFormationSlots: buildFormationSlots('4-3-3'),
});

assert.equal(Object.keys(finishing).length, 22, 'Finalización genera los 22 jugadores');
assert.equal(hasInitialPositionOverlap(finishing), false, 'Finalización no genera solapamientos');
assert.equal(finishing['rival:0'].y, OFFENSIVE_PHASE_LINE_HEIGHTS.finishing.rival.goalkeeper);
assert.equal(averageY(finishing, 'rival', 1, 5), 52, 'la línea de equilibrio rival sostiene la jugada');
assert.equal(averageY(finishing, 'rival', 6, 3), 68.5, 'los medios rivales ocupan la frontal y la segunda línea');
assert.equal(averageY(finishing, 'rival', 9, 2), 85, 'los delanteros rivales atacan el área del Caudal');
assert.equal(finishing['caudal:0'].y, 92, 'el portero del Caudal permanece dentro de su área');
assert.equal(averageY(finishing, 'caudal', 1, 4), 82, 'la defensa del Caudal protege el área');
assert.equal(averageY(finishing, 'caudal', 5, 3), 67.5, 'los medios del Caudal protegen frontal e interiores');
assert.equal(averageY(finishing, 'caudal', 8, 3), 53, 'los atacantes del Caudal quedan preparados para transición');

console.log('offensivePhasePositions tests passed');
