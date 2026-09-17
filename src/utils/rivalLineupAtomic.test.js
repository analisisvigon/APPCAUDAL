import assert from 'node:assert/strict';
import {
  buildRivalLineupAtomicSnapshot,
  isRivalSaveResponseCurrent,
  resolveCurrentRivalTeamMembership,
} from './rivalLineupAtomic.js';

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

const staleMembership = {
  id: '00000000-0000-4000-8000-000000000050',
  player_id: starter.globalPlayerId,
  team_id: '00000000-0000-4000-8000-000000000002',
  is_current: false,
};
const currentMembership = {
  id: '00000000-0000-4000-8000-000000000051',
  player_id: starter.globalPlayerId,
  team_id: teamId,
  is_current: true,
};
const resolvedMembership = resolveCurrentRivalTeamMembership({
  memberships: [staleMembership, currentMembership],
  teamId,
  preferredMembershipId: staleMembership.id,
});
assert.equal(resolvedMembership.id, currentMembership.id, 'un enlace legacy obsoleto no sustituye la membership actual del rival');
assert.equal(resolveCurrentRivalTeamMembership({
  memberships: [staleMembership],
  teamId,
  preferredMembershipId: staleMembership.id,
}), null, 'sin membership actual del equipo no se reutiliza un UUID historico');

const linkedStarter = {
  ...starter,
  jugadorRivalId: '00000000-0000-4000-8000-000000000060',
  membershipId: resolvedMembership.id,
  slot: 7,
  x: 63,
  y: 44,
};
const legacyPlayer = {
  jugadorRivalId: '00000000-0000-4000-8000-000000000061',
  globalPlayerId: '00000000-0000-4000-8000-000000000062',
  membershipId: null,
  name: 'Legacy compatible',
  slot: 8,
  x: 72,
  y: 55,
};
const persistenceSnapshot = buildRivalLineupAtomicSnapshot({
  teamId,
  system: '4-3-3',
  players: [linkedStarter, legacyPlayer],
  placements: {
    [linkedStarter.membershipId]: { status: 'starter', slotIndex: 7 },
    [legacyPlayer.jugadorRivalId]: { status: 'starter', slotIndex: 8 },
  },
  lineup: [linkedStarter, legacyPlayer],
  createPlayerSnapshot: (player) => ({ globalPlayerId: player.globalPlayerId, jugadorRivalId: player.jugadorRivalId }),
});
assert.equal(persistenceSnapshot.p_placements[0].membership_id, currentMembership.id);
assert.equal(persistenceSnapshot.p_placements[0].rival_player_id, null);
assert.equal(persistenceSnapshot.p_placements[1].membership_id, null);
assert.equal(persistenceSnapshot.p_placements[1].rival_player_id, legacyPlayer.jugadorRivalId, 'un registro legacy sin membership vigente conserva su UUID rival');

let attempts = 0;
let persistedSnapshot = null;
const client = {
  async rpc(name, args) {
    assert.equal(name, 'save_rival_lineup_atomic');
    attempts += 1;
    if (attempts === 1) return { data: null, error: new Error('fallo temporal') };
    persistedSnapshot = structuredClone(args);
    return { data: { team_id: args.p_team_id, placements: args.p_placements, lineup: args.p_lineup }, error: null };
  },
};
const firstSave = await client.rpc('save_rival_lineup_atomic', persistenceSnapshot);
assert.equal(firstSave.error?.message, 'fallo temporal', 'un fallo remoto no se presenta como guardado');
const retrySave = await client.rpc('save_rival_lineup_atomic', persistenceSnapshot);
assert.equal(retrySave.error, null, 'Reintentar puede confirmar el mismo snapshot sin cambiar identidades');
assert.equal(attempts, 2);

const reloadedLineup = persistedSnapshot.p_lineup.map((row) => ({
  membershipId: row.membership_id,
  globalPlayerId: row.global_player_id,
  jugadorRivalId: row.rival_player_id,
  slot: row.slot,
  x: row.x,
  y: row.y,
}));
assert.deepEqual(reloadedLineup, [{
  membershipId: currentMembership.id,
  globalPlayerId: linkedStarter.globalPlayerId,
  jugadorRivalId: null,
  slot: 7,
  x: 63,
  y: 44,
}, {
  membershipId: null,
  globalPlayerId: legacyPlayer.globalPlayerId,
  jugadorRivalId: legacyPlayer.jugadorRivalId,
  slot: 8,
  x: 72,
  y: 55,
}], 'guardar y recargar conserva posicion e identidades canonicas');
const placementIdentities = persistedSnapshot.p_placements.map((row) => row.membership_id || row.rival_player_id);
assert.equal(new Set(placementIdentities).size, placementIdentities.length, 'guardar y reintentar no crea duplicados');

console.log('rival lineup atomic tests: ok');
