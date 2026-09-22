import { hasFormationSlotsForSavedLineup } from './formationSlotCoordinates.js';
import {
  buildAutomaticSubstitutionSnapshot,
  buildKnownOnFieldPlayers,
  getTacticalSubstitutionsAtMinute,
} from './tacticalDispositionEditor.js';
import {
  buildMatchPlayerIdentityRecordsFromStats,
  createMatchPlayerIdentityIndex,
  getMatchPlayerIdentityKey,
  inspectMatchPlayerIdentity,
  resolveMatchPlayerCandidate,
} from './matchPlayerIdentity.js';

const clean = (value) => String(value ?? '').trim();
const rows = (value) => Array.isArray(value) ? value : [];

export const parseTacticalMinute = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const base = Number(String(value).trim().split('+')[0].replace(/[^\d.-]/g, ''));
  return Number.isFinite(base) ? Math.max(0, Math.min(130, base)) : null;
};

export const normalizeTacticalSnapshot = (snapshot = {}) => ({
  id: snapshot.id || '',
  matchId: snapshot.partido_id || snapshot.partidoId || snapshot.matchId || '',
  minute: parseTacticalMinute(snapshot.minute) ?? 0,
  period: snapshot.period || '',
  system: clean(snapshot.system),
  reason: snapshot.reason || '',
  isComplete: snapshot.is_complete ?? snapshot.isComplete ?? true,
  sourceSystemEventId: snapshot.source_system_event_id || snapshot.sourceSystemEventId || '',
  source: snapshot.source || 'persisted',
  persistedIsComplete: snapshot.persistedIsComplete ?? snapshot.is_complete ?? snapshot.isComplete ?? true,
  structuralComplete: snapshot.structuralComplete ?? null,
  temporallyConsistent: snapshot.temporallyConsistent ?? null,
  derivedTemporalRepair: Boolean(snapshot.derivedTemporalRepair),
  derivedTemporalRepairs: rows(snapshot.derivedTemporalRepairs),
  snapshotAudit: snapshot.snapshotAudit || null,
  rawSnapshotAudit: snapshot.rawSnapshotAudit || null,
  slots: rows(snapshot.slots).flatMap((slot) => {
    const slotIndex = Number(slot.slot);
    const playerName = clean(slot.player_name_snapshot || slot.playerNameSnapshot || slot.player_name || slot.playerName);
    const playerId = clean(slot.jugador_id || slot.jugadorId || slot.playerId);
    return Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex <= 10 && (playerId || playerName)
      ? [{
        slot: slotIndex,
        playerId,
        playerName,
        position: clean(slot.position || slot.tactical_position || slot.tacticalPosition || slot.role),
      }]
      : [];
  }),
});

export const buildInitialTacticalSnapshot = ({ matchId = '', system = '', slots = [] } = {}) => {
  const normalizedSlots = normalizeTacticalSnapshot({ slots }).slots;
  const uniquePlayers = new Set(normalizedSlots.map(playerKey));
  const uniqueSlots = new Set(normalizedSlots.map((slot) => slot.slot));
  return normalizeTacticalSnapshot({
    id: `virtual-initial-${matchId}`,
    matchId,
    minute: 0,
    system,
    reason: 'Alineación inicial real',
    isComplete: normalizedSlots.length === 11 && uniquePlayers.size === 11 && uniqueSlots.size === 11,
    source: 'virtual_initial',
    slots: normalizedSlots,
  });
};

const getSystemEventMinute = (event) => parseTacticalMinute(event?.minute);
const getSystemEventTarget = (event) => clean(event?.toSystem || event?.to_system);

export const getHistoricalSubstitutionMinutes = (playerStats = {}) => Array.from(new Set(
  Object.values(playerStats || {}).flatMap((player) => {
    const minute = parseTacticalMinute(player?.minutes);
    const replacement = clean(player?.replacementName || player?.replacement_name);
    return replacement && minute !== null && minute > 0 && minute < 130 ? [minute] : [];
  })
)).sort((left, right) => left - right);

const duplicateValues = (values = []) => Array.from(new Set(values.filter((value, index) => values.indexOf(value) !== index)));

const getActiveSystemAtMinute = ({ initialSystem = '', systemEvents = [], minute = 0 } = {}) => rows(systemEvents)
  .map((event) => ({ minute: getSystemEventMinute(event), system: getSystemEventTarget(event) }))
  .filter((event) => event.minute !== null && event.minute <= Number(minute) && event.system)
  .sort((left, right) => left.minute - right.minute)
  .reduce((system, event) => event.system || system, clean(initialSystem));

