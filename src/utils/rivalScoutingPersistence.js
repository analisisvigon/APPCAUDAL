const safeArray = (value) => Array.isArray(value) ? value : [];
const safeObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const clean = (value) => String(value ?? '').trim();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const RIVAL_SCOUTING_STORAGE = Object.freeze({
  tacticalIdentity: { key: 'caudal_rival_tactical_identity_v1', classification: 'business' },
  observedScouting: { key: 'caudal-rival-observed-scouting-v1', classification: 'business' },
  scoutingDrafts: { key: 'caudal-rival-scouting-drafts-v1', classification: 'mixed_business_draft' },
  playerFlags: { key: 'caudal-rival-player-flags-v1', classification: 'legacy_cache' },
  playerDatabaseView: { key: 'caudal-global-player-database-view-v1', classification: 'local_preference' },
});

export const readLegacyRivalScoutingStorage = (storage) => {
  const read = (key) => {
    try { return safeObject(JSON.parse(storage?.getItem?.(key) || '{}')); } catch { return {}; }
  };
  return {
    tacticalIdentity: read(RIVAL_SCOUTING_STORAGE.tacticalIdentity.key),
    observedScouting: read(RIVAL_SCOUTING_STORAGE.observedScouting.key),
    scoutingDrafts: read(RIVAL_SCOUTING_STORAGE.scoutingDrafts.key),
    playerFlags: read(RIVAL_SCOUTING_STORAGE.playerFlags.key),
  };
};

const isEmpty = (value) => value == null
  || value === ''
  || (Array.isArray(value) && value.length === 0)
  || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);

export const mergeLegacyWithoutOverwritingRemote = (remoteValue, legacyValue, path = '') => {
  const remote = safeObject(remoteValue);
  const legacy = safeObject(legacyValue);
  const merged = { ...remote };
  const conflicts = [];
  Object.entries(legacy).forEach(([key, legacyEntry]) => {
    const fieldPath = path ? `${path}.${key}` : key;
    const remoteEntry = remote[key];
    if (isEmpty(remoteEntry)) {
      merged[key] = legacyEntry;
      return;
    }
    if (
      remoteEntry && legacyEntry
      && typeof remoteEntry === 'object' && !Array.isArray(remoteEntry)
      && typeof legacyEntry === 'object' && !Array.isArray(legacyEntry)
    ) {
      const nested = mergeLegacyWithoutOverwritingRemote(remoteEntry, legacyEntry, fieldPath);
      merged[key] = nested.merged;
      conflicts.push(...nested.conflicts);
      return;
    }
    if (JSON.stringify(remoteEntry) !== JSON.stringify(legacyEntry)) {
      conflicts.push({ path: fieldPath, remote: remoteEntry, legacy: legacyEntry });
    }
  });
  return { merged, conflicts };
};

const stableSerialize = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};

