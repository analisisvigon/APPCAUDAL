import assert from 'node:assert/strict';
import {
  getPlayerPositionLabel,
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

assert.equal(getPlayerPositionLabel({
  name: 'Borja Rodríguez',
  position: 'Defensa',
  primarySpecificPosition: 'left_back',
}), 'Lateral izquierdo');
assert.equal(getPlayerPositionLabel({
  name: 'I. Delgado',
  position: 'Defensa',
  specific_position: 'right_back',
}), 'Lateral derecho');
assert.equal(getPlayerPositionLabel({
  name: 'Agustín Porto',
  position: 'Centrocampista',
  primarySpecificPosition: 'holding_midfield',
}), 'Pivote');
assert.equal(getPlayerPositionLabel({
  name: 'Kike Fanjul',
  position: 'Centrocampista',
}), 'Centrocampista');
assert.equal(getPlayerPositionLabel({ position: 'Defensa', specificPosition: 'Central' }), 'Defensa central');
assert.equal(getPlayerPositionLabel({ position: 'Centrocampista', specificPosition: 'Pivote defensivo' }), 'Pivote defensivo');
assert.equal(getPlayerPositionLabel({ position: 'Defensa', specificPosition: 'unknown_internal_code' }), 'Defensa');
assert.equal(getPlayerPositionLabel({ position: 'null' }), 'Posición no indicada');
assert.equal(getPlayerPositionLabel({}), 'Posición no indicada');

console.log('playerPositions tests passed');