const getIdentityConflict = (slot, identityIndex) => {
  const inspected = inspectMatchPlayerIdentity(slot, identityIndex);
  return inspected.ambiguousIds || inspected.nameConflict
    ? { slot: Number(slot.slot), playerId: inspected.rawIds[0] || '', playerName: slot.playerName || '' }
    : null;
};

const auditNormalizedSnapshot = ({ snapshot, system, expectedPlayers, expectedValid, identityIndex }) => {
  const slotIndexes = snapshot.slots.map((slot) => Number(slot.slot));
  const validSlotIndexes = slotIndexes.filter((slot) => Number.isInteger(slot) && slot >= 0 && slot <= 10);
  const playerKeys = snapshot.slots.map((slot) => getMatchPlayerIdentityKey(slot, identityIndex)).filter(Boolean);
  const duplicateSlots = duplicateValues(validSlotIndexes);
  const duplicatePlayers = duplicateValues(playerKeys);
  const identityConflicts = snapshot.slots.map((slot) => getIdentityConflict(slot, identityIndex)).filter(Boolean);
  const systemMismatch = Boolean(snapshot.system && system && clean(snapshot.system) !== clean(system));
  const declaredComplete = Boolean(snapshot.isComplete);
  const structuralComplete = Boolean(
    hasFormationSlotsForSavedLineup(system)
    && !systemMismatch
    && snapshot.slots.length === 11
    && validSlotIndexes.length === 11
    && new Set(validSlotIndexes).size === 11
    && playerKeys.length === 11
    && new Set(playerKeys).size === 11
    && !identityConflicts.length
  );
  const usedSlots = new Set();
  const missingExpectedPlayers = [];
  const comparisonConflicts = [];
  if (expectedValid) {
    expectedPlayers.forEach((expectedPlayer) => {
      const available = snapshot.slots.filter((_, index) => !usedSlots.has(index));
      const resolution = resolveMatchPlayerCandidate({ reference: expectedPlayer, candidates: available, identityIndex });
      if (resolution.status === 'resolved') {
        usedSlots.add(snapshot.slots.indexOf(resolution.candidate));
        return;
      }
      missingExpectedPlayers.push(expectedPlayer);
      if (resolution.status === 'identity_conflict' || resolution.status === 'ambiguous') {
        const alreadyReportedBySlot = resolution.status === 'identity_conflict'
          && resolution.conflicts.some((candidate) => identityConflicts.some((conflict) => Number(conflict.slot) === Number(candidate?.slot)));
        if (!alreadyReportedBySlot) comparisonConflicts.push({ expectedPlayer, status: resolution.status, candidates: resolution.conflicts });
      }
    });
  }
  const unexpectedPlayers = expectedValid
    ? snapshot.slots.filter((_, index) => !usedSlots.has(index))
    : [];
  const allIdentityConflicts = [...identityConflicts, ...comparisonConflicts];
  const temporallyConsistent = expectedValid
    ? structuralComplete && !missingExpectedPlayers.length && !unexpectedPlayers.length && !allIdentityConflicts.length
    : null;
  return {
    snapshotId: snapshot.id,
    minute: snapshot.minute,
    system,
    source: snapshot.source,
    declaredComplete,
    systemMismatch,
    structuralComplete,
    temporalAuditAvailable: expectedValid,
    temporallyConsistent,
    missingExpectedPlayers,
    unexpectedPlayers,
    identityConflicts: allIdentityConflicts,
    duplicateSlots,
    duplicatePlayers,
    slotCount: snapshot.slots.length,
    uniqueSlotCount: new Set(validSlotIndexes).size,
    uniquePlayerCount: new Set(playerKeys).size,
  };
};

const tryRepairHistoricalSubstitutionSnapshot = ({
  snapshot,
  audit,
  playerStats,
  identityIndex,
  hasSameMinuteSystemChange,
}) => {
  if (!audit.structuralComplete || audit.temporallyConsistent !== false || hasSameMinuteSystemChange) return null;
  const substitutions = getTacticalSubstitutionsAtMinute({ playerStats, minute: snapshot.minute });
  if (!substitutions.length) return null;
  const nextSlots = snapshot.slots.map((slot) => ({ ...slot }));
  const repairs = [];
  for (const substitution of substitutions) {
    const outgoing = resolveMatchPlayerCandidate({ reference: substitution.outPlayer, candidates: nextSlots, identityIndex });
    const incoming = resolveMatchPlayerCandidate({ reference: substitution.inPlayer, candidates: nextSlots, identityIndex });
    if (incoming.status === 'resolved') {
      if (outgoing.status === 'missing') continue;
      return null;
    }
    if (outgoing.status !== 'resolved' || incoming.status === 'ambiguous' || incoming.status === 'identity_conflict') return null;
    const slotIndex = nextSlots.indexOf(outgoing.candidate);
    if (slotIndex < 0) return null;
    nextSlots[slotIndex] = {
      ...nextSlots[slotIndex],
      playerId: substitution.inPlayer.playerId,
      playerName: substitution.inPlayer.playerName,
      position: nextSlots[slotIndex].position || '',
    };
    repairs.push({
      slot: nextSlots[slotIndex].slot,
      outPlayer: substitution.outPlayer,
      inPlayer: substitution.inPlayer,
    });
  }
  return repairs.length ? {
    ...snapshot,
    slots: nextSlots,
    derivedTemporalRepair: true,
    derivedTemporalRepairs: repairs,
  } : null;
};

