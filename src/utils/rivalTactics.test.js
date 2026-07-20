import assert from 'node:assert/strict';
import {
  applyPlayerMove,
  buildTacticalPlacements,
  buildIntelligentLineup,
  buildIntelligentReservePlacements,
  getPlayerRoleFitScore,
  isPlayerCompatibleWithRole,
  movePlayerInLineup,
  sanitizeTacticalLineup,
} from './rivalTactics.js';

const placement = (status, slotIndex = null, reserveOrder = null) => ({ status, slotIndex, reserveOrder });
const basePlacements = {
  a: placement('starter', 0),
  b: placement('starter', 1),
  c: placement('reserve', 0, 0),
  d: placement('reserve', 0, 1),
  e: placement('unplaced'),
  f: placement('inactive'),
};
const move = (playerId, destination, placements = basePlacements) => applyPlayerMove({ placements, playerId, destination });

const starterToEmpty = move('a', placement('starter', 2));
assert.deepEqual(starterToEmpty.movedPlayerIds, ['a'], '1. titular a hueco vacio solo mueve al titular');
assert.equal(starterToEmpty.placements.a.slotIndex, 2);
assert.equal(starterToEmpty.placements.b.slotIndex, 1);

const starterSwap = move('a', placement('starter', 1));
assert.deepEqual(starterSwap.movedPlayerIds, ['a', 'b'], '2. titular sobre titular intercambia solo ambos');
assert.equal(starterSwap.placements.a.slotIndex, 1);
assert.equal(starterSwap.placements.b.slotIndex, 0);
assert.deepEqual(starterSwap.placements.c, basePlacements.c);

const reserveToEmptyStarter = move('c', placement('starter', 2));
assert.equal(reserveToEmptyStarter.placements.c.status, 'starter', '3. reserva pasa a titular vacio');
assert.equal(reserveToEmptyStarter.placements.c.slotIndex, 2);
assert.deepEqual(reserveToEmptyStarter.placements.a, basePlacements.a);

const reserveToOccupiedStarter = move('c', placement('starter', 0));
assert.equal(reserveToOccupiedStarter.placements.c.status, 'starter', '4. reserva ocupa titular');
assert.equal(reserveToOccupiedStarter.placements.a.status, 'reserve');
assert.equal(reserveToOccupiedStarter.placements.a.slotIndex, 0);
assert.equal(reserveToOccupiedStarter.placements.a.reserveOrder, 0, 'el ocupante va al hueco exacto dejado por el reserva');

const starterToEmptyReserve = move('b', placement('reserve', 1, 0));
assert.equal(starterToEmptyReserve.placements.b.status, 'reserve', '5. titular pasa a reserva vacia');
assert.equal(starterToEmptyReserve.placements.a.slotIndex, 0);

const starterToOccupiedReserve = move('b', placement('reserve', 0, 0));
assert.equal(starterToOccupiedReserve.placements.b.status, 'reserve', '6. titular ocupa reserva');
assert.equal(starterToOccupiedReserve.placements.c.status, 'starter');
assert.equal(starterToOccupiedReserve.placements.c.slotIndex, 1, 'el reserva ocupante va al hueco exacto del titular');

const reserveSwap = move('c', placement('reserve', 0, 1));
assert.equal(reserveSwap.placements.c.reserveOrder, 1, '7. reservas intercambian huecos');
assert.equal(reserveSwap.placements.d.reserveOrder, 0);

const unplacedToStarter = move('e', placement('starter', 0));
assert.equal(unplacedToStarter.placements.e.status, 'starter', '8. sin colocar ocupa titular');
assert.equal(unplacedToStarter.placements.a.status, 'unplaced', 'el ocupante queda sin colocar si el origen no tenia hueco');

const unplacedToReserve = move('e', placement('reserve', 0, 0));
assert.equal(unplacedToReserve.placements.e.status, 'reserve', '9. sin colocar ocupa reserva');
assert.equal(unplacedToReserve.placements.c.status, 'unplaced');

const removed = move('a', placement('unplaced'));
assert.equal(removed.placements.a.status, 'unplaced', '10. quitar deja el hueco vacio');
assert.deepEqual(removed.placements.b, basePlacements.b);

const undoSource = move('c', placement('starter', 0));
const undone = applyPlayerMove({ placements: undoSource.placements, playerId: 'c', destination: undoSource.origin });
assert.equal(undone.placements.a.status, 'starter', '11. deshacer restaura el titular original');
assert.equal(undone.placements.a.slotIndex, 0);
assert.equal(undone.placements.c.status, 'reserve');
assert.equal(undone.placements.c.slotIndex, 0);
assert.equal(undone.placements.c.reserveOrder, 0, 'deshacer restaura el hueco exacto del reserva');
assert.deepEqual(undone.placements.b, basePlacements.b, 'deshacer no altera terceros');

const canonical = buildTacticalPlacements({
  players: [
    { membershipId: 'm1', name: 'Duplicado', fieldRole: 'Titular', slotIndex: 0 },
    { membershipId: 'm2', name: 'Duplicado', fieldRole: 'Reserva', slotIndex: 0, reserveIndex: 0 },
  ],
});
assert.equal(Object.keys(canonical).length, 2, 'la identidad estable no depende del nombre visible');

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
