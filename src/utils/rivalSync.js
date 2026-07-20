import { cleanImportedFieldValue, isEmptyImportedField } from './rivalPlayerImport.js';

export const RIVAL_PLAYER_SYNC_FIELDS = [
  'name',
  'number',
  'position',
  'specificPosition',
  'primaryNaturalPosition',
  'secondaryNaturalPositions',
  'primarySpecificPosition',
  'secondarySpecificPositions',
  'dob',
  'age',
  'height',
  'foot',
  'image',
  'sourceProfileUrl',
  'externalSource',
  'externalPlayerId',
];

export const RIVAL_TEAM_SYNC_FIELDS = ['name', 'stadium', 'system', 'kitColor', 'crest'];

export const RIVAL_PLAYER_MANUAL_FIELDS = [
  'name',
  'number',
  'position',
  'specificPosition',
  'primaryNaturalPosition',
  'secondaryNaturalPositions',
  'primarySpecificPosition',
  'secondarySpecificPositions',
  'dob',
  'age',
  'height',
  'foot',
  'image',
  'captain',
  'isKey',
  'notes',
];

const manualSources = new Set(['manual', 'manual_upload', 'manual_url']);
const fallbackSources = new Set(['fallback', 'placeholder', 'empty']);

const normalizeText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const comparableValue = (value) => {
  if (isEmptyImportedField(value)) return '';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  return String(value).trim();
};

const valuesEqual = (left, right) => comparableValue(left) === comparableValue(right);

export const createFieldSource = (source, updatedAt = new Date().toISOString()) => ({ source, updatedAt });

export const getFieldSource = (fieldSources, field) => {
  const fallbackField = ['primaryNaturalPosition', 'secondaryNaturalPositions'].includes(field)
    ? 'position'
    : ['primarySpecificPosition', 'secondarySpecificPositions'].includes(field)
      ? 'specificPosition'
      : field;
  const entry = fieldSources?.[field] ?? fieldSources?.[fallbackField];
  if (typeof entry === 'string') return entry;
  return entry?.source || '';
};

export const isManualField = (fieldSources, field) => manualSources.has(getFieldSource(fieldSources, field));

export const markChangedFieldsManual = ({
  current = {},
  next = {},
  fields = RIVAL_PLAYER_MANUAL_FIELDS,
  fieldSources = current.fieldSources || {},
  updatedAt = new Date().toISOString(),
  sourceByField = {},
}) => fields.reduce((sources, field) => {
  if (valuesEqual(current[field], next[field])) return sources;
  const source = sourceByField[field] || (field === 'image' ? 'manual_url' : 'manual');
  return { ...sources, [field]: createFieldSource(source, updatedAt) };
}, { ...fieldSources });

export const isRealImportedImage = (value) => {
  if (isEmptyImportedField(value)) return false;
  const url = String(value).toLowerCase();
  return !/(default-avatar|default_avatar|no[-_]?image|placeholder|silhouette|avatar[_-]?default|user[_-]?default|kein[-_]?bild|dummy)/i.test(url);
};

const playerStableKey = (player = {}) => {
  if (player.jugadorRivalId || player.id) return `id:${player.jugadorRivalId || player.id}`;
  if (player.externalSource && player.externalPlayerId) return `external:${player.externalSource}:${player.externalPlayerId}`;
  if (player.sourceProfileUrl) return `url:${String(player.sourceProfileUrl).trim().toLowerCase()}`;
  return `name:${normalizeText(player.name)}:${player.dob || player.number || ''}`;
};

const uniqueCandidate = (candidates) => candidates.length === 1 ? candidates[0] : null;

export const matchImportedPlayer = (incoming, currentPlayers = [], excludedIndexes = new Set()) => {
  const candidates = currentPlayers
    .map((player, index) => ({ player, index }))
    .filter(({ index }) => !excludedIndexes.has(index));
  const exact = (predicate, reason) => {
    const matches = candidates.filter(({ player }) => predicate(player));
    return matches.length === 1
      ? { ...matches[0], reason, ambiguous: false }
      : matches.length > 1
        ? { candidates: matches, reason, ambiguous: true }
        : null;
  };

  if (incoming.externalSource && incoming.externalPlayerId) {
    const external = exact(
      (player) => normalizeText(player.externalSource) === normalizeText(incoming.externalSource)
        && String(player.externalPlayerId || '') === String(incoming.externalPlayerId),
      'external_id'
    );
    if (external) return external;
  }
  if (incoming.sourceProfileUrl) {
    const profileUrl = String(incoming.sourceProfileUrl).trim().toLowerCase();
    const profile = exact((player) => String(player.sourceProfileUrl || '').trim().toLowerCase() === profileUrl, 'profile_url');
    if (profile) return profile;
  }

  const name = normalizeText(incoming.name);
  if (name && incoming.dob) {
    const dob = exact((player) => normalizeText(player.name) === name && String(player.dob || '') === String(incoming.dob), 'name_dob');
    if (dob) return dob;
  }
  if (name && !isEmptyImportedField(incoming.number)) {
    const number = exact(
      (player) => normalizeText(player.name) === name && String(player.number || '') === String(incoming.number),
      'name_number'
    );
    if (number) return number;
  }

  const sameName = candidates.filter(({ player }) => normalizeText(player.name) === name);
  if (sameName.length) return { candidates: sameName, reason: 'name_only', ambiguous: true };
  return null;
};

