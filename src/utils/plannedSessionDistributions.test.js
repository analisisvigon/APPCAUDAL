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
assert.equal(board.cards.length, 11, 'siempre hay once demarcaciones, incluso vacías');
assert.equal(board.cards.flatMap((card) => card.players).length + board.unplaced.length, 24);
assert.equal(new Set(board.cards.flatMap((card) => card.players).concat(board.unplaced)
  .map((player) => player.player_id)).size, 24, 'ningún jugador se duplica');
assert.equal(board.unplaced[0].player_id, 'player-2');
const central = board.cards.find((card) => card.key === 'DFC_D');
assert.ok(central && central.players.length, 'central derecho ocupa el ancla táctica');
const centralDrop = resolvePlayerBoardDrop(board.cards, { x: central.x, y: central.y });
assert.deepEqual(centralDrop, { x: central.x, y: central.y, groupKey: central.key });
assert.equal(resolvePlayerBoardDrop(board.cards, { x: 5, y: 5 }), null,
  'no existe caída libre fuera de una demarcación');
const joinedLayout = movePlayerBoardLayout(first442, 'player-2', centralDrop, '4-4-2');
assert.deepEqual(joinedLayout[2], { player_id: 'player-2', placement: 'manual',
  x: central.x, y: central.y }, 'la RPC recibe solo su ancla canónica');
const joinedBoard = layoutPlayerBoardCards(joinedLayout, roster, byId, '4-4-2');
assert.ok(joinedBoard.cards.find((card) => card.key === 'DFC_D').players
  .some((player) => player.player_id === 'player-2'));
assert.equal(joinedBoard.unplaced.some((player) => player.player_id === 'player-2'), false);
const secondUnplacedPositions = new Map(byId);
secondUnplacedPositions.set('player-11', null);
const secondUnplacedLayout = autoPlayerLayout(roster, secondUnplacedPositions, '4-4-2');
const secondUnplacedBoard = layoutPlayerBoardCards(secondUnplacedLayout, roster, secondUnplacedPositions, '4-4-2');
assert.ok(secondUnplacedBoard.unplaced.some((player) => player.player_id === 'player-11'));
const secondMid = secondUnplacedBoard.cards.find((card) => card.key === 'MC_D');
assert.ok(layoutPlayerBoardCards(movePlayerBoardLayout(secondUnplacedLayout, 'player-11',
  { x: secondMid.x, y: secondMid.y }, '4-4-2'), roster, secondUnplacedPositions, '4-4-2')
  .cards.find((card) => card.key === 'MC_D').players.some((player) => player.player_id === 'player-11'),
'otro jugador sin posición puede pasar a mediocentro');
assert.deepEqual(layoutPlayerBoardCards(JSON.parse(JSON.stringify(joinedLayout)), roster, byId, '4-4-2')
  .cards.map((card) => [card.key, card.players.map((player) => player.player_id)]),
joinedBoard.cards.map((card) => [card.key, card.players.map((player) => player.player_id)]),
'los grupos manuales se reconstruyen igual al recargar');
const mid = board.cards.find((card) => card.key === 'MC_D');
const movedMid = movePlayerBoardLayout(joinedLayout, 'player-2',
  resolvePlayerBoardDrop(board.cards, { x: mid.x, y: mid.y }), '4-4-2');
assert.ok(layoutPlayerBoardCards(movedMid, roster, byId, '4-4-2').cards
  .find((card) => card.key === 'MC_D').players.some((player) => player.player_id === 'player-2'),
'se puede mover desde una demarcación a otra');
const lateralToCentral = movePlayerBoardLayout(first442, 'player-0', centralDrop, '4-4-2');
assert.ok(layoutPlayerBoardCards(lateralToCentral, roster, byId, '4-4-2').cards
  .find((card) => card.key === 'DFC_D').players.some((player) => player.player_id === 'player-0'),
'un lateral puede reasignarse sin cambiar su posición canónica');
assert.equal(byId.get('player-0'), 'right_back');
const removed = movePlayerBoardLayout(movedMid, 'player-2', null, '4-4-2');
assert.deepEqual(removed[2], { player_id: 'player-2', placement: 'unplaced', x: null, y: null });
assert.ok(layoutPlayerBoardCards(removed, roster, byId, '4-4-2').unplaced
  .some((player) => player.player_id === 'player-2'));
