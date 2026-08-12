import assert from 'node:assert/strict';
import { buildRivalLineupAtomicSnapshot, isRivalSaveResponseCurrent } from './rivalLineupAtomic.js';

const teamId = '00000000-0000-4000-8000-000000000001';
const starter = { membershipId: '00000000-0000-4000-8000-000000000010', globalPlayerId: '00000000-0000-4000-8000-000000000020', name: 'Titular', slot: 2, x: 40, y: 30 };
const reserve = { jugadorRivalId: '00000000-0000-4000-8000-000000000030', name: 'Reserva' };
const unplaced = { jugadorRivalId: '00000000-0000-4000-8000-000000000040', name: 'Sin colocar' };
const snapshot = buildRivalLineupAtomicSnapshot({
  teamId,
  system: '4-4-2',
  fieldSources: { system: { source: 'manual' } },
  players: [starter, reserve, unplaced],
  placements: {
    [starter.membershipId]: { status: 'starter', slotIndex: 2 },
    [reserve.jugadorRivalId]: { status: 'reserve', slotIndex: 2, reserveOrder: 0 },
    [unplaced.jugadorRivalId]: { status: 'unplaced' },
  },
  lineup: [starter],
  benchChart: { Titular: [reserve, null] },
  createPlayerSnapshot: (player) => ({ name: player.name }),
});

assert.equal(snapshot.p_placements.length, 3, 'el snapshot incluye XI, reservas y no colocados');
assert.deepEqual(snapshot.p_placements.map((row) => row.squad_role), ['Titular', 'Reserva', 'Reserva']);
assert.deepEqual(snapshot.p_placements[0], {
  membership_id: starter.membershipId,
  rival_player_id: null,
  player_name: 'Titular',
  tactical_role: 'Titular',
  tactical_slot: 2,
  tactical_reserve_slot: null,
  squad_role: 'Titular',
});
assert.equal(snapshot.p_placements[1].tactical_role, 'Reserva');
assert.equal(snapshot.p_placements[1].tactical_reserve_slot, 0);
assert.equal(snapshot.p_lineup[0].membership_id, starter.membershipId);
assert.equal(snapshot.p_lineup[0].slot, 2);
assert.equal(snapshot.p_bench.length, 2, 'el snapshot incluye también el banquillo completo');
assert.equal(snapshot.p_bench[0].rival_player_id, reserve.jugadorRivalId);
assert.equal(snapshot.p_bench[1].player_name, null, 'un hueco vacío no inventa jugador');

assert.equal(isRivalSaveResponseCurrent({ requestedTeamId: teamId, currentTeamId: teamId, requestId: 2, latestRequestId: 2 }), true);
assert.equal(isRivalSaveResponseCurrent({ requestedTeamId: teamId, currentTeamId: 'otro', requestId: 2, latestRequestId: 2 }), false, 'una respuesta de otro rival es stale');
assert.equal(isRivalSaveResponseCurrent({ requestedTeamId: teamId, currentTeamId: teamId, requestId: 1, latestRequestId: 2 }), false, 'una respuesta anterior no marca el contexto actual');

console.log('rival lineup atomic tests: ok');
