import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  getStatsIndividualPositionOrder,
  sortStatsIndividualPlayers,
} from './statsIndividualOrder.js';

const starter = (id, name, number, primaryNaturalPosition, primarySpecificPosition, slot) => ({
  id,
  name,
  number,
  primaryNaturalPosition,
  primarySpecificPosition,
  slot,
  role: 'Titular',
});

const players = [
  starter('st', 'Delantero', 9, 'forward', 'centre_forward', 0),
  starter('lw', 'Extremo izquierdo', 11, 'forward', 'left_winger', 1),
  starter('am', 'Mediapunta', 10, 'midfielder', 'attacking_midfield', 2),
  starter('gk', 'Portero', 1, 'goalkeeper', 'goalkeeper', 10),
  starter('lb', 'Lateral izquierdo', 3, 'defender', 'left_back', 9),
  starter('cb5', 'Central Cinco', 5, 'defender', 'centre_back', 8),
  starter('rcb', 'Central derecho', 2, 'defender', 'right_centre_back', 7),
  starter('cb4', 'Central Cuatro', 4, 'defender', 'centre_back', 6),
  starter('rb', 'Lateral derecho', 6, 'defender', 'right_back', 5),
  starter('cm', 'Mediocentro', 8, 'midfielder', 'central_midfield', 4),
  starter('rw', 'Extremo derecho', 7, 'forward', 'right_winger', 3),
  { id: 'sub-gk', name: 'Portero suplente', number: 13, position: 'Portero', role: 'Suplente', slot: 0 },
  { id: 'sub-cb', name: 'Central suplente', number: 12, position: 'Defensa', specificPosition: 'Central', role: 'Suplente', slot: 1 },
  { id: 'sub-unknown', name: 'Sin posición', number: 20, role: 'Suplente', slot: 0 },
];

const originalPositions = players.map(({ id, primaryNaturalPosition, primarySpecificPosition, position, specificPosition }) => ({
  id,
  primaryNaturalPosition,
  primarySpecificPosition,
  position,
  specificPosition,
}));
const sorted = sortStatsIndividualPlayers(players, (player) => player.role);

assert.deepEqual(sorted.slice(0, 11).map((player) => player.id), [
  'gk',
  'rb', 'rcb', 'cb4', 'cb5', 'lb',
  'cm', 'am',
  'rw', 'st', 'lw',
], '4-2-3-1: titulares siguen el orden portero, defensas, medios y atacantes');
assert.deepEqual(sorted.slice(11).map((player) => player.id), ['sub-gk', 'sub-cb', 'sub-unknown'], 'los suplentes forman un bloque propio con posición desconocida al final');
assert.equal(sorted.indexOf(players[3]), 0, 'la ordenación conserva la misma referencia e identidad estable del jugador');
assert.deepEqual(players.map(({ id, primaryNaturalPosition, primarySpecificPosition, position, specificPosition }) => ({
  id,
  primaryNaturalPosition,
  primarySpecificPosition,
  position,
  specificPosition,
})), originalPositions, 'ordenar no modifica ninguna posición almacenada');
assert.equal(getStatsIndividualPositionOrder({ position: 'Defensa', slot: 0 }).family, 1, 'la posición registrada prevalece sobre un slot visual de portero');
assert.equal(getStatsIndividualPositionOrder({}).family, 99, 'una posición desconocida conserva un fallback final');

const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const performanceSource = appSource.slice(
  appSource.indexOf('const statRows ='),
  appSource.indexOf('const callupCounts =')
);
const tableSource = appSource.slice(
  appSource.indexOf('{statRows.map((player)'),
  appSource.indexOf('</tbody>', appSource.indexOf('{statRows.map((player)'))
);
assert.ok(performanceSource.includes('sortStatsIndividualPlayers'), 'Rendimiento Individual usa el comparador posicional');
assert.ok(tableSource.includes('updateStatsPlayerData(player.name'), 'las ediciones siguen asociadas al nombre estable, no al índice visual');
assert.ok(!tableSource.includes('statRows.map((player, index)'), 'el índice visual no participa en la identidad de las filas');

console.log('statsIndividualOrder tests passed');