assert.equal(movePlayerBoardLayout(joinedLayout, 'player-2', { x: 5, y: 5 }, '4-4-2'),
  joinedLayout, 'un punto libre no cambia el estado');
const legacyLayout = joinedLayout.map((item) => item.player_id === 'player-3'
  ? { ...item, placement: 'manual', x: 50, y: 50 } : item);
const legacyBoard = layoutPlayerBoardCards(legacyLayout, roster, byId, '4-4-2');
assert.equal(legacyBoard.legacy.length, 1, 'las coordenadas libres anteriores requieren revisión');
assert.equal(legacyBoard.cards.flatMap((card) => card.players).length + legacyBoard.unplaced.length, 24);
assert.deepEqual(autoPlayerLayout(roster, byId, '4-4-2'), first442,
  'restablecer el sistema elimina los ajustes manuales sin cambiar Plantilla');
assert.notDeepEqual(first442.map(({ x, y }) => [x, y]),
  autoPlayerLayout(roster, byId, '4-2-3-1').map(({ x, y }) => [x, y]),
  'cambiar sistema recalcula las demarcaciones');
for (const system of SESSION_SYSTEMS) {
  const generated = autoPlayerLayout(roster, byId, system);
  const rendered = layoutPlayerBoardCards(generated, roster, byId, system);
  assert.equal(rendered.cards.length, 11, `${system}: once demarcaciones`);
  assert.equal(rendered.cards.flatMap((card) => card.players).length + rendered.unplaced.length, 24,
    `${system}: todos los futbolistas aparecen`);
  const anchors = new Set(rendered.cards.map((card) => `${card.x}:${card.y}`));
  assert.equal(anchors.size, 11, `${system}: cada demarcación tiene ancla propia`);
  assert.ok(generated.every((item) => item.placement === 'unplaced' ||
    anchors.has(`${item.x}:${item.y}`)), `${system}: ningún jugador flota`);
}
const attackingRoster = [
  { player_id: 'winger', player_name_snapshot: 'Extremo Derecho' },
  { player_id: 'striker', player_name_snapshot: 'Delantero Centro' },
];
const attackingPositions = new Map([['winger', 'right_winger'], ['striker', 'centre_forward']]);
const attackingAuto = autoPlayerLayout(attackingRoster, attackingPositions, '4-3-3');
const attackingBoard = layoutPlayerBoardCards(attackingAuto, attackingRoster, attackingPositions, '4-3-3');
const forwardCard = attackingBoard.cards.find((card) => card.key === 'DC');
const attackingDrop = resolvePlayerBoardDrop(attackingBoard.cards, { x: forwardCard.x, y: forwardCard.y });
const attackingMoved = layoutPlayerBoardCards(movePlayerBoardLayout(attackingAuto, 'winger', attackingDrop, '4-3-3'),
  attackingRoster, attackingPositions, '4-3-3');
assert.deepEqual(attackingMoved.cards.find((card) => card.key === 'DC').players
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
assert.equal(await savePlannedDistribution(client, 'session-1', 7,
  { ...distribution, player_layout: joinedLayout }), 7);
assert.deepEqual(calls.at(-1)[2].p_player_layout[2], {
  player_id: 'player-2', placement: 'manual', x: central.x, y: central.y,
}, 'el guardado manual usa solo las cuatro propiedades aceptadas por RPC 05');
assert.equal(await savePlannedSessionValue(client, 'session-1', 7, '0'), 7);
assert.deepEqual(calls.at(-1), ['rpc', 'save_planned_session_value_06', {
  p_session_id: 'session-1', p_expected_revision: 7, p_value: 0,
}]);
assert.equal(calls.some(([kind]) => ['insert', 'update', 'delete'].includes(kind)), false);
console.log('planned session distributions tests passed');
