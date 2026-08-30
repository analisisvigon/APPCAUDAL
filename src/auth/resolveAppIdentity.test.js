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
const clientWith = (data, error = null) => ({
  rpc: async (name) => {
    assert.equal(name, 'current_membership');
    return { data, error };
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

console.log('resolveAppIdentity tests: OK');

