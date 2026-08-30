const STAFF_ROLES = new Set(['owner', 'admin', 'staff']);

export class AppIdentityResolutionError extends Error {
  constructor(code, cause = null) {
    super('No se pudo verificar la identidad de acceso.');
    this.name = 'AppIdentityResolutionError';
    this.code = code;
    this.cause = cause;
  }
}

const denied = (reason, membership = null) => ({
  kind: 'denied',
  reason,
  membership,
});

export const resolveAppIdentity = async (client, session) => {
  const sessionUserId = String(session?.user?.id || '').trim();
  if (!sessionUserId) return denied('invalid_session');
  if (!client || typeof client.rpc !== 'function') {
    throw new AppIdentityResolutionError('identity_client_unavailable');
  }

  let response;
  try {
    response = await client.rpc('current_membership');
  } catch (error) {
    throw new AppIdentityResolutionError('identity_rpc_failed', error);
  }

  if (response?.error) {
    throw new AppIdentityResolutionError('identity_rpc_failed', response.error);
  }
  if (!Array.isArray(response?.data)) {
    throw new AppIdentityResolutionError('identity_response_invalid');
  }
  if (response.data.length === 0) return denied('membership_missing');
  if (response.data.length !== 1) {
    throw new AppIdentityResolutionError('identity_ambiguous');
  }

  const membership = response.data[0];
  if (!membership || typeof membership !== 'object') {
    throw new AppIdentityResolutionError('identity_response_invalid');
  }

  const membershipUserId = String(membership.user_id || '').trim();
  const role = String(membership.role || '').trim().toLowerCase();
  const normalizedMembership = { ...membership, role };

  if (!membershipUserId || membershipUserId !== sessionUserId) {
    return denied('membership_user_mismatch', normalizedMembership);
  }
  if (membership.is_active !== true) {
    return denied('membership_inactive', normalizedMembership);
  }
  if (STAFF_ROLES.has(role)) {
    return { kind: 'staff', membership: normalizedMembership };
  }
  if (role === 'player') {
    if (!String(membership.jugador_id || '').trim()) {
      return denied('player_identity_incomplete', normalizedMembership);
    }
    return { kind: 'player', membership: normalizedMembership };
  }

  return denied(role === 'viewer' ? 'role_not_enabled' : 'role_unknown', normalizedMembership);
};