export const resolveFieldConflict = ({
  currentValue,
  incomingValue,
  currentSource = '',
  resolution = 'existing',
}) => {
  if (isEmptyImportedField(incomingValue)) return currentValue;
  if (isEmptyImportedField(currentValue) || fallbackSources.has(currentSource)) return incomingValue;
  return resolution === 'incoming' ? incomingValue : currentValue;
};

export const buildFieldSyncPlan = ({
  current = {},
  incoming = {},
  fields,
  source = 'imported',
  entityKey = 'team',
  updatedAt = new Date().toISOString(),
}) => {
  const autoChanges = [];
  const conflicts = [];
  const next = { ...current, fieldSources: { ...(current.fieldSources || {}) } };
  fields.forEach((field) => {
    const incomingValue = cleanImportedFieldValue(incoming[field], '');
    if (field === 'image' || field === 'crest') {
      if (incomingValue && !isRealImportedImage(incomingValue)) return;
    }
    if (isEmptyImportedField(incomingValue)) return;
    const currentValue = current[field];
    const currentSource = getFieldSource(current.fieldSources, field);
    if (isEmptyImportedField(currentValue) || fallbackSources.has(currentSource)) {
      next[field] = incomingValue;
      next.fieldSources[field] = createFieldSource(source, updatedAt);
      if (field === 'image') next.imageSource = source;
      autoChanges.push({ entityKey, field, currentValue, incomingValue, currentSource, proposedResolution: 'incoming' });
      return;
    }
    if (valuesEqual(currentValue, incomingValue)) return;
    conflicts.push({
      entityKey,
      field,
      currentValue,
      incomingValue,
      currentSource,
      category: !currentSource || manualSources.has(currentSource) ? 'manual' : 'imported',
      proposedResolution: 'existing',
    });
  });
  return { entityKey, current, incoming, next, autoChanges, conflicts, source, updatedAt };
};

export const applyFieldSyncPlan = (plan, resolutions = {}) => {
  const next = { ...(plan?.next || plan?.current || {}), fieldSources: { ...(plan?.next?.fieldSources || plan?.current?.fieldSources || {}) } };
  (plan?.conflicts || []).forEach((change) => {
    const resolution = resolutions?.[change.field] || change.proposedResolution || 'existing';
    if (resolution === 'secondary' && change.field === 'primaryNaturalPosition') {
      next.secondaryNaturalPositions = Array.from(new Set([...(next.secondaryNaturalPositions || []), change.incomingValue])).filter((key) => key && key !== next.primaryNaturalPosition);
      return;
    }
    if (resolution === 'secondary' && change.field === 'primarySpecificPosition') {
      next.secondarySpecificPositions = Array.from(new Set([...(next.secondarySpecificPositions || []), change.incomingValue])).filter((key) => key && key !== next.primarySpecificPosition);
      return;
    }
    next[change.field] = resolveFieldConflict({
      currentValue: change.currentValue,
      incomingValue: change.incomingValue,
      currentSource: change.currentSource,
      resolution,
    });
    if (resolution === 'incoming') next.fieldSources[change.field] = createFieldSource(plan.source, plan.updatedAt);
    if (resolution === 'incoming' && change.field === 'image') next.imageSource = plan.source;
  });
  return next;
};

