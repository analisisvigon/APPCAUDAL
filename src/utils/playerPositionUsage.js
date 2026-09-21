import { getFormationSlotsForSavedLineup } from './formationSlotCoordinates.js';
import {
  buildMatchPlayerIdentityRecordsFromStats,
  createMatchPlayerIdentityIndex,
  resolveMatchPlayerCandidate,
} from './matchPlayerIdentity.js';

const rows = (value) => Array.isArray(value) ? value : [];
const clean = (value) => String(value ?? '').trim();
const normalizeIdentity = (value) => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .toLowerCase();

const SLOT_POSITION_LABELS = {
  POR: 'Portero',
  LD: 'Lateral derecho',
  LI: 'Lateral izquierdo',
  DFC_D: 'Central derecho',
  DFC_C: 'Defensa central',
  DFC_I: 'Central izquierdo',
  MCD: 'Pivote',
  MCD_D: 'Pivote derecho',
  MCD_I: 'Pivote izquierdo',
  MC_D: 'Interior derecho',
  MC_C: 'Mediocentro',
  MC_I: 'Interior izquierdo',
  MD: 'Extremo derecho',
  MI: 'Extremo izquierdo',
  MPD: 'Extremo derecho',
  MPC: 'Mediapunta',
  MPI: 'Extremo izquierdo',
  ED: 'Extremo derecho',
  EI: 'Extremo izquierdo',
  CAD: 'Carrilero derecho',
  CAI: 'Carrilero izquierdo',
  DC: 'Delantero centro',
  DC_D: 'Delantero centro',
  DC_I: 'Delantero centro',
};

const POSITION_ABBREVIATIONS = {
  Portero: 'POR',
  'Lateral derecho': 'LD',
  'Lateral izquierdo': 'LI',
  'Central derecho': 'DFC',
  'Defensa central': 'DFC',
  'Central izquierdo': 'DFC',
  Pivote: 'MCD',
  'Pivote derecho': 'MCD',
  'Pivote izquierdo': 'MCD',
  'Interior derecho': 'ID',
  Mediocentro: 'MC',
  'Interior izquierdo': 'II',
  'Extremo derecho': 'ED',
  'Extremo izquierdo': 'EI',
  Mediapunta: 'MP',
  'Carrilero derecho': 'CAD',
  'Carrilero izquierdo': 'CAI',
  'Delantero centro': 'DC',
};

export const getTacticalPositionLabel = ({ system, slot, explicitPosition = '' } = {}) => {
  if (clean(explicitPosition)) return SLOT_POSITION_LABELS[clean(explicitPosition).toUpperCase()] || clean(explicitPosition);
  const slotRow = getFormationSlotsForSavedLineup(system)[Number(slot)];
  if (!slotRow) return '';
  return SLOT_POSITION_LABELS[slotRow.id] || clean(slotRow.role || slotRow.label);
};

export const getTacticalPositionAbbreviation = (position = '') => POSITION_ABBREVIATIONS[clean(position)] || clean(position) || '—';

const resolvePlayerCandidate = (candidates, identity, identityIndex) => resolveMatchPlayerCandidate({
  reference: identity,
  candidates,
  identityIndex,
});

const findPlayerStats = (playerStats, identity, identityIndex) => {
  const candidates = Object.entries(playerStats || {}).map(([name, stats]) => ({
    ...stats,
    playerId: stats?.jugadorId || stats?.jugador_id || stats?.playerId || '',
    playerName: name,
  }));
  return resolvePlayerCandidate(candidates, identity, identityIndex).candidate || {};
};

const getParticipationWindow = ({ minutes, role, duration, playerStats, identity }) => {
  const playedMinutes = Math.max(0, Math.min(Number(duration || 90), Number(minutes || 0)));
  if (!playedMinutes) return { fromMinute: 0, toMinute: 0, minutes: 0 };
  if (normalizeIdentity(role) === 'titular') return { fromMinute: 0, toMinute: playedMinutes, minutes: playedMinutes };
  const replacementEntry = Object.entries(playerStats || {}).find(([, stats]) => (
    normalizeIdentity(stats?.replacementName || stats?.replacement_name) === normalizeIdentity(identity.playerName)
  ));
  const recordedEntry = Number(replacementEntry?.[1]?.minutes);
  const fromMinute = Number.isFinite(recordedEntry) && recordedEntry >= 0
    ? Math.min(Number(duration || 90), recordedEntry)
    : Math.max(0, Number(duration || 90) - playedMinutes);
  return { fromMinute, toMinute: Math.min(Number(duration || 90), fromMinute + playedMinutes), minutes: playedMinutes };
};

