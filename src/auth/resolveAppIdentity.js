const STAFF_ROLES = new Set(['owner', 'admin', 'staff']);
const MULTICLUB_RPC = 'my_access_contexts_v1';
const MISSING_RPC_CODES = new Set(['42883', 'PGRST202']);

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

  // La RPC nueva es aditiva. Hasta instalarla, el acceso de un solo club sigue
  // usando exclusivamente current_membership(). Nunca se ignoran otros errores.
  let accessRows = null;
  let accessRpcAvailable = false;
  try {
    const accessResponse = await client.rpc(MULTICLUB_RPC);
    if (accessResponse?.error) {
      if (!MISSING_RPC_CODES.has(accessResponse.error.code)) {
        throw new AppIdentityResolutionError('identity_rpc_failed', accessResponse.error);
      }
    } else {
      accessRows = accessResponse?.data;
      accessRpcAvailable = true;
    }
  } catch (error) {
    if (error instanceof AppIdentityResolutionError) throw error;
    if (!MISSING_RPC_CODES.has(error?.code)) {
      throw new AppIdentityResolutionError('identity_rpc_failed', error);
    }
  }

  if (accessRpcAvailable) {
    if (!Array.isArray(accessRows)) {
      throw new AppIdentityResolutionError('identity_response_invalid');
    }
    const seen = new Set();
    for (const row of accessRows) {
      if (!row || typeof row !== 'object'
        || String(row.user_id || '').trim() !== sessionUserId
        || row.is_active !== true
        || !String(row.membership_id || '').trim()
        || !String(row.club_id || '').trim()
        || !Array.isArray(row.contexts)
        || row.contexts.some((context) => !context || typeof context !== 'object'
          || context.club_id !== row.club_id
          || !String(context.club_team_season_id || '').trim())
        || seen.has(row.membership_id)) {
        throw new AppIdentityResolutionError('identity_response_invalid');
      }
      seen.add(row.membership_id);
    }
    if (accessRows.length === 0) return denied('membership_missing');
    if (accessRows.length > 1) {
      // No se abre StaffApp/PlayerApp sin un contexto deportivo verificado.
      return { kind: 'multiple_memberships', memberships: accessRows };
    }
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

  if (accessRows && (
    accessRows[0].membership_id !== membership.membership_id
    || accessRows[0].club_id !== membership.club_id
    || String(accessRows[0].role || '').toLowerCase() !== role
  )) {
    throw new AppIdentityResolutionError('identity_response_mismatch');
  }

  if (!membershipUserId || membershipUserId !== sessionUserId) {
    return denied('membership_user_mismatch', normalizedMembership);
  }
  if (membership.is_active !== true) {
    return denied('membership_inactive', normalizedMembership);
  }
  if (STAFF_ROLES.has(role)) {
    return { kind: 'staff', membership: normalizedMembership,
      contexts: accessRows?.[0]?.contexts || [] };
  }
  if (role === 'player') {
    if (!String(membership.jugador_id || '').trim()) {
      return denied('player_identity_incomplete', normalizedMembership);
    }
    let canManageFines = false;
    try {
      const capabilityResponse = await client.rpc('can_manage_fines');
      canManageFines = !capabilityResponse?.error && capabilityResponse?.data === true;
    } catch {
      canManageFines = false;
    }
    return {
      kind: 'player',
      membership: normalizedMembership,
      capabilities: { canManageFines },
    };
  }

  return denied(role === 'viewer' ? 'role_not_enabled' : 'role_unknown', normalizedMembership);
};
