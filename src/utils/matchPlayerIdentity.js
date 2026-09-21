const clean = (value) => String(value ?? '').trim();
const rows = (value) => Array.isArray(value) ? value : [];

export const normalizeMatchPlayerName = (value) => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase('es');

export const getMatchPlayerName = (row = {}) => clean(
  row.playerName
  || row.player_name
  || row.playerNameSnapshot
  || row.player_name_snapshot
  || row.name
);

export const getMatchPlayerIdentityIds = (row = {}) => Array.from(new Set([
  row.canonicalPlayerId,
  row.canonical_player_id,
  row.canonicalId,
  row.playerId,
  row.player_id,
  row.jugadorId,
  row.jugador_id,
  row.id,
  row.globalPlayerId,
  row.global_player_id,
  row.membershipId,
  row.membership_id,
  row.legacyId,
  row.legacy_id,
  ...rows(row.aliasIds || row.alias_ids || row.legacyIds || row.legacy_ids),
].map(clean).filter(Boolean)));

const intersects = (left, right) => left.some((value) => right.includes(value));

export const createMatchPlayerIdentityIndex = (records = []) => {
  const identities = [];
  rows(records).filter(Boolean).forEach((record) => {
    const ids = getMatchPlayerIdentityIds(record);
    const name = normalizeMatchPlayerName(getMatchPlayerName(record));
    if (!ids.length && !name) return;
    const related = identities.filter((identity) => ids.length && intersects(ids, identity.ids));
    const canonicalId = clean(record.canonicalPlayerId || record.canonical_player_id || record.canonicalId || record.id || record.jugadorId || record.jugador_id || record.playerId || record.player_id);
    if (!related.length) {
      identities.push({ canonicalId: canonicalId || ids[0] || '', ids, names: name ? [name] : [] });
      return;
    }
    const target = related[0];
    target.canonicalId ||= canonicalId || ids[0] || '';
    target.ids = Array.from(new Set([...target.ids, ...ids]));
    target.names = Array.from(new Set([...target.names, ...(name ? [name] : [])]));
    related.slice(1).forEach((duplicate) => {
      target.ids = Array.from(new Set([...target.ids, ...duplicate.ids]));
      target.names = Array.from(new Set([...target.names, ...duplicate.names]));
      identities.splice(identities.indexOf(duplicate), 1);
    });
  });
  return { identities };
};

const identitiesForIds = (index, ids) => rows(index?.identities).filter((identity) => intersects(ids, identity.ids));
const identitiesForName = (index, name) => name
  ? rows(index?.identities).filter((identity) => identity.names.includes(name))
  : [];

export const inspectMatchPlayerIdentity = (row = {}, index = null) => {
  const rawIds = getMatchPlayerIdentityIds(row);
  const name = normalizeMatchPlayerName(getMatchPlayerName(row));
  const idMatches = identitiesForIds(index, rawIds);
  const nameMatches = identitiesForName(index, name);
  const identity = idMatches.length === 1 ? idMatches[0] : null;
  const ids = identity ? Array.from(new Set([...rawIds, ...identity.ids])) : rawIds;
  const nameConflict = Boolean(identity && nameMatches.length === 1 && nameMatches[0] !== identity);
  return {
    rawIds,
    ids,
    name,
    identity,
    canonicalId: identity?.canonicalId || rawIds[0] || '',
    ambiguousIds: idMatches.length > 1,
    nameConflict,
  };
};

export const getMatchPlayerIdentityKey = (row = {}, index = null) => {
  const inspected = inspectMatchPlayerIdentity(row, index);
  if (inspected.identity?.canonicalId) return `canonical:${inspected.identity.canonicalId}`;
  if (inspected.rawIds.length) return `id:${inspected.rawIds[0]}`;
  return inspected.name ? `name:${inspected.name}` : '';
};

export const resolveMatchPlayerCandidate = ({ reference = {}, candidates = [], identityIndex = null } = {}) => {
  const inspectedReference = inspectMatchPlayerIdentity(reference, identityIndex);
  const inspectedCandidates = rows(candidates).map((candidate) => ({
    candidate,
    inspected: inspectMatchPlayerIdentity(candidate, identityIndex),
  }));
  if (inspectedReference.ambiguousIds || inspectedReference.nameConflict) {
    return { status: 'identity_conflict', candidate: null, mode: '', conflicts: [reference] };
  }
  const idMatches = inspectedReference.ids.length
    ? inspectedCandidates.filter(({ inspected }) => intersects(inspectedReference.ids, inspected.ids))
    : [];
  if (idMatches.length === 1 && !idMatches[0].inspected.ambiguousIds && !idMatches[0].inspected.nameConflict) {
    return { status: 'resolved', candidate: idMatches[0].candidate, mode: 'id', conflicts: [] };
  }
  if (idMatches.length > 1 || idMatches.some(({ inspected }) => inspected.ambiguousIds || inspected.nameConflict)) {
    return { status: 'ambiguous', candidate: null, mode: '', conflicts: idMatches.map(({ candidate }) => candidate) };
  }
  const nameMatches = inspectedReference.name
    ? inspectedCandidates.filter(({ inspected }) => inspected.name === inspectedReference.name)
    : [];
  if (nameMatches.length !== 1) {
    return {
      status: nameMatches.length > 1 ? 'ambiguous' : 'missing',
      candidate: null,
      mode: '',
      conflicts: nameMatches.map(({ candidate }) => candidate),
    };
  }
  const selected = nameMatches[0];
  const contradictoryIds = inspectedReference.rawIds.length > 0 && selected.inspected.rawIds.length > 0;
  if (contradictoryIds || selected.inspected.ambiguousIds || selected.inspected.nameConflict) {
    return { status: 'identity_conflict', candidate: null, mode: '', conflicts: [selected.candidate] };
  }
  return { status: 'resolved', candidate: selected.candidate, mode: 'unique_name', conflicts: [] };
};

export const buildMatchPlayerIdentityRecordsFromStats = (playerStats = {}) => Object.entries(playerStats || {}).map(([playerName, stats]) => ({
  canonicalPlayerId: stats?.canonicalPlayerId || stats?.canonical_player_id || '',
  playerId: stats?.jugadorId || stats?.jugador_id || stats?.playerId || stats?.player_id || '',
  globalPlayerId: stats?.globalPlayerId || stats?.global_player_id || '',
  membershipId: stats?.membershipId || stats?.membership_id || '',
  aliasIds: stats?.aliasIds || stats?.alias_ids || [],
  playerName,
}));