export const auditTacticalMatchSnapshots = ({
  matchId = '',
  initialSystem = '',
  initialSlots = [],
  snapshots = [],
  systemEvents = [],
  substitutionMinutes = [],
  playerStats = {},
  playerIdentities = [],
  repairHistoricalSubstitutions = true,
} = {}) => {
  const normalizedSnapshots = rows(snapshots).map(normalizeTacticalSnapshot);
  const identityIndex = createMatchPlayerIdentityIndex([
    ...rows(playerIdentities),
    ...buildMatchPlayerIdentityRecordsFromStats(playerStats),
    ...rows(initialSlots),
  ]);
  const knownSubstitutionMinutes = getHistoricalSubstitutionMinutes(playerStats);
  const requestedSubstitutionMinutes = rows(substitutionMinutes).map(parseTacticalMinute).filter((minute) => minute !== null);
  const substitutionEvidenceComplete = requestedSubstitutionMinutes.every((minute) => knownSubstitutionMinutes.includes(minute));
  const systemChangeMinutes = new Set(rows(systemEvents).map(getSystemEventMinute).filter((minute) => minute !== null));
  const details = [];
  const analyticsDetails = [];
  const rawSnapshots = [];
  const analyticsSnapshots = [];
  normalizedSnapshots.forEach((snapshot) => {
    const system = getActiveSystemAtMinute({ initialSystem, systemEvents, minute: snapshot.minute }) || snapshot.system;
    const expected = buildKnownOnFieldPlayers({ initialSlots, playerStats, atMinute: snapshot.minute, identityIndex });
    const expectedValid = expected.valid && substitutionEvidenceComplete;
    const rawAudit = auditNormalizedSnapshot({ snapshot, system, expectedPlayers: expected.players, expectedValid, identityIndex });
    const rawReliable = rawAudit.declaredComplete && rawAudit.structuralComplete && rawAudit.temporallyConsistent !== false;
    const rawSnapshot = {
      ...snapshot,
      isComplete: rawReliable,
      persistedIsComplete: rawAudit.declaredComplete,
      structuralComplete: rawAudit.structuralComplete,
      temporallyConsistent: rawAudit.temporallyConsistent,
      snapshotAudit: rawAudit,
    };
    let analyticsAudit = rawAudit;
    let analyticsSnapshot = rawSnapshot;
    const repaired = repairHistoricalSubstitutions
      ? tryRepairHistoricalSubstitutionSnapshot({
        snapshot,
        audit: rawAudit,
        playerStats,
        identityIndex,
        hasSameMinuteSystemChange: systemChangeMinutes.has(snapshot.minute),
      })
      : null;
    if (repaired) {
      const repairedAudit = auditNormalizedSnapshot({ snapshot: repaired, system, expectedPlayers: expected.players, expectedValid, identityIndex });
      if (repairedAudit.structuralComplete && repairedAudit.temporallyConsistent) {
        analyticsAudit = {
          ...repairedAudit,
          repairedInMemory: true,
          repairs: repaired.derivedTemporalRepairs,
          rawTemporallyConsistent: rawAudit.temporallyConsistent,
        };
        analyticsSnapshot = {
          ...repaired,
          isComplete: true,
          persistedIsComplete: rawAudit.declaredComplete,
          structuralComplete: true,
          temporallyConsistent: true,
          snapshotAudit: analyticsAudit,
          rawSnapshotAudit: rawAudit,
        };
      }
    }
    details.push(rawAudit);
    analyticsDetails.push(analyticsAudit);
    rawSnapshots.push(rawSnapshot);
    analyticsSnapshots.push(analyticsSnapshot);
  });
  return {
    matchId,
    totalSnapshots: details.length,
    structurallyCompleteSnapshots: details.filter((detail) => detail.structuralComplete).length,
    temporallyConsistentSnapshots: details.filter((detail) => detail.temporallyConsistent === true).length,
    temporallyInconsistentSnapshots: details.filter((detail) => detail.temporallyConsistent === false).length,
    temporallyUnauditableSnapshots: details.filter((detail) => detail.temporallyConsistent === null).length,
    missingExpectedPlayers: details.flatMap((detail) => detail.missingExpectedPlayers.map((player) => ({ snapshotId: detail.snapshotId, minute: detail.minute, player }))),
    unexpectedPlayers: details.flatMap((detail) => detail.unexpectedPlayers.map((player) => ({ snapshotId: detail.snapshotId, minute: detail.minute, player }))),
    identityConflicts: details.flatMap((detail) => detail.identityConflicts.map((conflict) => ({ snapshotId: detail.snapshotId, minute: detail.minute, conflict }))),
    duplicateSlots: details.flatMap((detail) => detail.duplicateSlots.map((slot) => ({ snapshotId: detail.snapshotId, minute: detail.minute, slot }))),
    duplicatePlayers: details.flatMap((detail) => detail.duplicatePlayers.map((playerKey) => ({ snapshotId: detail.snapshotId, minute: detail.minute, playerKey }))),
    repairedSnapshots: analyticsDetails.filter((detail) => detail.repairedInMemory).length,
    snapshots: rawSnapshots,
    rawSnapshots,
    analyticsSnapshots,
    details,
    analyticsDetails,
    identityIndex,
  };
};

