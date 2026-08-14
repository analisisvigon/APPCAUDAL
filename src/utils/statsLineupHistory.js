import { isOfficialCompetition } from './competitionFilters.js';
import { getMatchStatus } from './matchStatus.js';
import { isPlayerAvailable } from './playerAvailability.js';
import { normalizeStatsLineup } from './statsLineup.js';

const clean = (value) => String(value || '').trim();
const cleanId = (value) => clean(value).toLowerCase();
const matchMoment = (match = {}) => `${clean(match.date)}T${clean(match.time || '00:00')}`;

export const getStoredStatsSystem = (match = {}) => clean(
  match.statsSystemRaw ?? match.stats_system ?? match.statsSystem
);

export const buildStatsLineupHistoryDataset = ({ matches = [], slotRows = [], statsRows = [] } = {}) => {
  const slotsByMatch = new Map();
  slotRows.forEach((row) => {
    if (row?.scope !== 'stats') return;
    const slot = Number(row.slot);
    if (!row?.partido_id || !Number.isInteger(slot) || slot < 0 || slot > 10) return;
    const current = slotsByMatch.get(row.partido_id) || [];
    current.push({
      slot,
      jugadorId: clean(row.jugador_id),
      playerName: clean(row.player_name),
    });
    slotsByMatch.set(row.partido_id, current);
  });

  const statsByMatch = new Map();
  statsRows.forEach((row) => {
    if (!row?.partido_id) return;
    const current = statsByMatch.get(row.partido_id) || [];
    current.push({
      jugadorId: clean(row.jugador_id),
      playerName: clean(row.player_name),
      minutes: Number(row.minutes || 0),
    });
    statsByMatch.set(row.partido_id, current);
  });

  return matches.map((match) => ({
    ...match,
    statsHistorySlots: (slotsByMatch.get(match.id) || []).sort((left, right) => left.slot - right.slot),
    statsHistoryRows: statsByMatch.get(match.id) || [],
  }));
};

export const getEligibleStatsLineupHistoryMatches = ({
  matches = [],
  currentMatch = null,
  competitionCatalog = [],
  now = new Date(),
} = {}) => {
  const currentMoment = currentMatch ? matchMoment(currentMatch) : '';
  return matches
    .filter((match) => match?.id && match.id !== currentMatch?.id)
    .filter((match) => getMatchStatus(match, now) === 'played')
    .filter((match) => isOfficialCompetition(match, competitionCatalog))
    .filter((match) => getStoredStatsSystem(match))
    .filter((match) => Array.isArray(match.statsHistorySlots) && match.statsHistorySlots.length)
    .filter((match) => !currentMoment || !matchMoment(match) || matchMoment(match) < currentMoment)
    .sort((left, right) => matchMoment(right).localeCompare(matchMoment(left)));
};

const rosterById = (players = []) => new Map(players
  .filter((player) => player?.id && player.activeInSquad !== false)
  .map((player) => [cleanId(player.id), player]));

const getMinutesForSlotPlayer = (match, jugadorId) => {
  const id = cleanId(jugadorId);
  const row = (match.statsHistoryRows || []).find((candidate) => cleanId(candidate.jugadorId) === id);
  return Math.max(0, Number(row?.minutes || 0));
};

export const buildAutomaticStatsLineup = ({
  historyMatches = [],
  system,
  rosterPlayers = [],
} = {}) => {
  const playersById = rosterById(rosterPlayers);
  const usage = new Map();

  historyMatches.filter((match) => getStoredStatsSystem(match) === system).forEach((match) => {
    (match.statsHistorySlots || []).forEach((slotRow) => {
      const jugadorId = cleanId(slotRow.jugadorId);
      const player = playersById.get(jugadorId);
      if (!jugadorId || !player || !isPlayerAvailable(player)) return;
      const key = `${slotRow.slot}:${jugadorId}`;
      const current = usage.get(key) || {
        slot: slotRow.slot,
        jugadorId: player.id,
        playerName: player.name,
        appearances: 0,
        totalMinutes: 0,
        lastPlayedAt: '',
      };
      current.appearances += 1;
      current.totalMinutes += getMinutesForSlotPlayer(match, jugadorId);
      current.lastPlayedAt = [current.lastPlayedAt, matchMoment(match)].sort().at(-1);
      usage.set(key, current);
    });
  });

  const candidatesBySlot = Array.from({ length: 11 }, (_, slot) => Array.from(usage.values())
    .filter((candidate) => candidate.slot === slot)
    .sort((left, right) => (
      right.appearances - left.appearances
      || right.totalMinutes - left.totalMinutes
      || right.lastPlayedAt.localeCompare(left.lastPlayedAt)
      || cleanId(left.jugadorId).localeCompare(cleanId(right.jugadorId))
    )));
  const usedIds = new Set();
  const lineup = Array.from({ length: 11 }, () => '');
  const slots = [];
  candidatesBySlot.forEach((candidates, slot) => {
    const selected = candidates.find((candidate) => !usedIds.has(cleanId(candidate.jugadorId)));
    if (!selected) return;
    usedIds.add(cleanId(selected.jugadorId));
    lineup[slot] = selected.playerName;
    slots.push({ ...selected });
  });
  return { lineup: normalizeStatsLineup(lineup), slots, system };
};

export const buildHistoricalStatsLineupProposal = ({
  historicalMatch,
  currentSystem,
  rosterPlayers = [],
} = {}) => {
  const playersById = rosterById(rosterPlayers);
  const usedIds = new Set();
  const lineup = Array.from({ length: 11 }, () => '');
  const slots = [];
  const unavailable = [];
  const missing = [];
  (historicalMatch?.statsHistorySlots || []).forEach((slotRow) => {
    const jugadorId = cleanId(slotRow.jugadorId);
    if (!jugadorId) {
      missing.push(slotRow.playerName || `Slot ${slotRow.slot + 1}`);
      return;
    }
    const player = playersById.get(jugadorId);
    if (!player) {
      missing.push(slotRow.playerName || jugadorId);
      return;
    }
    if (!isPlayerAvailable(player)) {
      unavailable.push(player.name);
      return;
    }
    if (usedIds.has(jugadorId)) return;
    usedIds.add(jugadorId);
    lineup[slotRow.slot] = player.name;
    slots.push({ slot: slotRow.slot, jugadorId: player.id, playerName: player.name });
  });
  const system = getStoredStatsSystem(historicalMatch);
  return {
    matchId: historicalMatch?.id || '',
    system,
    lineup: normalizeStatsLineup(lineup),
    slots,
    unavailable,
    missing,
    requiresSystemChange: Boolean(system && currentSystem && system !== currentSystem),
  };
};

export const applyHistoricalStatsLineupProposal = (current, proposal, { acceptSystemChange = false } = {}) => {
  if (!proposal || (proposal.requiresSystemChange && !acceptSystemChange)) return current;
  return { ...current, system: proposal.system || current.system, lineup: normalizeStatsLineup(proposal.lineup) };
};
