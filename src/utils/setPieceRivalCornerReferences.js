import { getPlayerDisplayName } from './playerDisplayName.js';

export const RIVAL_CORNER_REFERENCE_ROLES = Object.freeze([
  Object.freeze({ id: 'corner_taker', label: 'Lanzador', printLabel: 'Lanzador' }),
  Object.freeze({ id: 'corner_target', label: 'Rematador', printLabel: 'Rematadores' }),
  Object.freeze({ id: 'corner_second_ball', label: 'Rechace', printLabel: 'Rechace' }),
  Object.freeze({ id: 'corner_stay_back', label: 'Atrás', printLabel: 'Atrás' }),
]);

const roleIds = new Set(RIVAL_CORNER_REFERENCE_ROLES.map((role) => role.id));
const clean = (value) => String(value ?? '').trim();
const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

export const isCanonicalRivalPlayerId = (value) => (
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(value))
);

export const getCanonicalRivalCornerPlayerId = (player) => (
  [player?.globalPlayerId, player?.jugadorRivalId, player?.id]
    .map(clean)
    .find(isCanonicalRivalPlayerId) || ''
);

export const isRivalOffensiveCornerPlay = (play) => (
  play?.setPieceType === 'offensive_set_piece' && play?.setPieceAction === 'corner'
);

export const normalizeRivalCornerReferences = (source) => Object.fromEntries(
  Object.entries(asObject(source))
    .map(([playerId, entry]) => {
      const normalizedId = clean(playerId);
      const normalizedEntry = asObject(entry);
      const roles = [...new Set((Array.isArray(normalizedEntry.roles) ? normalizedEntry.roles : [])
        .map(clean)
        .filter((roleId) => roleIds.has(roleId)))];
      return [normalizedId, {
        roles,
        positionKey: clean(normalizedEntry.positionKey),
      }];
    })
    .filter(([playerId, entry]) => isCanonicalRivalPlayerId(playerId) && entry.roles.length)
);

export const getRivalCornerRoleIds = (source, playerId) => (
  normalizeRivalCornerReferences(source)[clean(playerId)]?.roles || []
);

export const toggleRivalCornerReference = (source, { playerId, positionKey, roleId } = {}) => {
  const references = normalizeRivalCornerReferences(source);
  const normalizedPlayerId = clean(playerId);
  const normalizedRoleId = clean(roleId);
  if (!isCanonicalRivalPlayerId(normalizedPlayerId) || !roleIds.has(normalizedRoleId)) {
    return references;
  }
  const current = references[normalizedPlayerId] || { roles: [], positionKey: '' };
  const hasRole = current.roles.includes(normalizedRoleId);
  const roles = hasRole
    ? current.roles.filter((id) => id !== normalizedRoleId)
    : RIVAL_CORNER_REFERENCE_ROLES.map((role) => role.id)
      .filter((id) => id === normalizedRoleId || current.roles.includes(id));
  if (!roles.length) {
    delete references[normalizedPlayerId];
    return references;
  }
  return {
    ...references,
    [normalizedPlayerId]: {
      roles,
      positionKey: clean(positionKey) || current.positionKey,
    },
  };
};

export const normalizeRivalCornerPlayExtension = (play) => ({
  includeRivalReferencesInPrint: play?.includeRivalReferencesInPrint === true,
  rivalCornerReferences: normalizeRivalCornerReferences(play?.rivalCornerReferences),
});

const getPlayerNumber = (player) => {
  const value = player?.number ?? player?.dorsal;
  return clean(value) && Number(value) > 0 ? clean(value) : '';
};

export const formatRivalCornerReferencePlayer = (player) => {
  const name = clean(getPlayerDisplayName(player) || player?.name);
  const number = getPlayerNumber(player);
  return [number, name].filter(Boolean).join(' ');
};

export const buildRivalCornerReferencesPrintModel = ({ preAiAnalysis, rivalPlayers = [] } = {}) => {
  const playersById = new Map(
    (Array.isArray(rivalPlayers) ? rivalPlayers : [])
      .map((player) => [getCanonicalRivalCornerPlayerId(player), player])
      .filter(([playerId]) => playerId)
  );
  const plays = Array.isArray(preAiAnalysis?.setPiecePhaseV1?.plays)
    ? preAiAnalysis.setPiecePhaseV1.plays
    : [];
  return plays
    .filter((play) => isRivalOffensiveCornerPlay(play) && play.includeRivalReferencesInPrint === true)
    .map((play) => {
      const references = normalizeRivalCornerReferences(play.rivalCornerReferences);
      return {
        id: clean(play.id),
        name: clean(play.name) || 'Jugada',
        roles: RIVAL_CORNER_REFERENCE_ROLES.map((role) => ({
          ...role,
          players: Object.entries(references)
            .filter(([, entry]) => entry.roles.includes(role.id))
            .map(([playerId]) => playersById.get(playerId))
            .filter(Boolean)
            .map(formatRivalCornerReferencePlayer)
            .filter(Boolean),
        })),
      };
    });
};