export const auditTacticalSeasonSnapshots = (matches = []) => {
  const matchAudits = rows(matches).map((entry) => {
    const playerStats = entry?.playerStats || entry?.statsPlayerData || {};
    return auditTacticalMatchSnapshots({
      ...entry,
      matchId: entry?.matchId || entry?.id || '',
      initialSystem: entry?.initialSystem || entry?.system || '',
      initialSlots: entry?.initialSlots || entry?.lineupSlots || [],
      snapshots: entry?.snapshots || entry?.tacticalSnapshots || [],
      systemEvents: entry?.systemEvents || entry?.tacticalSystemEvents || [],
      substitutionMinutes: entry?.substitutionMinutes || getHistoricalSubstitutionMinutes(playerStats),
      playerStats,
      playerIdentities: entry?.playerIdentities || entry?.rosterPlayers || [],
    });
  });
  const tag = (audit, field) => rows(audit[field]).map((row) => ({ matchId: audit.matchId, ...row }));
  return {
    matches: matchAudits,
    totalMatches: matchAudits.length,
    totalSnapshots: matchAudits.reduce((sum, audit) => sum + audit.totalSnapshots, 0),
    structurallyCompleteSnapshots: matchAudits.reduce((sum, audit) => sum + audit.structurallyCompleteSnapshots, 0),
    temporallyConsistentSnapshots: matchAudits.reduce((sum, audit) => sum + audit.temporallyConsistentSnapshots, 0),
    temporallyInconsistentSnapshots: matchAudits.reduce((sum, audit) => sum + audit.temporallyInconsistentSnapshots, 0),
    temporallyUnauditableSnapshots: matchAudits.reduce((sum, audit) => sum + audit.temporallyUnauditableSnapshots, 0),
    repairedSnapshots: matchAudits.reduce((sum, audit) => sum + audit.repairedSnapshots, 0),
    missingExpectedPlayers: matchAudits.flatMap((audit) => tag(audit, 'missingExpectedPlayers')),
    unexpectedPlayers: matchAudits.flatMap((audit) => tag(audit, 'unexpectedPlayers')),
    identityConflicts: matchAudits.flatMap((audit) => tag(audit, 'identityConflicts')),
    duplicateSlots: matchAudits.flatMap((audit) => tag(audit, 'duplicateSlots')),
    duplicatePlayers: matchAudits.flatMap((audit) => tag(audit, 'duplicatePlayers')),
  };
};

