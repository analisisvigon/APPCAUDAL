import { getPlayerPositionModel, mapExternalPositionToPlayerPositions } from '../constants/playerPositions.js';
import { isPlayerAvailable } from './playerAvailability.js';

export const UNASSIGNED_SET_PIECE_PLAYER_NAME = 'Jugador por asignar';

const FORMATION_ROLES = Object.freeze({
  '4-4-2': ['Portero', 'Lateral izquierdo', 'Central izquierdo', 'Central derecho', 'Lateral derecho', 'Extremo izquierdo', 'Mediocentro', 'Mediocentro', 'Extremo derecho', 'Delantero', 'Delantero'],
  '4-2-3-1': ['Portero', 'Lateral izquierdo', 'Central izquierdo', 'Central derecho', 'Lateral derecho', 'Mediocentro', 'Mediocentro', 'Extremo izquierdo', 'Mediapunta', 'Extremo derecho', 'Delantero'],
  '4-3-3': ['Portero', 'Lateral izquierdo', 'Central izquierdo', 'Central derecho', 'Lateral derecho', 'Pivote', 'Interior izquierdo', 'Interior derecho', 'Extremo izquierdo', 'Delantero', 'Extremo derecho'],
  '3-5-2': ['Portero', 'Central izquierdo', 'Central', 'Central derecho', 'Pivote', 'Carrilero izquierdo', 'Interior izquierdo', 'Interior derecho', 'Carrilero derecho', 'Delantero', 'Delantero'],
  '3-4-3': ['Portero', 'Central izquierdo', 'Central', 'Central derecho', 'Carrilero izquierdo', 'Mediocentro', 'Mediocentro', 'Carrilero derecho', 'Extremo izquierdo', 'Delantero', 'Extremo derecho'],
  '5-3-2': ['Portero', 'Carrilero izquierdo', 'Central izquierdo', 'Central', 'Central derecho', 'Carrilero derecho', 'Interior izquierdo', 'Pivote', 'Interior derecho', 'Delantero', 'Delantero'],
});

const clean = (value) => String(value ?? '').trim();
const idKey = (value) => clean(value).toLocaleLowerCase('es');
const normalizeName = (value) => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/gi, ' ')
  .trim()
  .toLocaleLowerCase('es');
const safeArray = (value) => (Array.isArray(value) ? value : []);
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(value));

const normalizePlayer = (player = {}) => ({
  ...player,
  id: clean(player.id),
  name: clean(player.name ?? player.nombre),
  shirtName: clean(player.shirtName ?? player.shirt_name ?? player.nombre_camiseta),
  shortName: clean(player.shortName ?? player.short_name),
  number: player.number ?? player.dorsal ?? '',
  position: player.position ?? player.posicion ?? '',
  specificPosition: player.specificPosition ?? player.specific_position ?? '',
  primaryNaturalPosition: player.primaryNaturalPosition ?? player.primary_natural_position ?? '',
  secondaryNaturalPositions: player.secondaryNaturalPositions ?? player.secondary_natural_positions ?? [],
  primarySpecificPosition: player.primarySpecificPosition ?? player.primary_specific_position ?? '',
  secondarySpecificPositions: player.secondarySpecificPositions ?? player.secondary_specific_positions ?? [],
  availabilityStatus: player.availabilityStatus ?? player.availability_status,
  suspensionMatchesRemaining: player.suspensionMatchesRemaining ?? player.suspension_matches_remaining,
});

const normalizeSlotRows = (rows = []) => safeArray(rows).flatMap((row) => {
  if (row?.scope && row.scope !== 'stats') return [];
  const slot = Number(row?.slot);
  const jugadorId = clean(row?.jugadorId ?? row?.jugador_id);
  if (!Number.isInteger(slot) || slot < 0 || slot > 10 || !jugadorId) return [];
  return [{ slot, jugadorId, playerName: clean(row?.playerName ?? row?.player_name) }];
});

