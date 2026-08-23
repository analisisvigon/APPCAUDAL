import assert from 'node:assert/strict';
import { ALL_SPECIFIC_POSITION_OPTIONS } from '../constants/playerPositions.js';
import {
  PLAYER_POSITION_MAP_ORIENTATION,
  buildPlayerPositionMapModel,
  getPositionMapCoordinates,
} from './playerPositionMap.js';

assert.deepEqual(PLAYER_POSITION_MAP_ORIENTATION, { attack: 'up', horizontal: 'player-perspective' });

for (const position of ALL_SPECIFIC_POSITION_OPTIONS) {
  const coordinates = getPositionMapCoordinates(position.value);
  assert.ok(coordinates, `${position.label} debe disponer de coordenadas compartidas`);
  assert.ok(coordinates.x >= 0 && coordinates.x <= 1 && coordinates.y >= 0 && coordinates.y <= 1);
}
assert.ok(getPositionMapCoordinates('Pivote derecho').x > getPositionMapCoordinates('Pivote izquierdo').x, 'derecha e izquierda respetan la orientación canónica del jugador');
assert.ok(getPositionMapCoordinates('Lateral derecho').x > getPositionMapCoordinates('Lateral izquierdo').x);
assert.ok(getPositionMapCoordinates('Extremo derecho').x > getPositionMapCoordinates('Extremo izquierdo').x);
for (const tacticalLabel of ['Portero', 'Lateral derecho', 'Lateral izquierdo', 'Central derecho', 'Defensa central', 'Central izquierdo', 'Pivote', 'Pivote derecho', 'Pivote izquierdo', 'Interior derecho', 'Mediocentro', 'Interior izquierdo', 'Extremo derecho', 'Extremo izquierdo', 'Mediapunta', 'Carrilero derecho', 'Carrilero izquierdo', 'Delantero centro']) {
  assert.ok(getPositionMapCoordinates(tacticalLabel), `${tacticalLabel} procede de snapshots y debe poder representarse`);
}
assert.equal(getPositionMapCoordinates('Defensa'), null, 'una posición genérica no recibe coordenadas tácticas inventadas');

const single = buildPlayerPositionMapModel({
  totalMinutes: 180,
  determinedMinutes: 180,
  unknownMinutes: 0,
  positions: [{ position: 'Lateral izquierdo', minutes: 180, percentage: 100 }],
});
assert.equal(single.positions.length, 1);
assert.equal(single.positions[0].level, 'principal');
assert.equal(single.positions[0].percentage, 100);
assert.equal(single.markers.length, 1);

const polyvalent = buildPlayerPositionMapModel({
  totalMinutes: 1000,
  determinedMinutes: 1000,
  unknownMinutes: 0,
  positions: [
    { position: 'Carrilero izquierdo', minutes: 100 },
    { position: 'Lateral izquierdo', minutes: 700 },
    { position: 'Central izquierdo', minutes: 200 },
  ],
});
assert.deepEqual(polyvalent.positions.map(({ position, minutes, percentage, level }) => [position, minutes, percentage, level]), [
  ['Lateral izquierdo', 700, 70, 'principal'],
  ['Central izquierdo', 200, 20, 'secondary'],
  ['Carrilero izquierdo', 100, 10, 'other'],
]);

const borja = buildPlayerPositionMapModel({
  totalMinutes: 180,
  determinedMinutes: 167,
  unknownMinutes: 13,
  positions: [{ position: 'Lateral izquierdo', minutes: 167, percentage: 100 }],
});
assert.equal(borja.positions[0].percentage, 93, 'Borja muestra 167/180 y no redistribuye los 13 minutos desconocidos');
assert.equal(borja.unknownPositionMinutes, 13);
assert.equal(borja.valid, true);

const empty = buildPlayerPositionMapModel({ totalMinutes: 0, determinedMinutes: 0, unknownMinutes: 0, positions: [] });
assert.equal(empty.empty, true);
assert.equal(empty.hasPositionData, false);
assert.deepEqual(empty.markers, []);

const unplottable = buildPlayerPositionMapModel({
  totalMinutes: 90,
  determinedMinutes: 90,
  unknownMinutes: 0,
  positions: [{ position: 'Defensa', minutes: 90 }],
});
assert.equal(unplottable.positions[0].percentage, 100);
assert.equal(unplottable.markers.length, 0);
assert.equal(unplottable.unmappedPositions.length, 1);

console.log('playerPositionMap tests passed');