export const buildTacticalSnapshotIntervals = ({
  duration = 90,
  initialSnapshot = null,
  snapshots = [],
  systemEvents = [],
  substitutionMinutes = [],
  initialSystem = '',
} = {}) => {
  const matchDuration = Math.max(0, Number(duration) || 90);
  const persisted = rows(snapshots).map(normalizeTacticalSnapshot);
  const candidates = [...persisted];
  if (initialSnapshot && !persisted.some((snapshot) => snapshot.minute === 0)) {
    candidates.push(normalizeTacticalSnapshot(initialSnapshot));
  }
  rows(systemEvents).forEach((event) => {
    const minute = getSystemEventMinute(event);
    const system = getSystemEventTarget(event);
    if (minute === null || !system || minute > matchDuration || persisted.some((snapshot) => snapshot.minute === minute)) return;
    candidates.push(normalizeTacticalSnapshot({
      id: `missing-system-${event.id || minute}`,
      minute,
      period: event.period || event.half || '',
      system,
      reason: 'Cambio de sistema sin snapshot posicional',
      isComplete: false,
      sourceSystemEventId: event.id || '',
      source: 'missing_system_snapshot',
      slots: [],
    }));
  });
  rows(substitutionMinutes).forEach((value) => {
    const minute = parseTacticalMinute(value);
    if (minute === null || minute <= 0 || minute > matchDuration || candidates.some((snapshot) => snapshot.minute === minute)) return;
    candidates.push(normalizeTacticalSnapshot({
      id: `missing-substitution-${minute}`,
      minute,
      system: '',
      reason: 'Sustitución sin snapshot posicional',
      isComplete: false,
      source: 'missing_substitution_snapshot',
      slots: [],
    }));
  });
  if (!candidates.some((snapshot) => snapshot.minute === 0)) {
    candidates.push(normalizeTacticalSnapshot({
      id: 'missing-initial',
      minute: 0,
      system: initialSystem,
      reason: 'Sin alineación inicial registrada',
      isComplete: false,
      source: 'missing_initial_snapshot',
      slots: [],
    }));
  }

  const priority = { persisted: 5, inferred_substitution: 4, virtual_initial: 3, missing_system_snapshot: 2, missing_substitution_snapshot: 1, missing_initial_snapshot: 0 };
  const byMinute = new Map();
  candidates
    .filter((snapshot) => snapshot.minute <= matchDuration)
    .sort((left, right) => left.minute - right.minute || (priority[right.source] || 0) - (priority[left.source] || 0))
    .forEach((snapshot) => {
      const current = byMinute.get(snapshot.minute);
      if (!current || (priority[snapshot.source] || 0) > (priority[current.source] || 0)) byMinute.set(snapshot.minute, snapshot);
    });
  const boundaries = Array.from(byMinute.values()).sort((left, right) => left.minute - right.minute);
  const systemTimeline = rows(systemEvents)
    .map((event) => ({ minute: getSystemEventMinute(event), system: getSystemEventTarget(event) }))
    .filter((event) => event.minute !== null && event.system && event.minute <= matchDuration)
    .sort((left, right) => left.minute - right.minute);
  const hasCanonicalSystemTimeline = systemTimeline.length > 0;
  let systemEventIndex = 0;
  let activeSystem = initialSystem;
  return boundaries.flatMap((snapshot, index) => {
    const fromMinute = Math.max(0, Math.min(matchDuration, snapshot.minute));
    const toMinute = Math.max(fromMinute, Math.min(matchDuration, boundaries[index + 1]?.minute ?? matchDuration));
    while (systemEventIndex < systemTimeline.length && systemTimeline[systemEventIndex].minute <= fromMinute) {
      activeSystem = systemTimeline[systemEventIndex].system || activeSystem;
      systemEventIndex += 1;
    }
    const storedSystem = clean(snapshot.system);
    if (!hasCanonicalSystemTimeline) activeSystem = storedSystem || activeSystem;
    const systemMismatch = Boolean(hasCanonicalSystemTimeline && storedSystem && activeSystem && storedSystem !== activeSystem);
    if (toMinute <= fromMinute) return [];
    const slotKeys = snapshot.slots.map(playerKey).filter(Boolean);
    const slotIndexes = snapshot.slots.map((slot) => Number(slot.slot));
    const hasCompleteDisposition = Boolean(
      snapshot.isComplete
      && !systemMismatch
      && hasFormationSlotsForSavedLineup(activeSystem)
      && snapshot.slots.length === 11
      && slotIndexes.every((slot) => Number.isInteger(slot) && slot >= 0 && slot <= 10)
      && new Set(slotIndexes).size === 11
      && new Set(slotKeys).size === 11
    );
    return [{
      id: snapshot.id || `${snapshot.matchId}-${fromMinute}`,
      matchId: snapshot.matchId || initialSnapshot?.matchId || '',
      fromMinute,
      toMinute,
      minutes: toMinute - fromMinute,
      period: snapshot.period || '',
      system: activeSystem,
      reason: systemMismatch ? 'El sistema guardado en el snapshot requiere revisión tras editar la cronología.' : snapshot.reason,
      isComplete: hasCompleteDisposition,
      systemMismatch,
      sourceSystemEventId: snapshot.sourceSystemEventId || '',
      source: snapshot.source,
      slots: snapshot.slots,
      structuralComplete: snapshot.structuralComplete ?? hasCompleteDisposition,
      temporallyConsistent: snapshot.temporallyConsistent ?? null,
      derivedTemporalRepair: Boolean(snapshot.derivedTemporalRepair),
      derivedTemporalRepairs: rows(snapshot.derivedTemporalRepairs),
      snapshotAudit: snapshot.snapshotAudit || null,
      rawSnapshotAudit: snapshot.rawSnapshotAudit || null,
    }];
  });
};

