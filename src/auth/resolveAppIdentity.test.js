import assert from 'node:assert/strict';
import { AppIdentityResolutionError, resolveAppIdentity } from './resolveAppIdentity.js';

const userId = '00000000-0000-4000-8000-000000000001';
const playerId = '00000000-0000-4000-8000-000000000002';
const session = { user: { id: userId } };
const membership = (overrides = {}) => ({
  membership_id: '00000000-0000-4000-8000-000000000003',
  club_id: '00000000-0000-4000-8000-000000000004',
  user_id: userId,
  role: 'staff',
  jugador_id: null,
  is_active: true,
  ...overrides,
});
const clientWith = (data, error = null, canManageFines = false) => ({
  rpc: async (name) => {
    if (name === 'my_access_contexts_v1') return { data: null, error: { code: 'PGRST202' } };
    if (name === 'current_membership') return { data, error };
    assert.equal(name, 'can_manage_fines');
    return { data: canManageFines, error: null };
  },
});

for (const role of ['owner', 'admin', 'staff']) {
  const result = await resolveAppIdentity(clientWith([membership({ role })]), session);
  assert.equal(result.kind, 'staff', `${role} debe entrar en la rama STAFF`);
}

const player = await resolveAppIdentity(
  clientWith([membership({ role: 'player', jugador_id: playerId })]),
  session
);
assert.equal(player.kind, 'player');
assert.equal(player.membership.jugador_id, playerId);
assert.deepEqual(player.capabilities, { canManageFines: false });

const playerManager = await resolveAppIdentity(
  clientWith([membership({ role: 'player', jugador_id: playerId })], null, true),
  session
);
assert.equal(playerManager.kind, 'player');
assert.equal(playerManager.membership.role, 'player');
assert.deepEqual(playerManager.capabilities, { canManageFines: true });

const capabilityFailure = await resolveAppIdentity({
  rpc: async (name) => {
    if (name === 'my_access_contexts_v1') return { data: null, error: { code: 'PGRST202' } };
    if (name === 'current_membership') return { data: [membership({ role: 'player', jugador_id: playerId })], error: null };
    throw new Error('capability unavailable');
  },
}, session);
assert.deepEqual(capabilityFailure.capabilities, { canManageFines: false }, 'La capability debe fallar cerrada.');

const incompletePlayer = await resolveAppIdentity(
  clientWith([membership({ role: 'player', jugador_id: null })]),
  session
);
assert.equal(incompletePlayer.kind, 'denied');
assert.equal(incompletePlayer.reason, 'player_identity_incomplete');

const viewer = await resolveAppIdentity(clientWith([membership({ role: 'viewer' })]), session);
assert.equal(viewer.kind, 'denied');
assert.equal(viewer.reason, 'role_not_enabled');

const missing = await resolveAppIdentity(clientWith([]), session);
assert.equal(missing.kind, 'denied');
assert.equal(missing.reason, 'membership_missing');

const inactive = await resolveAppIdentity(
  clientWith([membership({ is_active: false })]),
  session
);
assert.equal(inactive.kind, 'denied');
assert.equal(inactive.reason, 'membership_inactive');

const mismatchedUser = await resolveAppIdentity(
  clientWith([membership({ user_id: '00000000-0000-4000-8000-000000000099' })]),
  session
);
assert.equal(mismatchedUser.kind, 'denied');
assert.equal(mismatchedUser.reason, 'membership_user_mismatch');

await assert.rejects(
  resolveAppIdentity(clientWith(null, { code: 'PGRST_ERROR', message: 'technical detail' }), session),
  (error) => error instanceof AppIdentityResolutionError && error.code === 'identity_rpc_failed'
);

await assert.rejects(
  resolveAppIdentity(clientWith(null, { code: '21000', message: 'multiple active memberships' }), session),
  (error) => error instanceof AppIdentityResolutionError && error.code === 'identity_rpc_failed',
  'Sin instalar la RPC nueva, la identidad ambigua sigue fallando de forma cerrada.'
);

await assert.rejects(
  resolveAppIdentity(clientWith([membership(), membership({ role: 'owner' })]), session),
  (error) => error instanceof AppIdentityResolutionError && error.code === 'identity_ambiguous'
);