const getPlayerAliases = (player = {}) => [
  player.name,
  player.nombre,
  player.shirtName,
  player.shirt_name,
  player.shortName,
  player.short_name,
  player.abbreviation,
  player.abreviatura,
].map(normalizeName).filter(Boolean);

const getElementLegacyAliases = (element = {}) => [
  element.name,
  element.shirtName,
  element.shirt_name,
  element.shortName,
  element.short_name,
  element.abbreviation,
  element.abreviatura,
].map(normalizeName).filter(Boolean);

const getPlayerDisplayName = (player, fallback = '') => clean(
  player?.shirtName || player?.shirt_name || player?.shortName || player?.short_name || player?.name || fallback
);

const buildPlayerIndex = (players = []) => new Map(safeArray(players)
  .map(normalizePlayer)
  .filter((player) => player.id)
  .map((player) => [idKey(player.id), player]));

const buildLegacyIdentityIndex = ({ sourceSlots, playersById }) => {
  const idsByAlias = new Map();
  const add = (alias, jugadorId) => {
    const key = normalizeName(alias);
    if (!key || !jugadorId) return;
    const ids = idsByAlias.get(key) || new Set();
    ids.add(jugadorId);
    idsByAlias.set(key, ids);
  };
  sourceSlots.forEach((slot) => {
    add(slot.playerName, slot.jugadorId);
    const player = playersById.get(idKey(slot.jugadorId));
    getPlayerAliases(player).forEach((alias) => add(alias, slot.jugadorId));
  });
  return Object.fromEntries([...idsByAlias.entries()]
    .filter(([, ids]) => ids.size === 1)
    .map(([alias, ids]) => [alias, [...ids][0]]));
};

const resolveElementPlayerId = (element, legacyIdentityByName) => {
  const canonicalId = clean(element?.player_id);
  if (canonicalId) return canonicalId;
  const matches = new Set(getElementLegacyAliases(element)
    .map((alias) => legacyIdentityByName[alias])
    .filter(Boolean));
  return matches.size === 1 ? [...matches][0] : '';
};

const getPositionTargets = ({ player, tacticalRole }) => {
  const playerModel = player ? getPlayerPositionModel(player) : {};
  const roleModel = tacticalRole ? mapExternalPositionToPlayerPositions(tacticalRole) : {};
  const specific = new Set([
    playerModel.primarySpecificPosition,
    ...safeArray(playerModel.secondarySpecificPositions),
  ].filter(Boolean));
  const natural = new Set([
    playerModel.primaryNaturalPosition,
    ...safeArray(playerModel.secondaryNaturalPositions),
  ].filter(Boolean));
  if (!specific.size) [roleModel.primarySpecificPosition, ...safeArray(roleModel.secondarySpecificPositions)].filter(Boolean).forEach((value) => specific.add(value));
  if (!natural.size) [roleModel.primaryNaturalPosition, ...safeArray(roleModel.secondaryNaturalPositions)].filter(Boolean).forEach((value) => natural.add(value));
  return { specific, natural };
};

const intersects = (left, right) => [...left].some((value) => right.has(value));

const getCandidatePosition = (player) => {
  const model = getPlayerPositionModel(player || {});
  return {
    specific: new Set([model.primarySpecificPosition, ...safeArray(model.secondarySpecificPositions)].filter(Boolean)),
    natural: new Set([model.primaryNaturalPosition, ...safeArray(model.secondaryNaturalPositions)].filter(Boolean)),
  };
};

const getDiagramParticipantIds = (diagrams, legacyIdentityByName) => new Set(safeArray(diagrams)
  .flatMap((diagram) => safeArray(diagram?.elements))
  .filter((element) => element?.type === 'player')
  .map((element) => resolveElementPlayerId(element, legacyIdentityByName))
  .filter(Boolean)
  .map(idKey));

