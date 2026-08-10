import { isOfficialCompetition } from './competitionFilters.js';
import { getMatchStatus } from './matchStatus.js';

export const PLAYER_AVAILABILITY = Object.freeze({
  available: 'available',
  injured: 'injured',
  suspended: 'suspended',
  unavailable: 'unavailable',
});

export const normalizePlayerAvailability = (player = {}) => {
  const rawStatus = String(player.availabilityStatus ?? player.availability_status ?? 'available').trim().toLowerCase();
  const status = Object.hasOwn(PLAYER_AVAILABILITY, rawStatus) ? rawStatus : PLAYER_AVAILABILITY.available;
  const remaining = Math.max(0, Number.parseInt(
    player.suspensionMatchesRemaining ?? player.suspension_matches_remaining ?? 0,
    10
  ) || 0);
  if (status !== PLAYER_AVAILABILITY.suspended || remaining < 1) {
    return { status: PLAYER_AVAILABILITY.available === status ? status : (status === PLAYER_AVAILABILITY.suspended ? PLAYER_AVAILABILITY.available : status), remaining: 0 };
  }
  return { status, remaining };
};

export const isPlayerAvailable = (player = {}) => normalizePlayerAvailability(player).status === PLAYER_AVAILABILITY.available;

export const getPlayerAvailabilityPresentation = (player = {}) => {
  const availability = normalizePlayerAvailability(player);
  if (availability.status === PLAYER_AVAILABILITY.injured) return { ...availability, label: 'LESIONADO', tone: 'injured' };
  if (availability.status === PLAYER_AVAILABILITY.suspended) {
    return {
      ...availability,
      label: `SANCIONADO · ${availability.remaining} ${availability.remaining === 1 ? 'partido' : 'partidos'}`,
      tone: 'suspended',
    };
  }
  if (availability.status === PLAYER_AVAILABILITY.unavailable) return { ...availability, label: 'NO DISPONIBLE', tone: 'unavailable' };
  return { ...availability, label: 'DISPONIBLE', tone: 'available' };
};

export const getAvailableOutsidePlayerNames = (rows = []) => Array.from(new Set(
  rows
    .filter((row) => row?.status === 'Fuera' && row?.player?.name && isPlayerAvailable(row.player))
    .map((row) => row.player.name)
));

export const addAllAvailableOutsidePlayers = (rows = []) => rows.map((row) => (
  row?.status === 'Fuera' && isPlayerAvailable(row?.player)
    ? { ...row, status: 'Suplente' }
    : row
));

export const buildAvailabilityRpcInput = (playerId, status, remaining = 0) => ({
  p_jugador_id: playerId,
  p_availability_status: status,
  p_suspension_matches_remaining: status === PLAYER_AVAILABILITY.suspended
    ? Math.max(0, Number.parseInt(remaining, 10) || 0)
    : 0,
});

export const getEligibleSuspensionMatches = (matches = [], competitionCatalog = [], now = new Date()) => (
  matches
    .filter((match) => isOfficialCompetition(match, competitionCatalog) && getMatchStatus(match, now) === 'played')
    .sort((left, right) => `${left?.date || ''} ${left?.time || ''}`.localeCompare(`${right?.date || ''} ${right?.time || ''}`))
);

export const consumeSuspensionsForEligibleMatches = async ({ supabase, matches, competitionCatalog = [], now = new Date() }) => {
  const results = [];
  for (const match of getEligibleSuspensionMatches(matches, competitionCatalog, now)) {
    const response = await supabase.rpc('consume_player_suspensions_for_match', { p_partido_id: match.id });
    if (response.error) throw response.error;
    results.push(...(response.data || []).map((consumption) => ({ ...consumption, partidoId: match.id })));
  }
  return results;
};

// Modelo puro equivalente a las transiciones de la RPC. Se mantiene aquí para
// probar el contrato de dominio sin necesitar una base remota en CI.
export const transitionPlayerAvailability = (
  player = {},
  requestedStatus,
  requestedRemaining = 0,
  { cycleId = 'new-cycle', now = '2026-01-01T00:00:00.000Z' } = {}
) => {
  const status = String(requestedStatus || '').toLowerCase();
  const remaining = Math.max(0, Number.parseInt(requestedRemaining, 10) || 0);
  if (status !== PLAYER_AVAILABILITY.suspended || remaining === 0) {
    return {
      ...player,
      availabilityStatus: status === PLAYER_AVAILABILITY.suspended ? PLAYER_AVAILABILITY.available : status,
      suspensionMatchesRemaining: 0,
      suspensionCycleId: null,
      suspensionStartedAt: null,
    };
  }
  const keepsCycle = player.availabilityStatus === PLAYER_AVAILABILITY.suspended && player.suspensionCycleId;
  return {
    ...player,
    availabilityStatus: PLAYER_AVAILABILITY.suspended,
    suspensionMatchesRemaining: remaining,
    suspensionCycleId: keepsCycle ? player.suspensionCycleId : cycleId,
    suspensionStartedAt: keepsCycle ? player.suspensionStartedAt : now,
  };
};

export const consumeSuspensionModel = ({
  player,
  match,
  consumedKeys = new Set(),
  competitionCatalog = [],
  now = new Date(),
}) => {
  const availability = normalizePlayerAvailability(player);
  const cycleId = player?.suspensionCycleId ?? player?.suspension_cycle_id;
  const startedAt = player?.suspensionStartedAt ?? player?.suspension_started_at;
  const consumptionKey = `${player?.id}:${match?.id}:${cycleId}`;
  const matchTime = new Date(`${match?.date || ''}T${String(match?.time || '00:00').slice(0, 5)}:00`);
  const eligible = availability.status === PLAYER_AVAILABILITY.suspended
    && Boolean(cycleId && startedAt)
    && isOfficialCompetition(match, competitionCatalog)
    && getMatchStatus(match, now) === 'played'
    && !Number.isNaN(matchTime.getTime())
    && matchTime.getTime() > new Date(startedAt).getTime()
    && !consumedKeys.has(consumptionKey);
  if (!eligible) return { player, consumedKeys: new Set(consumedKeys), consumed: false };
  const nextRemaining = availability.remaining - 1;
  const nextKeys = new Set(consumedKeys).add(consumptionKey);
  return {
    consumed: true,
    consumedKeys: nextKeys,
    player: {
      ...player,
      availabilityStatus: nextRemaining === 0 ? PLAYER_AVAILABILITY.available : PLAYER_AVAILABILITY.suspended,
      suspensionMatchesRemaining: nextRemaining,
      suspensionCycleId: nextRemaining === 0 ? null : cycleId,
      suspensionStartedAt: nextRemaining === 0 ? null : startedAt,
    },
  };
};
