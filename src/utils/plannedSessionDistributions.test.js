import assert from 'node:assert/strict';
import {
  autoPlayerLayout, distributionPayloadKey, emptyDistribution, layoutPlayerBoardCards, movePlayerBoardLayout, normalizeDistribution,
  overlappingZonePairs, playerCompactLabels, reconcileSpaceZones, SESSION_SYSTEMS,
  resolvePlayerBoardDrop, specificPositionMap, validateDistribution,
} from './plannedSessionDistributions.js';
import { loadPlannedDistribution, loadPlannedSpecificPositions,
  savePlannedDistribution, savePlannedSessionValue } from '../data/plannedSessionsStore.js';

const roster = Array.from({ length: 24 }, (_, index) => ({
  player_id: `player-${index}`, player_name_snapshot: index === 0 ? 'Pepe Pérez' :
    index === 1 ? 'Pepe Prieto' : index === 2 ? 'José Martínez' : `Jugador ${index}`,
}));
const rows = roster.map((row, index) => ({ player_id: row.player_id,
  position_key: index < 2 ? 'right_back' : index === 2 ? null :
    index < 4 ? 'goalkeeper' : index < 9 ? 'centre_back' :
      index < 14 ? 'central_midfield' : 'centre_forward' }));
const byId = specificPositionMap(rows);
assert.equal(playerCompactLabels(roster).get('player-0'), 'Pepe Pérez');
assert.equal(playerCompactLabels(roster).get('player-1'), 'Pepe Prieto');
for (const system of SESSION_SYSTEMS) {
  const layout = autoPlayerLayout(roster, byId, system);
  assert.equal(layout.length, 24, `${system} no pierde jugadores`);
  assert.deepEqual(layout[0], layout[1] && { ...layout[1], player_id: layout[0].player_id },
    `${system}: los dos laterales derechos comparten sector`);
  assert.equal(layout[2].placement, 'unplaced', `${system}: falta de posición no se inventa`);
  assert.equal(layout[2].x, null);
}
const first442 = autoPlayerLayout(roster, byId, '4-4-2');
const board = layoutPlayerBoardCards(first442, roster, byId, '4-4-2');
assert.equal(board.cards.flatMap((card) => card.players).length + board.unplaced.length, 24);
assert.ok(board.cards.some((card) => card.players.length > 4),
  'los jugadores de una demarcación numerosa permanecen en el mismo grupo');
for (const [index, left] of board.cards.entries()) for (const right of board.cards.slice(index + 1)) {
  assert.ok(left.left + left.width + 1 <= right.left || right.left + right.width + 1 <= left.left ||
    left.top + left.height + 1 <= right.top || right.top + right.height + 1 <= left.top,
  'las tarjetas del campo no se solapan');
}
const movedBoard = layoutPlayerBoardCards(movePlayerBoardLayout(first442, 'player-2',
  { x: 50, y: 50 }), roster, byId, '4-4-2');
assert.ok(movedBoard.cards.some((card) => card.manual && card.players[0].player_id === 'player-2'),
  'un jugador sin posición automática puede situarse manualmente');
const centres = board.cards.find((card) => card.title.includes('Defensa central'));
assert.ok(centres, 'existe el grupo de centrales acreditado');
const centralDrop = resolvePlayerBoardDrop(board.cards, { x: centres.left + 1, y: centres.top + 1 });
assert.equal(centralDrop.groupKey, centres.key);
const joinedLayout = movePlayerBoardLayout(first442, 'player-2', centralDrop);
const joinedBoard = layoutPlayerBoardCards(joinedLayout, roster, byId, '4-4-2');
assert.ok(joinedBoard.cards.find((card) => card.key === centres.key)?.players
  .some((player) => player.player_id === 'player-2'),
'el jugador sin posición se incorpora y permanece en centrales');
assert.equal(joinedBoard.unplaced.some((player) => player.player_id === 'player-2'), false);
assert.deepEqual(layoutPlayerBoardCards(JSON.parse(JSON.stringify(joinedLayout)), roster, byId, '4-4-2')
  .cards.map((card) => [card.key, card.players.map((player) => player.player_id)]),
joinedBoard.cards.map((card) => [card.key, card.players.map((player) => player.player_id)]),
'la agrupación manual se reconstruye de forma determinista tras reabrir');
const freePoint = { x: 6, y: 6 };
const freeLayout = movePlayerBoardLayout(joinedLayout, 'player-3', freePoint);
const freeBoard = layoutPlayerBoardCards(freeLayout, roster, byId, '4-4-2');
assert.ok(freeBoard.cards.some((card) => card.manual && card.players[0].player_id === 'player-3'));
assert.deepEqual(autoPlayerLayout(roster, byId, '4-4-2'), first442,
  'restablecer el sistema elimina los ajustes manuales sin cambiar posiciones canónicas');
const crowdedManual = layoutPlayerBoardCards(roster.map((player) => ({
  player_id: player.player_id, placement: 'manual', x: 50, y: 50,
})), roster);
assert.equal(crowdedManual.cards.length, 24);
assert.equal(crowdedManual.unplaced.length, 0,
  'veinticuatro intentos de solapar una misma zona se resuelven dentro del campo');