const getReasonLabel = (reason) => ({
  ambiguous_specific: 'Varios titulares comparten la posición específica',
  ambiguous_family: 'Varios titulares comparten la familia de posición',
  conflicting_candidate: 'El mismo titular sería asignado a participantes distintos',
  no_candidate: 'Sin sustituto inequívoco',
}[reason] || 'Revisión manual necesaria');

export const buildSetPieceLineupAdaptation = ({
  diagrams = [],
  sourceSlots = [],
  currentSlots = [],
  sourceSystem = '',
  currentSystem = '',
  players = [],
} = {}) => {
  const normalizedSourceSlots = normalizeSlotRows(sourceSlots);
  const normalizedCurrentSlots = normalizeSlotRows(currentSlots);
  const currentIds = normalizedCurrentSlots.map((slot) => idKey(slot.jugadorId));
  const currentSlotIndexes = normalizedCurrentSlots.map((slot) => slot.slot);
  const currentLineupDefined = normalizedCurrentSlots.length === 11
    && new Set(currentIds).size === 11
    && new Set(currentSlotIndexes).size === 11
    && normalizedCurrentSlots.every((slot) => isUuid(slot.jugadorId));
  const sourceIds = new Set(normalizedSourceSlots.map((slot) => idKey(slot.jugadorId)));
  const sourceLineupReliable = normalizedSourceSlots.length === 11
    && sourceIds.size === 11
    && new Set(normalizedSourceSlots.map((slot) => slot.slot)).size === 11
    && normalizedSourceSlots.every((slot) => isUuid(slot.jugadorId));
  const playersById = buildPlayerIndex(players);
  const legacyIdentityByName = buildLegacyIdentityIndex({ sourceSlots: normalizedSourceSlots, playersById });
  const participantIds = getDiagramParticipantIds(diagrams, legacyIdentityByName);
  const currentSlotByPlayerId = new Map(normalizedCurrentSlots.map((slot) => [idKey(slot.jugadorId), slot]));
  const sourceSlotByPlayerId = new Map(normalizedSourceSlots.map((slot) => [idKey(slot.jugadorId), slot]));
  const effectiveCurrentSlots = normalizedCurrentSlots.filter((slot) => {
    const player = playersById.get(idKey(slot.jugadorId));
    return !player || isPlayerAvailable(player);
  });
  const effectiveCurrentIds = new Set(effectiveCurrentSlots.map((slot) => idKey(slot.jugadorId)));

  if (!currentLineupDefined) {
    return {
      canAdapt: false,
      currentLineupDefined: false,
      sourceLineupReliable,
      systemsMatch: Boolean(sourceSystem && currentSystem && sourceSystem === currentSystem),
      substitutionMap: {},
      unresolvedPlayerIds: [],
      legacyIdentityByName,
      changesByPlay: [],
      unchangedPlayCount: safeArray(diagrams).length,
      manualReviewCount: 0,
      changeOccurrenceCount: 0,
      mappings: [],
      message: 'No hay XI titular definido para adaptar las jugadas.',
    };
  }

  const unchangedParticipantIds = new Set([...participantIds].filter((jugadorId) => effectiveCurrentIds.has(jugadorId)));
  const outgoingIds = [...participantIds].filter((jugadorId) => !effectiveCurrentIds.has(jugadorId));
  const candidateSlots = effectiveCurrentSlots.filter((slot) => {
    const key = idKey(slot.jugadorId);
    if (unchangedParticipantIds.has(key)) return false;
    return sourceLineupReliable ? !sourceIds.has(key) : true;
  });
  const candidatesById = new Map(candidateSlots.map((slot) => [idKey(slot.jugadorId), slot]));
  const usedCandidateIds = new Set();
  const substitutionMap = {};
  const methodByOldId = {};
  const unresolvedReasons = {};
  const systemsMatch = Boolean(sourceSystem && currentSystem && sourceSystem === currentSystem);

  const assignClaims = (claims, method) => {
    const claimantsByCandidate = new Map();
    claims.forEach(({ oldId, candidates }) => {
      if (candidates.length !== 1) return;
      const candidateId = idKey(candidates[0].jugadorId);
      const claimants = claimantsByCandidate.get(candidateId) || [];
      claimants.push(oldId);
      claimantsByCandidate.set(candidateId, claimants);
    });
    claims.forEach(({ oldId, candidates, ambiguousReason }) => {
      if (substitutionMap[oldId] || unresolvedReasons[oldId]) return;
      if (candidates.length > 1) {
        unresolvedReasons[oldId] = ambiguousReason;
        return;
      }
      if (candidates.length !== 1) return;
      const candidate = candidates[0];
      const candidateId = idKey(candidate.jugadorId);
      if ((claimantsByCandidate.get(candidateId) || []).length !== 1 || usedCandidateIds.has(candidateId)) {
        unresolvedReasons[oldId] = 'conflicting_candidate';
        return;
      }
      substitutionMap[oldId] = candidate.jugadorId;
      methodByOldId[oldId] = method;
      usedCandidateIds.add(candidateId);
    });
  };

  if (systemsMatch) {
    const claims = outgoingIds.map((oldId) => {
      const sourceSlot = sourceSlotByPlayerId.get(oldId);
      const currentOccupant = sourceSlot ? effectiveCurrentSlots.find((slot) => slot.slot === sourceSlot.slot && idKey(slot.jugadorId) !== oldId) : null;
      const candidate = currentOccupant && candidatesById.has(idKey(currentOccupant.jugadorId)) ? currentOccupant : null;
      return { oldId, candidates: candidate && !usedCandidateIds.has(idKey(candidate.jugadorId)) ? [candidate] : [], ambiguousReason: 'conflicting_candidate' };
    });
    assignClaims(claims, 'same_slot');
  }

  const buildPositionClaims = (kind) => outgoingIds
    .filter((oldId) => !substitutionMap[oldId] && !unresolvedReasons[oldId])
    .map((oldId) => {
      const sourceSlot = sourceSlotByPlayerId.get(oldId);
      const tacticalRole = FORMATION_ROLES[sourceSystem]?.[sourceSlot?.slot];
      const targets = getPositionTargets({ player: playersById.get(oldId), tacticalRole });
      const candidates = [...candidatesById.values()].filter((candidate) => {
        const candidateId = idKey(candidate.jugadorId);
        if (usedCandidateIds.has(candidateId)) return false;
        const position = getCandidatePosition(playersById.get(candidateId));
        return kind === 'specific'
          ? targets.specific.size > 0 && intersects(targets.specific, position.specific)
          : targets.natural.size > 0 && intersects(targets.natural, position.natural);
      });
      return { oldId, candidates, ambiguousReason: kind === 'specific' ? 'ambiguous_specific' : 'ambiguous_family' };
    });

  assignClaims(buildPositionClaims('specific'), 'same_specific_position');
  assignClaims(buildPositionClaims('family'), 'same_position_family');

  const remainingOutgoing = outgoingIds.filter((oldId) => !substitutionMap[oldId] && !unresolvedReasons[oldId]);
  const remainingCandidates = [...candidatesById.values()].filter((candidate) => !usedCandidateIds.has(idKey(candidate.jugadorId)));
  if (remainingOutgoing.length === 1 && remainingCandidates.length === 1) {
    const oldId = remainingOutgoing[0];
    substitutionMap[oldId] = remainingCandidates[0].jugadorId;
    methodByOldId[oldId] = 'single_unused_starter';
    usedCandidateIds.add(idKey(remainingCandidates[0].jugadorId));
  }
  outgoingIds.forEach((oldId) => {
    if (!substitutionMap[oldId] && !unresolvedReasons[oldId]) unresolvedReasons[oldId] = 'no_candidate';
  });

  const nameForId = (jugadorId) => {
    const key = idKey(jugadorId);
    return getPlayerDisplayName(playersById.get(key), sourceSlotByPlayerId.get(key)?.playerName || currentSlotByPlayerId.get(key)?.playerName || jugadorId);
  };
  const changesByPlay = safeArray(diagrams).map((diagram, index) => {
    const diagramPlayerIds = new Set(safeArray(diagram?.elements)
      .filter((element) => element?.type === 'player')
      .map((element) => resolveElementPlayerId(element, legacyIdentityByName))
      .filter(Boolean)
      .map(idKey));
    const changes = [...diagramPlayerIds].flatMap((oldId) => substitutionMap[oldId] ? [{
      oldId,
      newId: substitutionMap[oldId],
      oldName: nameForId(oldId),
      newName: nameForId(substitutionMap[oldId]),
      method: methodByOldId[oldId],
    }] : []);
    const manual = [...diagramPlayerIds].flatMap((oldId) => unresolvedReasons[oldId] ? [{
      oldId,
      oldName: nameForId(oldId),
      reason: unresolvedReasons[oldId],
      reasonLabel: getReasonLabel(unresolvedReasons[oldId]),
    }] : []);
    return {
      id: diagram?.id || `${diagram?.tipo || 'abp'}-${diagram?.orden || index + 1}`,
      title: clean(diagram?.titulo) || `Jugada ${diagram?.orden || index + 1}`,
      changes,
      manual,
    };
  });

  return {
    canAdapt: true,
    currentLineupDefined: true,
    sourceLineupReliable,
    systemsMatch,
    substitutionMap,
    unresolvedPlayerIds: Object.keys(unresolvedReasons),
    unresolvedReasons,
    legacyIdentityByName,
    changesByPlay,
    unchangedPlayCount: changesByPlay.filter((play) => !play.changes.length && !play.manual.length).length,
    manualReviewCount: Object.keys(unresolvedReasons).length,
    changeOccurrenceCount: changesByPlay.reduce((total, play) => total + play.changes.length, 0),
    mappings: Object.entries(substitutionMap).map(([oldId, newId]) => ({ oldId, newId, oldName: nameForId(oldId), newName: nameForId(newId), method: methodByOldId[oldId] })),
    message: sourceLineupReliable ? '' : 'El XI de origen no está completo; no se ha inventado ninguna correspondencia de slot ausente.',
  };
};