const getCoverageIssueType = (interval = {}) => {
  if (interval.source === 'missing_substitution_snapshot') return 'substitution_without_snapshot';
  if (interval.source === 'missing_system_snapshot') return 'system_change_without_snapshot';
  if (interval.source === 'missing_initial_snapshot') return 'missing_initial_snapshot';
  if (interval.source === 'persisted') return 'incomplete_persisted_snapshot';
  return 'incomplete_disposition';
};

export const buildSeasonTacticalCoverageAudit = (matches = []) => {
  const auditedMatches = rows(matches).map((entry) => {
    const history = entry.history || {};
    const intervals = rows(history.intervals);
    const duration = Number(history.invariant?.duration || entry.duration || 90);
    const completeMinutes = intervals
      .filter((interval) => interval.isComplete)
      .reduce((sum, interval) => sum + Number(interval.minutes || 0), 0);
    const pendingIntervals = intervals.filter((interval) => !interval.isComplete).map((interval) => {
      const affectedPlayers = rows(entry.affectedPlayersByMinute?.[interval.fromMinute])
        .map((player) => clean(player.playerName || player.name))
        .filter(Boolean);
      return {
        fromMinute: interval.fromMinute,
        toMinute: interval.toMinute,
        minutes: interval.minutes,
        system: interval.system || '',
        issueType: getCoverageIssueType(interval),
        source: interval.source || '',
        missingSlots: Math.max(0, 11 - rows(interval.slots).length),
        affectedPlayers,
      };
    });
    return {
      matchId: entry.matchId || entry.id || '',
      label: entry.label || '',
      date: entry.date || '',
      duration,
      completeMinutes,
      pendingIntervals,
      overlap: Boolean(history.invariant?.overlap),
      coveredMinutes: Number(history.invariant?.coveredMinutes || 0),
      hasGap: Number(history.invariant?.coveredMinutes || 0) !== duration,
      complete: completeMinutes === duration && !pendingIntervals.length && !history.invariant?.overlap,
    };
  });
  const totalMinutes = auditedMatches.reduce((sum, match) => sum + match.duration, 0);
  const completeMinutes = auditedMatches.reduce((sum, match) => sum + match.completeMinutes, 0);
  const pendingIntervals = auditedMatches.reduce((sum, match) => sum + match.pendingIntervals.length, 0);
  return {
    matches: auditedMatches,
    totalMatches: auditedMatches.length,
    completeMatches: auditedMatches.filter((match) => match.complete).length,
    totalMinutes,
    completeMinutes,
    pendingIntervals,
    percentage: totalMinutes ? Math.round((completeMinutes / totalMinutes) * 100) : 0,
    complete: Boolean(auditedMatches.length) && auditedMatches.every((match) => match.complete),
  };
};

export const buildTacticalSystemSegments = (intervals = []) => {
  const ordered = rows(intervals)
    .filter((interval) => interval && interval.toMinute > interval.fromMinute && clean(interval.system))
    .slice()
    .sort((left, right) => left.fromMinute - right.fromMinute || left.toMinute - right.toMinute);
  return ordered.reduce((segments, interval) => {
    const previous = segments[segments.length - 1];
    const isContinuation = previous
      && previous.system === interval.system
      && previous.toMinute === interval.fromMinute
      && previous.matchId === interval.matchId;
    if (isContinuation) {
      previous.toMinute = interval.toMinute;
      previous.minutes += interval.minutes;
      previous.completeMinutes += interval.isComplete ? interval.minutes : 0;
      previous.hasIncompleteDisposition ||= !interval.isComplete;
      previous.intervals.push(interval);
      return segments;
    }
    segments.push({
      id: `${interval.matchId || 'match'}-${interval.fromMinute}-${interval.system}`,
      matchId: interval.matchId || '',
      system: interval.system,
      fromMinute: interval.fromMinute,
      toMinute: interval.toMinute,
      minutes: interval.minutes,
      completeMinutes: interval.isComplete ? interval.minutes : 0,
      hasIncompleteDisposition: !interval.isComplete,
      intervals: [interval],
    });
    return segments;
  }, []);
};

