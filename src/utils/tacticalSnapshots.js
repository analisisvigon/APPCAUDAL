import { hasFormationSlotsForSavedLineup } from './formationSlotCoordinates.js';

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
  return normalizeTacticalSnapshot({
    id: `virtual-initial-${matchId}`,
    matchId,
    minute: 0,
    system,
    reason: 'Alineación inicial real',
    isComplete: normalizedSlots.length === 11 && uniquePlayers.size === 11,
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

  const priority = { persisted: 4, virtual_initial: 3, missing_system_snapshot: 2, missing_substitution_snapshot: 1, missing_initial_snapshot: 0 };
  const byMinute = new Map();
  candidates
    .filter((snapshot) => snapshot.minute <= matchDuration)
    .sort((left, right) => left.minute - right.minute || (priority[right.source] || 0) - (priority[left.source] || 0))
    .forEach((snapshot) => {
      const current = byMinute.get(snapshot.minute);
      if (!current || (priority[snapshot.source] || 0) > (priority[current.source] || 0)) byMinute.set(snapshot.minute, snapshot);
    });
  const boundaries = Array.from(byMinute.values()).sort((left, right) => left.minute - right.minute);
  let activeSystem = initialSystem;
  return boundaries.flatMap((snapshot, index) => {
    const fromMinute = Math.max(0, Math.min(matchDuration, snapshot.minute));
    const toMinute = Math.max(fromMinute, Math.min(matchDuration, boundaries[index + 1]?.minute ?? matchDuration));
    activeSystem = snapshot.system || activeSystem;
    if (toMinute <= fromMinute) return [];
    const slotKeys = snapshot.slots.map(playerKey).filter(Boolean);
    const hasCompleteDisposition = Boolean(
      snapshot.isComplete
      && hasFormationSlotsForSavedLineup(activeSystem)
      && snapshot.slots.length === 11
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
      reason: snapshot.reason,
      isComplete: hasCompleteDisposition,
      sourceSystemEventId: snapshot.sourceSystemEventId || '',
      source: snapshot.source,
      slots: snapshot.slots,
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
} = {}) => {
  const initialSnapshot = buildInitialTacticalSnapshot({ matchId, system: initialSystem, slots: initialSlots });
  const intervals = buildTacticalSnapshotIntervals({
    duration,
    initialSnapshot,
    snapshots,
    systemEvents,
    substitutionMinutes,
    initialSystem,
  }).map((interval) => ({ ...interval, matchId: interval.matchId || matchId }));
  return {
    initialSnapshot,
    intervals,
    systemSegments: buildTacticalSystemSegments(intervals),
    invariant: getTacticalTimelineInvariantReport({ intervals, duration }),
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
      playerId: slotRow.playerId || player?.id || '',
      playerName: slotRow.playerName || player?.name || '',
      playerKey: playerKey({ ...slotRow, playerId: slotRow.playerId || player?.id }),
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