const clearStoredPlayerIdentity = (element) => {
  const {
    printName,
    shirtName,
    shirt_name,
    shortName,
    short_name,
    abbreviation,
    abreviatura,
    assignment_status,
    ...rest
  } = element;
  return rest;
};

export const applySetPieceLineupAdaptation = (elements = [], adaptation = {}, players = []) => {
  const playersById = buildPlayerIndex(players);
  const substitutionMap = adaptation?.substitutionMap || {};
  const unresolved = new Set(safeArray(adaptation?.unresolvedPlayerIds).map(idKey));
  const legacyIdentityByName = adaptation?.legacyIdentityByName || {};
  return safeArray(elements).map((element) => {
    if (element?.type !== 'player') return { ...element };
    const oldId = idKey(resolveElementPlayerId(element, legacyIdentityByName));
    const replacementId = substitutionMap[oldId];
    if (replacementId) {
      const player = playersById.get(idKey(replacementId));
      const number = clean(player?.number ?? player?.dorsal);
      return {
        ...clearStoredPlayerIdentity(element),
        player_id: replacementId,
        label: number,
        name: '',
      };
    }
    if (oldId && unresolved.has(oldId)) {
      return {
        ...clearStoredPlayerIdentity(element),
        player_id: '',
        label: '',
        name: UNASSIGNED_SET_PIECE_PLAYER_NAME,
        assignment_status: 'unassigned',
      };
    }
    return { ...element };
  });
};