export const legacyPayloadFingerprint = (value) => {
  const source = stableSerialize(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

const normalizeName = (value) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export const resolveLegacyMatchId = (legacyMatchText, matches = [], teamId = '') => {
  const needle = normalizeName(legacyMatchText);
  if (!needle) return null;
  const candidates = safeArray(matches).filter((match) => {
    const sameTeam = teamId && String(match.equipoRivalId || match.equipo_rival_id || '') === String(teamId);
    const labels = [match.id, match.opponent, match.name, match.date, `${match.opponent || ''} ${match.date || ''}`].map(normalizeName);
    return sameTeam && labels.includes(needle);
  });
  return candidates.length === 1 ? candidates[0].id : null;
};

const findTeamPlayer = (team, legacyKey) => safeArray(team?.squad).find((player) => (
  [player.globalPlayerId, player.membershipId, player.jugadorRivalId, player.id, player.name]
    .some((value) => String(value || '') === String(legacyKey || ''))
));

const playerIdentity = (player = {}) => ({
  global_player_id: UUID_PATTERN.test(clean(player.globalPlayerId)) ? player.globalPlayerId : null,
  membership_id: UUID_PATTERN.test(clean(player.membershipId)) ? player.membershipId : null,
  jugador_rival_id: UUID_PATTERN.test(clean(player.jugadorRivalId || player.id)) ? (player.jugadorRivalId || player.id) : null,
});

export const getRivalScoutingPlayerIdentity = (player = {}) => ({
  ...playerIdentity(player),
  legacy_player_key: clean(player.globalPlayerId || player.membershipId || player.jugadorRivalId || player.id || player.name) || null,
});

const endpointFromLegacy = (value, team, teamScope = 'rival') => {
  const player = findTeamPlayer(team, value);
  if (player && teamScope === 'caudal' && UUID_PATTERN.test(clean(player.id))) return {
    entity_type: 'player', global_player_id: null, membership_id: null, jugador_rival_id: null,
    jugador_id: player.id, role: null, label: player.name || clean(value),
  };
  if (player && teamScope !== 'caudal') {
    const identity = playerIdentity(player);
    if (identity.global_player_id || identity.membership_id || identity.jugador_rival_id) {
      return { entity_type: 'player', ...identity, jugador_id: null, role: null, label: player.name || clean(value) };
    }
  }
  return { entity_type: 'role', global_player_id: null, membership_id: null, jugador_rival_id: null, jugador_id: null, role: clean(value), label: clean(value) };
};

export const buildLegacyRivalScoutingPlan = ({ legacy, teams = [], matches = [], ownPlayers = [], remoteByTeam = {} } = {}) => {
  const operations = [];
  safeArray(teams).filter((team) => UUID_PATTERN.test(clean(team.id))).forEach((team) => {
    const teamId = team.id;
    const identity = safeObject(legacy?.tacticalIdentity?.[teamId]);
    const observed = safeObject(legacy?.observedScouting?.[teamId]);
    const draft = safeObject(legacy?.scoutingDrafts?.[teamId]);
    const remote = safeObject(remoteByTeam[teamId]);
    [
      [RIVAL_SCOUTING_STORAGE.tacticalIdentity.key, 'tacticalIdentity', identity, remote.tacticalIdentity],
      [RIVAL_SCOUTING_STORAGE.observedScouting.key, 'collective', safeObject(observed.collective), remote.collective],
      [RIVAL_SCOUTING_STORAGE.scoutingDrafts.key, 'matchPlanNotes', draft, remote.matchPlanNotes],
    ].forEach(([storageKey, section, legacyValue, remoteValue]) => {
      if (!Object.keys(legacyValue).length) return;
      const merged = mergeLegacyWithoutOverwritingRemote(remoteValue, legacyValue, section);
      operations.push({
        kind: 'profile_section', storageKey, teamId, legacyItemId: `${teamId}:${section}`,
        section, payload: merged.merged, conflicts: merged.conflicts,
      });
    });
    Object.entries(safeObject(observed.playerProfiles)).forEach(([legacyKey, profile]) => {
      const player = findTeamPlayer(team, legacyKey);
      operations.push({ kind: 'player_profile', storageKey: RIVAL_SCOUTING_STORAGE.observedScouting.key, teamId, legacyItemId: `player:${legacyKey}`, payload: { ...playerIdentity(player), legacy_player_key: legacyKey, profile: safeObject(profile) }, conflicts: player ? [] : [{ path: 'player_identity', remote: null, legacy: legacyKey }] });
    });
    safeArray(observed.evidences).forEach((evidence, index) => {
      const legacyId = clean(evidence.id) || `index:${index}:${legacyPayloadFingerprint(evidence)}`;
      const legacyValidation = safeObject(observed.evidenceValidations)[`manual:${legacyId}`] || {};
      operations.push({ kind: 'evidence', storageKey: RIVAL_SCOUTING_STORAGE.observedScouting.key, teamId, legacyItemId: legacyId, payload: {
        legacy_id: legacyId,
        partido_id: resolveLegacyMatchId(evidence.match, matches, teamId),
        evidence_type: clean(evidence.type) || 'Ataque',
        importance: clean(evidence.importance) || 'Media',
        interpretation: clean(legacyValidation.interpretation || evidence.observation),
        notes: clean(legacyValidation.notes),
        status: ['confirmed', 'discarded'].includes(legacyValidation.status)
          ? legacyValidation.status
          : 'pending',
        source: 'legacy_local_storage',
        source_context: { legacy_match_text: clean(evidence.match), legacy_date: clean(evidence.date) },
      }, conflicts: [] });
    });
    safeArray(observed.tacticalConnections).forEach((connection, index) => {
      const legacyId = clean(connection.id) || `index:${index}:${legacyPayloadFingerprint(connection)}`;
      operations.push({ kind: 'connection', storageKey: RIVAL_SCOUTING_STORAGE.observedScouting.key, teamId, legacyItemId: legacyId, payload: {
        legacy_id: legacyId,
        team_scope: connection.team === 'caudal' ? 'caudal' : 'rival',
        source_endpoint: endpointFromLegacy(connection.origin, connection.team === 'caudal' ? { squad: ownPlayers } : team, connection.team),
        target_endpoint: endpointFromLegacy(connection.destination, connection.team === 'caudal' ? { squad: ownPlayers } : team, connection.team),
        connection_type: clean(connection.type) || 'Pase habitual',
        intensity: clean(connection.intensity) || 'Media',
        comment: clean(connection.comment),
      }, conflicts: [] });
    });

    Object.entries(safeObject(legacy?.playerFlags)).forEach(([legacyKey, flags]) => {
      if (!legacyKey.startsWith(`${teamId}::`)) return;
      const legacyName = legacyKey.slice(`${teamId}::`.length);
      const player = findTeamPlayer(team, legacyName)
        || safeArray(team.squad).find((candidate) => normalizeName(candidate.name) === normalizeName(legacyName));
      const remoteFlags = player ? {
        captain: Boolean(player.captain),
        observed: Boolean(player.observed),
        tacticalRole: clean(player.tacticalRole || player.tactical_role),
        tacticalSlot: player.tacticalSlot ?? player.tactical_slot ?? null,
        tacticalReserveSlot: player.tacticalReserveSlot ?? player.tactical_reserve_slot ?? null,
      } : null;
      const normalizedLegacyFlags = {
        captain: Boolean(flags?.captain),
        observed: Boolean(flags?.observed),
        tacticalRole: clean(flags?.fieldRole || flags?.tacticalRole),
        tacticalSlot: flags?.slotIndex ?? flags?.tacticalSlot ?? null,
        tacticalReserveSlot: flags?.reserveIndex ?? flags?.tacticalReserveSlot ?? null,
      };
      const differs = remoteFlags && JSON.stringify(remoteFlags) !== JSON.stringify(normalizedLegacyFlags);
      operations.push({
        kind: 'player_flags_candidate',
        storageKey: RIVAL_SCOUTING_STORAGE.playerFlags.key,
        teamId,
        legacyItemId: legacyKey,
        payload: normalizedLegacyFlags,
        conflicts: player && differs
          ? [{ path: 'player_flags', remote: remoteFlags, legacy: normalizedLegacyFlags }]
          : player ? [] : [{ path: 'player_identity', remote: null, legacy: legacyName }],
      });
    });
  });
  return operations.map((operation) => ({ ...operation, fingerprint: legacyPayloadFingerprint(operation.payload) }));
};

export const shouldApplyScoutingResponse = ({ requestedTeamId, currentTeamId, requestId, latestRequestId }) => (
  String(requestedTeamId || '') === String(currentTeamId || '') && Number(requestId) === Number(latestRequestId)
);

export const resolveRivalPlayerFlags = ({ remotePlayer, legacyFlags = {} } = {}) => {
  const remote = safeObject(remotePlayer);
  const persisted = Object.keys(remote).length ? {
    captain: Boolean(remote.captain),
    observed: Boolean(remote.observed),
    ...(clean(remote.fieldRole || remote.tacticalRole || remote.tactical_role) ? {
      fieldRole: remote.fieldRole || remote.tacticalRole || remote.tactical_role,
      slotIndex: remote.slotIndex ?? remote.tacticalSlot ?? remote.tactical_slot ?? null,
      reserveIndex: remote.reserveIndex ?? remote.tacticalReserveSlot ?? remote.tactical_reserve_slot ?? null,
      hiddenFromField: false,
    } : {}),
  } : {};
  const hasRemoteIdentity = Boolean(remote.membershipId || remote.membership_id || remote.globalPlayerId || remote.global_player_id || remote.jugadorRivalId || remote.jugador_rival_id || UUID_PATTERN.test(clean(remote.id)));
  return hasRemoteIdentity ? persisted : { ...persisted, ...safeObject(legacyFlags) };
};

export const hydrateRivalScoutingBundle = ({ profiles = [], playerProfiles = [], evidences = [], connections = [] } = {}) => {
  const byTeam = {};
  const ensure = (teamId) => {
    if (!byTeam[teamId]) byTeam[teamId] = { collective: {}, playerProfiles: {}, evidences: [], evidenceValidations: {}, tacticalConnections: [], tacticalIdentity: {}, matchPlanNotes: {}, updatedAt: '' };
    return byTeam[teamId];
  };
  safeArray(profiles).forEach((row) => Object.assign(ensure(row.equipo_rival_id), {
    tacticalIdentity: safeObject(row.tactical_identity), collective: safeObject(row.collective_profile), matchPlanNotes: safeObject(row.match_plan_notes), updatedAt: row.updated_at || '',
  }));
  safeArray(playerProfiles).forEach((row) => {
    const key = clean(row.global_player_id || row.membership_id || row.jugador_rival_id || row.legacy_player_key);
    if (key) ensure(row.equipo_rival_id).playerProfiles[key] = { ...safeObject(row.profile), id: row.id, updatedAt: row.updated_at || '' };
  });
  safeArray(evidences).forEach((row) => ensure(row.equipo_rival_id).evidences.push({
    id: row.id, partidoId: row.partido_id || null, match: safeObject(row.source_context).legacy_match_text || '', date: safeObject(row.source_context).legacy_date || row.created_at || '', type: row.evidence_type, importance: row.importance, observation: row.interpretation, notes: row.notes || '', status: row.status, source: row.source, updatedAt: row.updated_at || '',
  }));
  safeArray(connections).forEach((row) => ensure(row.equipo_rival_id).tacticalConnections.push({
    id: row.id, team: row.team_scope, origin: row.source_label || row.source_role || row.source_global_player_id || row.source_membership_id || row.source_jugador_rival_id || row.source_jugador_id, destination: row.target_label || row.target_role || row.target_global_player_id || row.target_membership_id || row.target_jugador_rival_id || row.target_jugador_id, sourceType: row.source_entity_type, targetType: row.target_entity_type, type: row.connection_type, intensity: row.intensity, comment: row.comment || '', createdAt: row.created_at || '',
  }));
  return byTeam;
};

export const buildConnectionPayload = ({ teamId, matchId = null, draft, players = [] }) => {
  const team = { squad: players };
  const teamScope = draft.team === 'caudal' ? 'caudal' : 'rival';
  const source = endpointFromLegacy(draft.origin, team, teamScope);
  const target = endpointFromLegacy(draft.destination, team, teamScope);
  return {
    equipo_rival_id: teamId,
    partido_id: matchId || null,
    team_scope: draft.team === 'caudal' ? 'caudal' : 'rival',
    source_entity_type: source.entity_type,
    source_global_player_id: source.global_player_id,
    source_membership_id: source.membership_id,
    source_jugador_rival_id: source.jugador_rival_id,
    source_jugador_id: source.jugador_id,
    source_role: source.role,
    source_label: source.label,
    target_entity_type: target.entity_type,
    target_global_player_id: target.global_player_id,
    target_membership_id: target.membership_id,
    target_jugador_rival_id: target.jugador_rival_id,
    target_jugador_id: target.jugador_id,
    target_role: target.role,
    target_label: target.label,
    connection_type: draft.type,
    intensity: draft.intensity,
    comment: clean(draft.comment) || null,
  };
};