export const buildRivalSyncPlan = ({
  currentPlayers = [],
  importedPlayers = [],
  source = 'imported',
  updatedAt = new Date().toISOString(),
  fields = RIVAL_PLAYER_SYNC_FIELDS,
} = {}) => {
  const current = currentPlayers.map((player) => ({ ...player, fieldSources: { ...(player.fieldSources || {}) } }));
  const imported = importedPlayers.filter((player) => !isEmptyImportedField(player?.name));
  const usedIndexes = new Set();
  const nextPlayers = current.map((player) => ({ ...player, fieldSources: { ...player.fieldSources } }));
  const newPlayers = [];
  const updatedPlayers = [];
  const unchangedPlayers = [];
  const missingPlayers = [];
  const conflicts = [];
  const ambiguousMatches = [];
  const autoCompletedFields = [];

  imported.forEach((incoming) => {
    const match = matchImportedPlayer(incoming, current, usedIndexes);
    if (match?.ambiguous) {
      ambiguousMatches.push({ incoming, reason: match.reason, candidates: match.candidates.map(({ player }) => player) });
      return;
    }
    if (!match) {
      const fieldSources = fields.reduce((sources, field) => {
        const value = incoming[field];
        if (isEmptyImportedField(value) || ((field === 'image' || field === 'crest') && !isRealImportedImage(value))) return sources;
        return { ...sources, [field]: createFieldSource(source, updatedAt) };
      }, {});
      const player = fields.reduce((result, field) => {
        const value = incoming[field];
        if (isEmptyImportedField(value) || (field === 'image' && !isRealImportedImage(value))) return result;
        return { ...result, [field]: value };
      }, { activeInSquad: true, fieldSources });
      if (player.image) player.imageSource = source;
      newPlayers.push(player);
      nextPlayers.push(player);
      return;
    }

    usedIndexes.add(match.index);
    const entityKey = playerStableKey(match.player);
    const fieldPlan = buildFieldSyncPlan({ current: match.player, incoming, fields, source, entityKey, updatedAt });
    nextPlayers[match.index] = fieldPlan.next;
    if (fieldPlan.autoChanges.length) {
      autoCompletedFields.push(...fieldPlan.autoChanges.map((change) => ({ ...change, playerId: match.player.jugadorRivalId || match.player.id, playerName: match.player.name })));
      updatedPlayers.push({
        playerKey: entityKey,
        player: match.player,
        incoming,
        changes: fieldPlan.autoChanges.map((change) => ({
          field: change.field,
          from: change.currentValue,
          to: change.incomingValue,
          currentSource: change.currentSource,
        })),
      });
    }
    if (fieldPlan.conflicts.length) {
      conflicts.push({
        playerKey: entityKey,
        player: match.player,
        incoming,
        changes: fieldPlan.conflicts.map((change) => ({
          field: change.field,
          from: change.currentValue,
          to: change.incomingValue,
          currentSource: change.currentSource,
          category: change.category,
          proposedResolution: change.proposedResolution,
        })),
      });
    }
    if (!fieldPlan.autoChanges.length && !fieldPlan.conflicts.length) unchangedPlayers.push(match.player);
  });

  current.forEach((player, index) => {
    if (!usedIndexes.has(index) && player.activeInSquad !== false) missingPlayers.push(player);
  });

  return {
    source,
    updatedAt,
    analyzedPlayers: imported.length,
    newPlayers,
    updatedPlayers,
    updates: updatedPlayers,
    unchangedPlayers,
    missingPlayers,
    conflicts,
    ambiguousMatches,
    autoCompletedFields,
    nextPlayers,
    nextSquad: nextPlayers,
  };
};

export const applyRivalSyncPlan = (plan, { conflictResolutions = {}, missingResolutions = {} } = {}) => {
  const players = (plan?.nextPlayers || []).map((player) => ({ ...player, fieldSources: { ...(player.fieldSources || {}) } }));
  (plan?.conflicts || []).forEach((conflict) => {
    const index = players.findIndex((player) => playerStableKey(player) === conflict.playerKey);
    if (index < 0) return;
    conflict.changes.forEach((change) => {
      const resolution = conflictResolutions?.[conflict.playerKey]?.[change.field] || change.proposedResolution || 'existing';
      players[index][change.field] = resolveFieldConflict({
        currentValue: change.from,
        incomingValue: change.to,
        currentSource: change.currentSource,
        resolution,
      });
      if (resolution === 'incoming') players[index].fieldSources[change.field] = createFieldSource(plan.source, plan.updatedAt);
      if (resolution === 'incoming' && change.field === 'image') players[index].imageSource = plan.source;
    });
  });
  (plan?.missingPlayers || []).forEach((missing) => {
    if (missingResolutions?.[playerStableKey(missing)] !== 'inactive') return;
    const index = players.findIndex((player) => playerStableKey(player) === playerStableKey(missing));
    if (index >= 0) players[index].activeInSquad = false;
  });
  return players;
};

export const getRivalSyncPlayerKey = playerStableKey;
