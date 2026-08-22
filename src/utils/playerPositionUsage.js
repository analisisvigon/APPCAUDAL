import { getFormationSlotsForSavedLineup } from './formationSlotCoordinates.js';

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
  DC: 'Delantero',
  DC_D: 'Delantero',
  DC_I: 'Delantero',
};

export const getTacticalPositionLabel = ({ system, slot, explicitPosition = '' } = {}) => {
  if (clean(explicitPosition)) return clean(explicitPosition);
  const slotRow = getFormationSlotsForSavedLineup(system)[Number(slot)];
  if (!slotRow) return '';
  return SLOT_POSITION_LABELS[slotRow.id] || clean(slotRow.role || slotRow.label);
};

const playerMatches = (row, { playerId, playerName }) => {
  const rowId = clean(row?.playerId || row?.jugadorId || row?.jugador_id);
  if (clean(playerId) && rowId) return rowId === clean(playerId);
  return Boolean(normalizeIdentity(playerName) && normalizeIdentity(row?.playerName || row?.player_name || row?.playerNameSnapshot || row?.player_name_snapshot) === normalizeIdentity(playerName));
};

const findPlayerStats = (playerStats, identity) => Object.entries(playerStats || {}).find(([name, stats]) => (
  playerMatches({ playerId: stats?.jugadorId || stats?.jugador_id, playerName: name }, identity)
))?.[1] || {};

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

const getInitialPosition = ({ initialSlots, system, identity }) => {
  const candidates = rows(initialSlots).filter((slot) => playerMatches(slot, identity));
  if (candidates.length !== 1) return '';
  const slot = candidates[0];
  return getTacticalPositionLabel({
    system,
    slot: slot.slot,
    explicitPosition: slot.position || slot.role || slot.tacticalRole || slot.tactical_role,
  });
};

export const buildPlayerPositionUsage = ({
  playerId = '',
  playerName = '',
  profilePosition = '',
  matchRows = [],
} = {}) => {
  const identity = { playerId: clean(playerId), playerName: clean(playerName) };
  const allocations = new Map();
  const sources = { explicit: 0, tacticalSlot: 0, initialSlot: 0, profile: 0, unknown: 0 };
  let totalMinutes = 0;

  const add = (position, minutes, source) => {
    const safeMinutes = Math.max(0, Number(minutes || 0));
    if (!safeMinutes) return;
    if (!position) {
      sources.unknown += safeMinutes;
      return;
    }
    const key = normalizeIdentity(position);
    const current = allocations.get(key) || { position: clean(position), minutes: 0, sources: new Set() };
    current.minutes += safeMinutes;
    current.sources.add(source);
    allocations.set(key, current);
    sources[source] += safeMinutes;
  };

  rows(matchRows).forEach((row) => {
    const duration = Math.max(0, Number(row.duration || 90));
    const actualMinutes = Math.max(0, Math.min(duration, Number(row.minutes || 0)));
    if (!actualMinutes) return;
    totalMinutes += actualMinutes;
    const playerStats = row.playerStats || {};
    const stats = findPlayerStats(playerStats, identity);
    const participation = getParticipationWindow({
      minutes: actualMinutes,
      role: row.role || stats.role,
      duration,
      playerStats,
      identity,
    });
    let assignedMinutes = 0;
    let coveredUntil = participation.fromMinute;
    const orderedIntervals = rows(row.intervals)
      .filter((interval) => Number(interval?.toMinute) > Number(interval?.fromMinute))
      .slice()
      .sort((left, right) => Number(left.fromMinute) - Number(right.fromMinute) || Number(left.toMinute) - Number(right.toMinute));

    orderedIntervals.forEach((interval) => {
      const fromMinute = Math.max(participation.fromMinute, coveredUntil, Number(interval.fromMinute));
      const toMinute = Math.min(participation.toMinute, Number(interval.toMinute));
      if (toMinute <= fromMinute || !interval.isComplete) return;
      const candidates = rows(interval.slots).filter((slot) => playerMatches(slot, identity));
      if (candidates.length !== 1) return;
      const slot = candidates[0];
      const explicitPosition = clean(slot.position || slot.role || slot.tacticalPosition || slot.tactical_position);
      const position = getTacticalPositionLabel({ system: interval.system, slot: slot.slot, explicitPosition });
      if (!position) return;
      const minutesInPosition = Math.min(toMinute - fromMinute, actualMinutes - assignedMinutes);
      add(position, minutesInPosition, explicitPosition ? 'explicit' : 'tacticalSlot');
      assignedMinutes += minutesInPosition;
      coveredUntil = Math.max(coveredUntil, toMinute);
    });

    const remaining = Math.max(0, actualMinutes - assignedMinutes);
    if (!remaining) return;
    const initialPosition = getInitialPosition({
      initialSlots: row.initialSlots,
      system: row.initialSystem,
      identity,
    });
    if (initialPosition) add(initialPosition, remaining, 'initialSlot');
    else if (clean(profilePosition)) add(clean(profilePosition), remaining, 'profile');
    else add('', remaining, 'unknown');
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
  const unknownMinutes = Math.max(0, totalMinutes - determinedMinutes);
  return {
    positions,
    totalMinutes,
    determinedMinutes,
    unknownMinutes,
    determinedPercentage: totalMinutes ? Math.round((determinedMinutes / totalMinutes) * 100) : 0,
    sources,
    valid: determinedMinutes <= totalMinutes && determinedMinutes + unknownMinutes === totalMinutes,
  };
};