for (const [index, left] of crowdedManual.cards.entries()) for (const right of crowdedManual.cards.slice(index + 1)) {
  assert.ok(left.left + left.width + 1 <= right.left || right.left + right.width + 1 <= left.left ||
    left.top + left.height + 1 <= right.top || right.top + right.height + 1 <= left.top);
}
assert.notDeepEqual(first442.map(({ x, y }) => [x, y]),
  autoPlayerLayout(roster, byId, '4-2-3-1').map(({ x, y }) => [x, y]),
  'el cambio de sistema recalcula los sectores');
for (const system of ['4-2-3-1', '4-3-3']) {
  const systemBoard = layoutPlayerBoardCards(autoPlayerLayout(roster, byId, system), roster, byId, system);
  assert.equal(systemBoard.cards.flatMap((card) => card.players).length + systemBoard.unplaced.length, 24);
  assert.ok(systemBoard.cards.some((card) => card.players.length > 1), `${system}: hay grupos posicionales`);
}
const attackingRoster = [
  { player_id: 'winger', player_name_snapshot: 'Extremo Derecho' },
  { player_id: 'striker', player_name_snapshot: 'Delantero Centro' },
];
const attackingPositions = new Map([['winger', 'right_winger'], ['striker', 'centre_forward']]);
const attackingAuto = autoPlayerLayout(attackingRoster, attackingPositions, '4-3-3');
const attackingBoard = layoutPlayerBoardCards(attackingAuto, attackingRoster, attackingPositions, '4-3-3');
const forwardCard = attackingBoard.cards.find((card) => card.title.includes('Delantero centro'));
const attackingDrop = resolvePlayerBoardDrop(attackingBoard.cards,
  { x: forwardCard.left + 1, y: forwardCard.top + 1 });
const attackingMoved = layoutPlayerBoardCards(movePlayerBoardLayout(attackingAuto, 'winger', attackingDrop),
  attackingRoster, attackingPositions, '4-3-3');
assert.deepEqual(attackingMoved.cards.find((card) => card.key === forwardCard.key)?.players
  .map((player) => player.player_id).sort(), ['striker', 'winger']);
const slots = [{ id: 'a', phase: 'activation' }, { id: 'b', phase: 'main' }];
const zones = reconcileSpaceZones([], slots);
assert.equal(zones.length, 2);
assert.equal(reconcileSpaceZones([], [{ ...slots[0], items: [{ id: 'task-a' }, { id: 'task-b' }] }]).length,
  1, 'dos tareas simultáneas comparten la zona de su ejercicio');
assert.ok(zones.every((zone) => zone.provisional));
const moved = { ...zones[0], x: 40, y: 30, provisional: false };
assert.deepEqual(reconcileSpaceZones([moved, zones[1]], [...slots].reverse())[1], moved,
  'reordenar mantiene las coordenadas por slot_id');
assert.deepEqual(reconcileSpaceZones([moved, zones[1]], [slots[0]]), [moved],
  'retirar ejercicio elimina su zona del payload');
assert.equal(reconcileSpaceZones([moved], slots).length, 2,
  'añadir ejercicio crea exactamente una zona provisional');
assert.equal(overlappingZonePairs([{ ...moved, w: 30, h: 30 },
  { ...zones[1], x: 50, y: 40, w: 20, h: 20 }]).length, 1);
const distribution = { ...emptyDistribution(), formation_key: '4-4-2',
  player_layout: first442, space_zones: zones };
assert.equal(validateDistribution(distribution, roster, slots), '');
assert.match(validateDistribution({ ...distribution, player_layout: first442.slice(1) }, roster, slots),
  /todos los jugadores/);
assert.match(validateDistribution({ ...distribution, space_zones: [zones[0]] }, roster, slots),
  /una zona/);
assert.equal(distributionPayloadKey(distribution), distributionPayloadKey({ ...distribution,
  player_layout: [...first442].reverse(), space_zones: [...zones].reverse() }));
assert.deepEqual(normalizeDistribution(null), emptyDistribution());
assert.equal(specificPositionMap([{ player_id: 'x', position_key: 'right_back' },
  { player_id: 'x', position_key: 'left_back' }]).get('x'), null,
  'una posición principal ambigua se deja sin ubicación automática');

const calls = [];
const client = {
  from(table) {
    calls.push(['from', table]);
    return { select() { return this; }, eq() { return this; }, in() { return this; },
      maybeSingle: async () => ({ data: { session_id: 'session-1', formation_key: '4-4-2' }, error: null }),
      then(resolve) { resolve({ data: [{ player_id: 'player-0', position_key: 'right_back' }], error: null }); } };
  },
  async rpc(name, args) { calls.push(['rpc', name, args]); return { data: 7, error: null }; },
};
assert.equal((await loadPlannedDistribution(client, 'session-1')).formation_key, '4-4-2');
assert.equal((await loadPlannedSpecificPositions(client, ['player-0'])).length, 1);
assert.equal(await savePlannedDistribution(client, 'session-1', 6, distribution), 7);
assert.deepEqual(calls.at(-1), ['rpc', 'save_planned_session_distributions_05', {
  p_session_id: 'session-1', p_expected_revision: 6, p_formation_key: '4-4-2',
  p_player_layout: first442, p_space_zones: zones,
}]);
assert.equal(await savePlannedSessionValue(client, 'session-1', 7, '0'), 7);
assert.deepEqual(calls.at(-1), ['rpc', 'save_planned_session_value_06', {
  p_session_id: 'session-1', p_expected_revision: 7, p_value: 0,
}]);
assert.equal(calls.some(([kind]) => ['insert', 'update', 'delete'].includes(kind)), false);
console.log('planned session distributions tests passed');
