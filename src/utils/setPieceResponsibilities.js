const defensive = [
  ['def_palo', 'Palo', 'PAL', false],
  ['def_zona_1', 'Zona 1', 'Z1', false],
  ['def_zona_2', 'Zona 2', 'Z2', false],
  ['def_zona_3', 'Zona 3', 'Z3', false],
  ['def_zona_4', 'Zona 4', 'Z4', false],
  ['def_zona_5', 'Zona 5', 'Z5', false],
  ['def_rechace_1', 'Rechace 1', 'R1', false],
  ['def_rechace_2', 'Rechace 2', 'R2', false],
  ['def_marca', 'Marca', 'MAR', true],
];

const offensive = [
  ['off_lanzador_1', 'Lanzador 1', 'L1', false],
  ['off_lanzador_2', 'Lanzador 2', 'L2', false],
  ['off_rechace_1', 'Rechace 1', 'R1', false],
  ['off_rechace_2', 'Rechace 2', 'R2', false],
  ['off_rematador_1', 'Rematador 1', 'REM1', false],
  ['off_rematador_2', 'Rematador 2', 'REM2', false],
  ['off_rematador_3', 'Rematador 3', 'REM3', false],
  ['off_rematador_4', 'Rematador 4', 'REM4', false],
  ['off_bloqueo', 'Bloqueo', 'BLQ', true],
  ['off_arrastre', 'Arrastre', 'ARR', true],
  ['off_se_queda', 'Se queda', 'Q', false],
];

const definePhase = (entries, phase) => Object.freeze(entries.map(([id, label, abbreviation, allowMultiplePlayers], index) => Object.freeze({
  id,
  phase,
  label,
  abbreviation,
  order: index + 1,
  allowMultiplePlayers,
})));

export const SET_PIECE_RESPONSIBILITIES = Object.freeze({
  defensive: definePhase(defensive, 'defensive'),
  offensive: definePhase(offensive, 'offensive'),
});

const byId = new Map(Object.values(SET_PIECE_RESPONSIBILITIES).flat().map((item) => [item.id, item]));
const clean = (value) => String(value ?? '').trim();
const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

export const getSetPieceResponsibilitiesForPhase = (phase) => SET_PIECE_RESPONSIBILITIES[phase] || [];
export const getSetPieceResponsibility = (responsibilityId) => byId.get(clean(responsibilityId)) || null;
export const isValidSetPieceResponsibilityId = (responsibilityId, phase) => {
  const definition = getSetPieceResponsibility(responsibilityId);
  return Boolean(definition && (!phase || definition.phase === phase));
};
export const allowsMultipleSetPiecePlayers = (responsibilityId) => Boolean(getSetPieceResponsibility(responsibilityId)?.allowMultiplePlayers);
export const getSetPieceResponsibilityPhase = (setPieceType) => ({
  defensive_set_piece: 'defensive',
  offensive_set_piece: 'offensive',
})[setPieceType] || null;

// Preserve stored IDs, including unknown or wrong-phase IDs, so loading cannot silently erase data.
// Phase-aware readers and validators decide whether an entry may be consumed.
export const normalizeSetPieceResponsibilities = (source) => Object.fromEntries(
  Object.entries(asObject(source))
    .filter(([playerId, entry]) => clean(playerId) && entry && typeof entry === 'object' && !Array.isArray(entry))
    .map(([playerId, entry]) => [clean(playerId), {
      responsibilityId: clean(entry.responsibilityId),
      positionKey: clean(entry.positionKey),
    }])
);

export const getValidSetPieceResponsibilities = (source, phase) => Object.fromEntries(
  Object.entries(normalizeSetPieceResponsibilities(source))
    .filter(([, entry]) => Boolean(getSetPieceResponsibility(entry.responsibilityId)?.phase === phase))
);

export const findSetPieceResponsibilityConflict = (source, playerId, responsibilityId) => {
  const definition = getSetPieceResponsibility(responsibilityId);
  if (!definition || definition.allowMultiplePlayers) return null;
  return Object.entries(normalizeSetPieceResponsibilities(source)).find(([assignedPlayerId, entry]) => (
    assignedPlayerId !== clean(playerId) && entry.responsibilityId === definition.id
  ))?.[0] || null;
};

export const assignSetPieceResponsibility = (source, { playerId, positionKey, responsibilityId, phase } = {}) => {
  const responsibilities = normalizeSetPieceResponsibilities(source);
  const normalizedPlayerId = clean(playerId);
  const normalizedPositionKey = clean(positionKey);
  const definition = getSetPieceResponsibility(responsibilityId);
  if (!normalizedPlayerId || !/^caudal:(?:[0-9]|10)$/.test(normalizedPositionKey)) {
    return { ok: false, errorCode: 'INVALID_PLAYER_POSITION', responsibilities };
  }
  if (!definition || definition.phase !== phase) {
    return { ok: false, errorCode: 'INVALID_RESPONSIBILITY_FOR_PHASE', responsibilities };
  }
  const conflictingPlayerId = findSetPieceResponsibilityConflict(responsibilities, normalizedPlayerId, definition.id);
  if (conflictingPlayerId) {
    return { ok: false, errorCode: 'RESPONSIBILITY_ALREADY_ASSIGNED', conflictingPlayerId, responsibilities };
  }
  return {
    ok: true,
    responsibilities: {
      ...responsibilities,
      [normalizedPlayerId]: { responsibilityId: definition.id, positionKey: normalizedPositionKey },
    },
  };
};

export const removeSetPieceResponsibility = (source, playerId) => {
  const responsibilities = normalizeSetPieceResponsibilities(source);
  delete responsibilities[clean(playerId)];
  return responsibilities;
};

export const inspectSetPieceResponsibilities = (source, phase, currentPlayerIdByPositionKey = null) => {
  const occupied = asObject(currentPlayerIdByPositionKey);
  const hasLineup = currentPlayerIdByPositionKey !== null;
  const seenUnique = new Map();
  return Object.entries(normalizeSetPieceResponsibilities(source)).map(([playerId, entry]) => {
    const definition = getSetPieceResponsibility(entry.responsibilityId);
    const validForPhase = Boolean(definition && definition.phase === phase);
    const conflictingPlayerId = validForPhase && !definition.allowMultiplePlayers
      ? seenUnique.get(definition.id) || null
      : null;
    if (validForPhase && !definition.allowMultiplePlayers && !conflictingPlayerId) {
      seenUnique.set(definition.id, playerId);
    }
    const currentPlayerId = hasLineup ? clean(occupied[entry.positionKey]) : null;
    return {
      playerId,
      ...entry,
      validForPhase,
      conflictingPlayerId,
      currentPlayerId,
      needsReview: hasLineup && currentPlayerId !== playerId,
    };
  });
};