const getInitialPosition = ({ initialSlots, system, identity, identityIndex }) => {
  const slot = resolvePlayerCandidate(rows(initialSlots), identity, identityIndex).candidate;
  if (!slot) return '';
  return getTacticalPositionLabel({
    system,
    slot: slot.slot,
    explicitPosition: slot.position || slot.role || slot.tacticalRole || slot.tactical_role,
  });
};

const getMatchMetadata = (row = {}) => {
  const metadata = row.matchMetadata || row.metadata || {};
  return {
    opponent: clean(metadata.opponent || row.opponent),
    date: clean(metadata.date || row.date),
    competition: clean(metadata.competition || row.competition),
    venue: clean(metadata.venue || row.venue),
    result: clean(metadata.result || row.result),
  };
};

const sameSystem = (left, right) => normalizeIdentity(left) === normalizeIdentity(right);

const classifyUnknownSegment = (segment = {}) => {
  if (segment.intervalSource === 'missing_substitution_snapshot') return 'substitution_without_snapshot';
  if (segment.intervalSource === 'missing_system_snapshot') return 'system_change_without_snapshot';
  if (segment.intervalSource === 'missing_initial_snapshot') return 'missing_initial_snapshot';
  if (segment.intervalSource === 'persisted' && segment.intervalComplete === false) return 'incomplete_persisted_snapshot';
  if (segment.source === 'unknown' && segment.systemIdentified) return 'insufficient_positional_evidence';
  return 'insufficient_historical_data';
};

const buildTacticalAuditEvents = (row = {}) => {
  const substitutions = Object.entries(row.playerStats || {}).flatMap(([outPlayerName, stats]) => {
    const minute = Number(stats?.minutes);
    const inPlayerName = clean(stats?.replacementName || stats?.replacement_name);
    return inPlayerName && Number.isFinite(minute) ? [{ type: 'substitution', minute, outPlayerName, inPlayerName }] : [];
  });
  const systemChanges = rows(row.systemEvents).flatMap((event) => {
    const minute = Number(event?.minute);
    if (!Number.isFinite(minute)) return [];
    return [{
      type: 'system_change',
      minute,
      fromSystem: clean(event.fromSystem || event.from_system),
      toSystem: clean(event.toSystem || event.to_system),
      eventId: clean(event.id),
    }];
  });
  const snapshots = rows(row.snapshots).flatMap((snapshot) => {
    const minute = Number(snapshot?.minute);
    if (!Number.isFinite(minute)) return [];
    return [{
      type: 'snapshot',
      minute,
      snapshotId: clean(snapshot.id),
      system: clean(snapshot.system),
      isComplete: Boolean(snapshot.isComplete ?? snapshot.is_complete),
      slotCount: rows(snapshot.slots).length,
    }];
  });
  return [...substitutions, ...systemChanges, ...snapshots]
    .sort((left, right) => left.minute - right.minute || left.type.localeCompare(right.type));
};

