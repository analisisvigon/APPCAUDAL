import assert from 'node:assert/strict';
import {
  autoPlayerLayout, distributionPayloadKey, emptyDistribution, normalizeDistribution,
  overlappingZonePairs, playerCompactLabels, reconcileSpaceZones, SESSION_SYSTEMS,
  specificPositionMap, validateDistribution,
} from './plannedSessionDistributions.js';
import { loadPlannedDistribution, loadPlannedSpecificPositions,
  savePlannedDistribution } from '../data/plannedSessionsStore.js';

const roster = Array.from({ length: 24 }, (_, index) => ({
  player_id: `player-${index}`, player_name_snapshot: index === 0 ? 'Pepe Pérez' :
    index === 1 ? 'Pepe Prieto' : `Jugador ${index}`,
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
assert.notDeepEqual(first442.map(({ x, y }) => [x, y]),
  autoPlayerLayout(roster, byId, '4-2-3-1').map(({ x, y }) => [x, y]),
  'el cambio de sistema recalcula los sectores');
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
assert.equal(calls.some(([kind]) => ['insert', 'update', 'delete'].includes(kind)), false);
console.log('planned session distributions tests passed');