export const buildTacticalMatchHistory = ({
  matchId = '',
  duration = 90,
  initialSystem = '',
  initialSlots = [],
  snapshots = [],
  systemEvents = [],
  substitutionMinutes = [],
  playerStats = {},
  playerIdentities = [],
} = {}) => {
  let initialSnapshot = buildInitialTacticalSnapshot({ matchId, system: initialSystem, slots: initialSlots });
  const snapshotAudit = auditTacticalMatchSnapshots({
    matchId,
    initialSystem,
    initialSlots,
    snapshots,
    systemEvents,
    substitutionMinutes,
    playerStats,
    playerIdentities,
  });
  const rawSnapshots = snapshotAudit.rawSnapshots;
  let analyticsSnapshots = [...snapshotAudit.analyticsSnapshots];
  const initialSnapshotAudit = auditTacticalMatchSnapshots({
    matchId,
    initialSystem,
    initialSlots,
    snapshots: [initialSnapshot],
    systemEvents,
    substitutionMinutes,
    playerStats,
    playerIdentities,
    repairHistoricalSubstitutions: false,
  });
  initialSnapshot = initialSnapshotAudit.rawSnapshots[0] || initialSnapshot;
  const analyticsInitialSnapshot = initialSnapshotAudit.analyticsSnapshots[0] || initialSnapshot;
  const identityIndex = createMatchPlayerIdentityIndex([
    ...rows(playerIdentities),
    ...buildMatchPlayerIdentityRecordsFromStats(playerStats),
    ...rows(initialSlots),
  ]);
  const systemChangeMinutes = new Set(rows(systemEvents).map(getSystemEventMinute).filter((minute) => minute !== null));
  rows(substitutionMinutes)
    .map(parseTacticalMinute)
    .filter((minute) => minute !== null && minute > 0 && minute <= Number(duration || 90))
    .sort((left, right) => left - right)
    .forEach((minute) => {
      if (systemChangeMinutes.has(minute) || analyticsSnapshots.some((snapshot) => parseTacticalMinute(snapshot?.minute) === minute)) return;
      const provisionalIntervals = buildTacticalSnapshotIntervals({
        duration,
        initialSnapshot: analyticsInitialSnapshot,
        snapshots: analyticsSnapshots,
        systemEvents,
        substitutionMinutes,
        initialSystem,
      });
      const interval = provisionalIntervals.find((candidate) => Number(candidate.fromMinute) === minute);
      const plan = buildAutomaticSubstitutionSnapshot({
        minute,
        system: interval?.system || initialSystem,
        intervals: provisionalIntervals,
        initialSlots,
        playerStats,
        systemSlotCount: hasFormationSlotsForSavedLineup(interval?.system || initialSystem) ? 11 : 0,
        identityIndex,
      });
      if (plan.status !== 'complete') return;
      analyticsSnapshots.push({
        id: `inferred-substitution-${matchId || 'match'}-${minute}`,
        matchId,
        minute,
        system: plan.system,
        reason: 'Continuidad inequívoca del slot en sustitución sin cambio de sistema',
        isComplete: true,
        source: 'inferred_substitution',
        slots: plan.slots,
      });
    });
  const intervals = buildTacticalSnapshotIntervals({
    duration,
    initialSnapshot,
    snapshots: rawSnapshots,
    systemEvents,
    substitutionMinutes,
    initialSystem,
  }).map((interval) => ({ ...interval, matchId: interval.matchId || matchId }));
  const analyticsIntervals = buildTacticalSnapshotIntervals({
    duration,
    initialSnapshot: analyticsInitialSnapshot,
    snapshots: analyticsSnapshots,
    systemEvents,
    substitutionMinutes,
    initialSystem,
  }).map((interval) => ({ ...interval, matchId: interval.matchId || matchId }));
  return {
    initialSnapshot,
    analyticsInitialSnapshot,
    intervals,
    analyticsIntervals,
    systemSegments: buildTacticalSystemSegments(intervals),
    analyticsSystemSegments: buildTacticalSystemSegments(analyticsIntervals),
    invariant: getTacticalTimelineInvariantReport({ intervals, duration }),
    analyticsInvariant: getTacticalTimelineInvariantReport({ intervals: analyticsIntervals, duration }),
    snapshotAudit,
    initialSnapshotAudit,
  };
};

function playerKey(slot) {
  return clean(slot.playerId) ? `id:${clean(slot.playerId)}` : `name:${clean(slot.playerName).toLowerCase()}`;
}

