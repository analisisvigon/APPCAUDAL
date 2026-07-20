import assert from 'node:assert/strict';
import {
  buildIntelligentLineup,
  buildIntelligentReservePlacements,
  getPlayerRoleFitScore,
  isPlayerCompatibleWithRole,
  movePlayerInLineup,
  sanitizeTacticalLineup,
} from './rivalTactics.js';

const coordinates = Array.from({ length: 3 }, (_, slot) => ({ x: 10 + slot * 20, y: 50 }));
const a = { id: 'a', name: 'A', position: 'Defensa', specificPosition: 'Lateral derecho', slot: 0 };
const b = { id: 'b', name: 'B', position: 'Defensa', specificPosition: 'Defensa central', slot: 1 };
const c = { id: 'c', name: 'C', position: 'Centrocampista', specificPosition: 'Mediocentro', slot: 2 };
const swapped = movePlayerInLineup({ lineup: [a, b], player: a, targetSlot: 1, coordinates });
assert.equal(swapped.find((player) => player.id === 'a').slot, 1);
assert.equal(swapped.find((player) => player.id === 'b').slot, 0);
assert.equal(new Set(swapped.map((player) => player.slot)).size, swapped.length, 'nunca hay dos jugadores en el mismo slot');
assert.equal(new Set(swapped.map((player) => player.id)).size, swapped.length, 'nunca se duplica un jugador');

const movedToEmpty = movePlayerInLineup({ lineup: [a, b], player: a, targetSlot: 2, coordinates });
assert.deepEqual(movedToEmpty.map(({ id, slot }) => ({ id, slot })), [{ id: 'b', slot: 1 }, { id: 'a', slot: 2 }], 'mover a un hueco vacío solo mueve al jugador arrastrado');
assert.equal(movedToEmpty.some((player) => player.slot === 0), false, 'el hueco de origen permanece vacío');

const isolatedSwap = movePlayerInLineup({ lineup: [a, b, c], player: a, targetSlot: 1, coordinates });
assert.equal(isolatedSwap.find((player) => player.id === 'a').slot, 1);
assert.equal(isolatedSwap.find((player) => player.id === 'b').slot, 0);
assert.equal(isolatedSwap.find((player) => player.id === 'c').slot, 2, 'un intercambio no recoloca a terceros');

assert.equal(sanitizeTacticalLineup([{ ...a, slot: 0 }, { ...b, slot: 0 }]).length, 1, 'se limpia una superposición previa');
assert.equal(isPlayerCompatibleWithRole(a, 'Lateral derecho'), true);
assert.equal(getPlayerRoleFitScore(a, 'Lateral derecho'), 100, 'la posición específica principal obtiene compatibilidad máxima');
assert.equal(getPlayerRoleFitScore(a, 'Lateral izquierdo'), 40, 'misma posición natural con función distinta conserva compatibilidad baja');
assert.ok(getPlayerRoleFitScore(b, 'Central derecho') > getPlayerRoleFitScore(b, 'Delantero'));

const roles = ['Portero', 'Central derecho', 'Pivote', 'Delantero'];
const players = [
  { id: 'gk', name: 'Portero', position: 'Portero', role: 'Titular' },
  { id: 'cb', name: 'Central', position: 'Defensa', specificPosition: 'Defensa central', role: 'Titular' },
  { id: 'dm', name: 'Pivote', position: 'Centrocampista', specificPosition: 'Pivote', role: 'Reserva' },
  { id: 'st', name: 'Nueve', position: 'Atacante', specificPosition: 'Delantero centro', role: 'Titular' },
  { id: 'unknown', name: 'Sin posición', position: '', role: 'Titular' },
];
const automatic = buildIntelligentLineup({ players, roles, coordinates: Array.from({ length: 4 }, () => ({ x: 50, y: 50 })) });
assert.deepEqual(automatic.lineup.map((player) => player.id), ['gk', 'cb', 'dm', 'st']);
assert.equal(automatic.unplacedPlayers.some((player) => player.id === 'unknown'), true, 'un perfil incompatible queda sin colocar');

const changedSystem = buildIntelligentLineup({
  players,
  roles: ['Portero', 'Central izquierdo', 'Mediocentro', 'Delantero'],
  coordinates: Array.from({ length: 4 }, () => ({ x: 50, y: 50 })),
  currentLineup: automatic.lineup,
});
assert.equal(changedSystem.lineup.find((player) => player.id === 'gk').slot, 0);
assert.equal(changedSystem.lineup.find((player) => player.id === 'st').slot, 3);

const reserves = buildIntelligentReservePlacements({
  players: [
    { id: 'r1', name: 'Reserva 1', position: 'Portero' },
    { id: 'r2', name: 'Reserva 2', position: 'Portero' },
    { id: 'r3', name: 'Reserva 3', position: 'Portero' },
  ],
  roles: ['Portero'],
});
assert.equal(reserves.placements.length, 2, 'solo se admiten dos reservas por posición');
assert.equal(reserves.unplacedPlayers[0].id, 'r3', 'el tercer reserva queda sin colocar');

console.log('rivalTactics tests passed');