const buildPlayerMatchPositionUsage = ({ row, identity }) => {
  const duration = Math.max(0, Number(row.duration || 90));
  const actualMinutes = Math.max(0, Math.min(duration, Number(row.minutes || 0)));
  const playerStats = row.playerStats || {};
  const identityIndex = createMatchPlayerIdentityIndex([
    ...rows(row.playerIdentities),
    ...buildMatchPlayerIdentityRecordsFromStats(playerStats),
    identity,
  ]);
  const stats = findPlayerStats(playerStats, identity, identityIndex);
  const participation = getParticipationWindow({
    minutes: actualMinutes,
    role: row.role || stats.role,
    duration,
    playerStats,
    identity,
  });
  const initialPosition = getInitialPosition({
    initialSlots: row.initialSlots,
    system: row.initialSystem,
    identity,
    identityIndex,
  });
  const intervals = rows(row.intervals)
    .filter((interval) => Number(interval?.toMinute) > Number(interval?.fromMinute))
    .slice()
    .sort((left, right) => Number(left.fromMinute) - Number(right.fromMinute) || Number(left.toMinute) - Number(right.toMinute));
  const segments = [];
  const addSegment = ({ fromMinute, toMinute, system = '', position = '', source = 'unknown', interval = null, playerResolution = '' }) => {
    const safeFrom = Math.max(participation.fromMinute, Number(fromMinute));
    const safeTo = Math.min(participation.toMinute, Number(toMinute));
    if (safeTo <= safeFrom) return;
    segments.push({
      matchId: clean(row.matchId),
      fromMinute: safeFrom,
      toMinute: safeTo,
      startMinute: safeFrom,
      endMinute: safeTo,
      minutes: safeTo - safeFrom,
      system: clean(system),
      position: clean(position),
      identified: Boolean(clean(position)),
      positionIdentified: Boolean(clean(position)),
      systemIdentified: Boolean(clean(system)),
      source,
      playerId: identity.playerId,
      playerName: identity.playerName,
      intervalId: clean(interval?.id),
      intervalSource: clean(interval?.source),
      intervalReason: clean(interval?.reason),
      intervalComplete: interval ? Boolean(interval.isComplete) : null,
      snapshot: interval ? {
        id: clean(interval.id),
        source: clean(interval.source),
        reason: clean(interval.reason),
        isComplete: Boolean(interval.isComplete),
        slotCount: rows(interval.slots).length,
        playerResolution,
      } : null,
    });
  };

  if (actualMinutes > 0) {
    if (!intervals.length) {
      addSegment({
        fromMinute: participation.fromMinute,
        toMinute: participation.toMinute,
        system: row.initialSystem,
        position: participation.fromMinute === 0 ? initialPosition : '',
        source: participation.fromMinute === 0 && initialPosition ? 'initialSlot' : 'unknown',
      });
    } else {
      let cursor = participation.fromMinute;
      intervals.forEach((interval) => {
        const intervalFrom = Math.max(participation.fromMinute, Number(interval.fromMinute));
        const intervalTo = Math.min(participation.toMinute, Number(interval.toMinute));
        if (intervalTo <= cursor || intervalTo <= intervalFrom) return;
        if (intervalFrom > cursor) {
          const canUseInitialGap = cursor === 0 && Boolean(initialPosition);
          addSegment({
            fromMinute: cursor,
            toMinute: intervalFrom,
            system: canUseInitialGap ? row.initialSystem : '',
            position: canUseInitialGap ? initialPosition : '',
            source: canUseInitialGap ? 'initialSlot' : 'unknown',
          });
        }
        const fromMinute = Math.max(cursor, intervalFrom);
        const slotResolution = interval.isComplete
          ? resolvePlayerCandidate(rows(interval.slots), identity, identityIndex)
          : { status: 'interval_incomplete', candidate: null };
        const slot = slotResolution.candidate;
        const explicitPosition = clean(slot?.position || slot?.role || slot?.tacticalPosition || slot?.tactical_position);
        const resolvedPosition = slot
          ? getTacticalPositionLabel({ system: interval.system, slot: slot.slot, explicitPosition })
          : '';
        const isInitialInterval = Number(interval.fromMinute) === 0
          && participation.fromMinute === 0
          && Boolean(initialPosition)
          && (!clean(interval.system) || !clean(row.initialSystem) || sameSystem(interval.system, row.initialSystem));
        addSegment({
          fromMinute,
          toMinute: intervalTo,
          system: interval.system || (isInitialInterval ? row.initialSystem : ''),
          position: resolvedPosition || (isInitialInterval ? initialPosition : ''),
          source: resolvedPosition ? (explicitPosition ? 'explicit' : 'tacticalSlot') : isInitialInterval ? 'initialSlot' : 'unknown',
          interval,
          playerResolution: slotResolution.status,
        });
        cursor = Math.max(cursor, intervalTo);
      });
      if (cursor < participation.toMinute) {
        const canUseInitialTail = cursor === 0 && Boolean(initialPosition);
        addSegment({
          fromMinute: cursor,
          toMinute: participation.toMinute,
          system: canUseInitialTail ? row.initialSystem : '',
          position: canUseInitialTail ? initialPosition : '',
          source: canUseInitialTail ? 'initialSlot' : 'unknown',
        });
      }
    }
  }

  const identifiedMinutes = segments.filter((segment) => segment.identified).reduce((sum, segment) => sum + segment.minutes, 0);
  const unidentifiedMinutes = segments.filter((segment) => !segment.identified).reduce((sum, segment) => sum + segment.minutes, 0);
  const coveredMinutes = segments.reduce((sum, segment) => sum + segment.minutes, 0);
  const overlap = segments.some((segment, index) => index > 0 && segment.fromMinute < segments[index - 1].toMinute);
  const tacticalEvents = buildTacticalAuditEvents(row);
  const unknownAudit = segments.filter((segment) => !segment.identified).map((segment) => ({
    matchId: clean(row.matchId),
    ...getMatchMetadata(row),
    playerId: identity.playerId,
    playerName: identity.playerName,
    role: clean(row.role || stats.role),
    fromMinute: segment.fromMinute,
    toMinute: segment.toMinute,
    minutes: segment.minutes,
    system: segment.system,
    classification: classifyUnknownSegment(segment),
    technicalReason: segment.intervalReason || classifyUnknownSegment(segment),
    boundaryEvents: tacticalEvents.filter((event) => event.minute === segment.fromMinute),
    previousEvent: tacticalEvents.filter((event) => event.minute < segment.fromMinute).at(-1) || null,
    nextEvent: tacticalEvents.find((event) => event.minute > segment.fromMinute) || null,
    snapshot: segment.snapshot,
  }));
  const reconstructionAudit = segments.filter((segment) => segment.intervalSource === 'inferred_substitution').map((segment) => ({
    matchId: clean(row.matchId),
    ...getMatchMetadata(row),
    playerId: identity.playerId,
    playerName: identity.playerName,
    role: clean(row.role || stats.role),
    fromMinute: segment.fromMinute,
    toMinute: segment.toMinute,
    minutes: segment.minutes,
    system: segment.system,
    position: segment.position,
    evidence: 'same_system_direct_replacement_slot',
    boundaryEvents: tacticalEvents.filter((event) => event.minute === segment.fromMinute),
    previousEvent: tacticalEvents.filter((event) => event.minute < segment.fromMinute).at(-1) || null,
    nextEvent: tacticalEvents.find((event) => event.minute > segment.fromMinute) || null,
    snapshot: segment.snapshot,
  }));
  return {
    matchId: clean(row.matchId),
    ...getMatchMetadata(row),
    totalMinutes: actualMinutes,
    identifiedMinutes,
    unidentifiedMinutes,
    coveragePercent: actualMinutes ? Math.round((identifiedMinutes / actualMinutes) * 100) : 0,
    segments,
    unknownAudit,
    reconstructionAudit,
    valid: !overlap && coveredMinutes === actualMinutes && identifiedMinutes + unidentifiedMinutes === actualMinutes,
  };
};