await assert.rejects(
  resolveAppIdentity(clientWith({ unexpected: true }), session),
  (error) => error instanceof AppIdentityResolutionError && error.code === 'identity_response_invalid'
);

const unknownRole = await resolveAppIdentity(clientWith([membership({ role: 'captain' })]), session);
assert.equal(unknownRole.kind, 'denied');
assert.equal(unknownRole.reason, 'role_unknown');

const accessRow = (overrides = {}) => ({
  ...membership({ role: 'owner' }),
  club_name: 'Club autorizado',
  contexts: [{ club_team_season_id: '00000000-0000-4000-8000-000000000005',
    club_id: '00000000-0000-4000-8000-000000000004' }],
  ...overrides,
});
const multiclubClient = (rows, legacyRows = [membership({ role: 'owner' })]) => {
  const calls = [];
  return {
    calls,
    rpc: async (name) => {
      calls.push(name);
      if (name === 'my_access_contexts_v1') return { data: rows, error: null };
      if (name === 'current_membership') return { data: legacyRows, error: null };
      if (name === 'can_manage_fines') return { data: false, error: null };
      throw new Error(`RPC inesperada: ${name}`);
    },
  };
};

const single = multiclubClient([accessRow()]);
const singleIdentity = await resolveAppIdentity(single, session);
assert.equal(singleIdentity.kind, 'staff');
assert.equal(singleIdentity.contexts[0].club_team_season_id,
  '00000000-0000-4000-8000-000000000005');
assert.deepEqual(single.calls, ['my_access_contexts_v1', 'current_membership'],
  'Con una membresía se conserva la verificación legacy.');

const singlePlayer = multiclubClient(
  [accessRow({ role: 'player', jugador_id: playerId, contexts: [] })],
  [membership({ role: 'player', jugador_id: playerId })]
);
assert.equal((await resolveAppIdentity(singlePlayer, session)).kind, 'player');

const twoClubs = multiclubClient([
  accessRow(),
  accessRow({ membership_id: '00000000-0000-4000-8000-000000000006',
    club_id: '00000000-0000-4000-8000-000000000007', club_name: 'Otro club',
    contexts: [{ club_team_season_id: '00000000-0000-4000-8000-000000000008',
      club_id: '00000000-0000-4000-8000-000000000007' }] }),
]);
const multiple = await resolveAppIdentity(twoClubs, session);
assert.equal(multiple.kind, 'multiple_memberships');
assert.equal(multiple.memberships.length, 2);
assert.deepEqual(twoClubs.calls, ['my_access_contexts_v1'],
  'Varias membresías nunca deben activar la rama deportiva legacy.');

const revoked = multiclubClient([accessRow()]);
assert.equal((await resolveAppIdentity(revoked, session)).kind, 'staff',
  'Una membresía revocada deja de aparecer en la RPC y la restante conserva el acceso.');

const noActive = multiclubClient([]);
assert.equal((await resolveAppIdentity(noActive, session)).reason, 'membership_missing');
assert.deepEqual(noActive.calls, ['my_access_contexts_v1']);

for (const badRows of [null, { unexpected: true }, [accessRow({ user_id: playerId })],
  [accessRow({ is_active: false })], [accessRow({ contexts: null })],
  [accessRow({ contexts: [{ club_team_season_id: '00000000-0000-4000-8000-000000000005',
    club_id: playerId }] })],
  [accessRow(), accessRow()]]) {
  await assert.rejects(resolveAppIdentity(multiclubClient(badRows), session),
    (error) => error instanceof AppIdentityResolutionError && error.code === 'identity_response_invalid');
}

await assert.rejects(resolveAppIdentity(multiclubClient([accessRow({ club_id: playerId,
  contexts: [{ club_team_season_id: '00000000-0000-4000-8000-000000000005', club_id: playerId }] })]), session),
  (error) => error instanceof AppIdentityResolutionError && error.code === 'identity_response_mismatch');

await assert.rejects(resolveAppIdentity({ rpc: async () => ({ error: { code: '42501' } }) }, session),
  (error) => error instanceof AppIdentityResolutionError && error.code === 'identity_rpc_failed',
  'Solo la ausencia de la RPC nueva permite volver a current_membership().');

console.log('resolveAppIdentity tests: OK');