export const buildTacticalSlotEvidenceFromIntervals = ({ intervals = [], resolveSlot, resolvePlayer } = {}) => rows(intervals).flatMap((interval) => {
  if (!interval?.isComplete || !interval.system || interval.minutes <= 0) return [];
  return rows(interval.slots).flatMap((slotRow) => {
    const tacticalSlot = resolveSlot?.(interval.system, slotRow.slot);
    if (!tacticalSlot?.id) return [];
    const player = resolvePlayer?.(slotRow) || { id: slotRow.playerId || '', name: slotRow.playerName };
    return [{
      matchId: interval.matchId,
      system: interval.system,
      slot: tacticalSlot,
      player,
      playerId: player?.id || slotRow.playerId || '',
      playerName: slotRow.playerName || player?.name || '',
      playerKey: playerKey({ ...slotRow, playerId: player?.id || slotRow.playerId }),
      minutes: interval.minutes,
      minutesKnown: true,
      starts: interval.fromMinute === 0 ? 1 : 0,
      intervalId: interval.id,
    }];
  });
});

export const getTacticalCombinationDefinitions = (slots = []) => {
  const definitions = [];
  const add = (groupName, selected) => {
    if (selected.length >= 2) definitions.push({ groupName, slotIds: selected.map((slot) => slot.id) });
  };
  const centrals = slots.filter((slot) => slot.id.startsWith('DFC'));
  if (centrals.length === 2) add('Pareja de centrales', centrals);
  if (centrals.length === 3) add('Trío de centrales', centrals);
  const midfield = slots.filter((slot) => slot.line === 'medio');
  if (midfield.length === 2) add('Doble pivote', midfield);
  if (midfield.length === 3) add('Trío de centrocampistas', midfield);
  const attackingBand = slots.filter((slot) => slot.line === 'mediapunta');
  const attack = slots.filter((slot) => slot.line === 'ataque');
  if (attackingBand.length === 3) add('Tridente ofensivo', attackingBand);
  else if (attack.length === 3) add('Tridente ofensivo', attack);
  if (attack.length === 2) add('Pareja de delanteros', attack);
  return definitions;
};

export const buildTacticalCombinationsFromIntervals = ({ intervals = [], resolveSlot, getSlotsForSystem } = {}) => {
  const aggregated = new Map();
  rows(intervals).forEach((interval) => {
    if (!interval?.isComplete || !interval.system || interval.minutes <= 0) return;
    const formationSlots = rows(getSlotsForSystem?.(interval.system));
    const playerBySlotId = new Map(rows(interval.slots).flatMap((slotRow) => {
      const slot = resolveSlot?.(interval.system, slotRow.slot);
      return slot?.id ? [[slot.id, { ...slotRow, slot }]] : [];
    }));
    getTacticalCombinationDefinitions(formationSlots).forEach((definition) => {
      const members = definition.slotIds.map((slotId) => playerBySlotId.get(slotId));
      if (members.some((member) => !member)) return;
      const identity = members.map(playerKey);
      if (new Set(identity).size !== identity.length) return;
      const key = `${interval.system}|${definition.groupName}|${identity.join('+')}`;
      const current = aggregated.get(key) || {
        system: interval.system,
        groupName: definition.groupName,
        slotIds: definition.slotIds,
        names: members.map((member) => member.playerName),
        playerIds: members.map((member) => member.playerId || ''),
        minutes: 0,
        matchIds: new Set(),
      };
      current.minutes += interval.minutes;
      if (interval.matchId) current.matchIds.add(interval.matchId);
      aggregated.set(key, current);
    });
  });
  return Array.from(aggregated.values()).map((row) => ({ ...row, matches: row.matchIds.size }));
};

export const getTacticalTimelineInvariantReport = ({ intervals = [], duration = 90 } = {}) => {
  const ordered = rows(intervals).slice().sort((left, right) => left.fromMinute - right.fromMinute);
  const overlap = ordered.some((interval, index) => index > 0 && interval.fromMinute < ordered[index - 1].toMinute);
  const coveredMinutes = ordered.reduce((sum, interval) => sum + Number(interval.minutes || 0), 0);
  return {
    overlap,
    coveredMinutes,
    duration: Number(duration || 90),
    completeMinutes: ordered.filter((interval) => interval.isComplete).reduce((sum, interval) => sum + interval.minutes, 0),
    incompleteMinutes: ordered.filter((interval) => !interval.isComplete).reduce((sum, interval) => sum + interval.minutes, 0),
    valid: !overlap && coveredMinutes <= Number(duration || 90),
  };
};