export const getPlayerPositionUsage = ({
  playerId = '',
  playerName = '',
  playerIdentity = {},
  playerIdentities = [],
  matchRows = [],
} = {}) => {
  const identity = {
    ...playerIdentity,
    canonicalPlayerId: clean(playerIdentity.canonicalPlayerId || playerId),
    playerId: clean(playerId || playerIdentity.playerId || playerIdentity.id),
    playerName: clean(playerName || playerIdentity.playerName || playerIdentity.name),
  };
  const allocations = new Map();
  const sources = { explicit: 0, tacticalSlot: 0, initialSlot: 0, unknown: 0 };
  const matches = rows(matchRows).map((row) => buildPlayerMatchPositionUsage({
    row: { ...row, playerIdentities: rows(row.playerIdentities).length ? row.playerIdentities : playerIdentities },
    identity,
  }));
  const totalMinutes = matches.reduce((sum, match) => sum + match.totalMinutes, 0);
  matches.flatMap((match) => match.segments).forEach((segment) => {
    sources[segment.source] = (sources[segment.source] || 0) + segment.minutes;
    if (!segment.identified) return;
    const key = normalizeIdentity(segment.position);
    const current = allocations.get(key) || { position: segment.position, minutes: 0, sources: new Set() };
    current.minutes += segment.minutes;
    current.sources.add(segment.source);
    allocations.set(key, current);
  });

  const positions = [...allocations.values()]
    .map((row) => ({
      position: row.position,
      minutes: row.minutes,
      percentage: totalMinutes ? Math.round((row.minutes / totalMinutes) * 100) : 0,
      sources: [...row.sources],
    }))
    .sort((left, right) => right.minutes - left.minutes || left.position.localeCompare(right.position, 'es'));
  const determinedMinutes = positions.reduce((sum, row) => sum + row.minutes, 0);
  const unknownMinutes = matches.reduce((sum, match) => sum + match.unidentifiedMinutes, 0);
  const temporalCoverageValid = matches.every((match) => match.valid);
  const arithmeticValid = determinedMinutes <= totalMinutes && determinedMinutes + unknownMinutes === totalMinutes;
  return {
    positions,
    totalMinutes,
    determinedMinutes,
    unknownMinutes,
    identifiedMinutes: determinedMinutes,
    unidentifiedMinutes: unknownMinutes,
    coveragePercent: totalMinutes ? Math.round((determinedMinutes / totalMinutes) * 100) : 0,
    determinedPercentage: totalMinutes ? Math.round((determinedMinutes / totalMinutes) * 100) : 0,
    sources,
    matches,
    unknownAudit: matches.flatMap((match) => match.unknownAudit),
    reconstructionAudit: matches.flatMap((match) => match.reconstructionAudit),
    segments: matches.flatMap((match) => match.segments),
    quality: {
      arithmeticValid,
      temporalCoverageValid,
    },
    valid: arithmeticValid && temporalCoverageValid,
  };
};

// Nombre anterior conservado para los consumidores ya existentes. Ambos apuntan
// al mismo selector canónico; no existe un cálculo alternativo para el PDF.
export const buildPlayerPositionUsage = getPlayerPositionUsage;
