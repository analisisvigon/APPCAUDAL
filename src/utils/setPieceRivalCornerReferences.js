import { getPlayerDisplayName } from './playerDisplayName.js';
import { normalizeSetPieceResponsibilities } from './setPieceResponsibilities.js';

export const RIVAL_CORNER_REFERENCE_ROLES = Object.freeze([
  Object.freeze({ id: 'corner_taker', label: 'Lanzador', printLabel: 'Lanzador' }),
  Object.freeze({ id: 'corner_target', label: 'Rematador', printLabel: 'Rematadores' }),
  Object.freeze({ id: 'corner_second_ball', label: 'Rechace', printLabel: 'Rechace' }),
  Object.freeze({ id: 'corner_stay_back', label: 'Atrás', printLabel: 'Atrás' }),
]);

export const RIVAL_CORNER_RESPONSIBILITY_PRINT_ROLE = Object.freeze({
  off_lanzador: 'corner_taker',
  off_lanzador_1: 'corner_taker',
  off_lanzador_2: 'corner_taker',
  off_rematador: 'corner_target',
  off_rematador_1: 'corner_target',
  off_rematador_2: 'corner_target',
  off_rematador_3: 'corner_target',
  off_rematador_4: 'corner_target',
  off_rechace: 'corner_second_ball',
  off_rechace_1: 'corner_second_ball',
  off_rechace_2: 'corner_second_ball',
  off_se_queda: 'corner_stay_back',
});

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
      const responsibilities = normalizeSetPieceResponsibilities(play.responsibilities);
      const references = normalizeRivalCornerReferences(play.rivalCornerReferences);
      const canonicalPlayerIds = new Set(Object.keys(responsibilities));
      const playerIdsByRole = new Map(RIVAL_CORNER_REFERENCE_ROLES.map((role) => [role.id, new Set()]));

      Object.entries(responsibilities).forEach(([playerId, entry]) => {
        const roleId = RIVAL_CORNER_RESPONSIBILITY_PRINT_ROLE[entry.responsibilityId];
        if (roleId) playerIdsByRole.get(roleId)?.add(playerId);
      });
      Object.entries(references).forEach(([playerId, entry]) => {
        if (canonicalPlayerIds.has(playerId)) return;
        entry.roles.forEach((roleId) => playerIdsByRole.get(roleId)?.add(playerId));
      });

      return {
        id: clean(play.id),
        name: clean(play.name) || 'Jugada',
        roles: RIVAL_CORNER_REFERENCE_ROLES.map((role) => ({
          ...role,
          players: [...(playerIdsByRole.get(role.id) || [])]
            .map((playerId) => playersById.get(playerId))
            .filter(Boolean)
            .map(formatRivalCornerReferencePlayer)
            .filter(Boolean),
        })),
      };
    });
};
