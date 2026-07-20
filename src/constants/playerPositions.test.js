import assert from 'node:assert/strict';
import {
  getPlayerPositionPresentation,
  getPlayerSlotCompatibility,
  mapExternalPositionToPlayerPositions,
} from './playerPositions.js';

assert.deepEqual(mapExternalPositionToPlayerPositions('Extremo derecho'), {
  primaryNaturalPosition: 'forward', secondaryNaturalPositions: [], primarySpecificPosition: 'right_winger', secondarySpecificPositions: [],
  naturalPositions: ['forward'], specificPositions: ['right_winger'], position: 'Delantero', specificPosition: 'Extremo derecho',
});

const polyvalent = mapExternalPositionToPlayerPositions(['Defensa central', 'Pivote']);
assert.equal(polyvalent.primaryNaturalPosition, 'defender');
assert.deepEqual(polyvalent.secondaryNaturalPositions, ['midfielder']);
assert.equal(polyvalent.primarySpecificPosition, 'centre_back');
assert.deepEqual(polyvalent.secondarySpecificPositions, ['holding_midfield']);

const player = {
  primaryNaturalPosition: 'defender',
  secondaryNaturalPositions: ['midfielder'],
  primarySpecificPosition: 'right_back',
  secondarySpecificPositions: ['right_wing_back'],
};
assert.equal(getPlayerSlotCompatibility(player, 'Lateral derecho'), 100);
assert.equal(getPlayerSlotCompatibility(player, 'Carrilero derecho'), 85);
assert.equal(getPlayerSlotCompatibility(player, 'Lateral izquierdo'), 40);
assert.equal(getPlayerSlotCompatibility(player, 'Delantero centro'), 0);

assert.deepEqual(getPlayerPositionPresentation({
  primaryNaturalPosition: 'defender',
  primarySpecificPosition: 'right_back',
}), {
  short: 'LD', group: 'LATERALES DERECHOS', order: 10,
  specificKey: 'right_back', naturalKey: 'defender', label: 'Lateral derecho',
});
assert.equal(getPlayerPositionPresentation({ position: 'Defensa' }).group, 'DEFENSAS');
assert.equal(getPlayerPositionPresentation({ specificPosition: 'Extremo izquierdo', position: 'Delantero' }).short, 'EI');

console.log('playerPositions tests passed');
