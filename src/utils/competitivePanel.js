import { isOfficialCompetition, normalizeCompetitionKey } from './competitionFilters.js';
import { goalParticipantMatchesPlayer, hasGoalAssistant } from './goalEvents.js';
import { getMatchStatus } from './matchStatus.js';

const safeArray = (value) => (Array.isArray(value) ? value : []);
const cleanText = (value) => String(value || '').trim();

export const getCompetitiveMatchChronologyKey = (match = {}) => (
  `${cleanText(match.date || match.match_date)}T${cleanText(match.time || match.match_time).padStart(5, '0')}`
);

export const getOfficialPlayedMatches = (matches = [], competitionCatalog = [], now = new Date()) => (
  safeArray(matches).filter((match) => (
    isOfficialCompetition(normalizeCompetitionKey(match), competitionCatalog)
    && getMatchStatus(match, now) === 'played'
  ))
);

export const getStoredInitialMatchSystem = (match = {}) => cleanText(
  match.statsSystemRaw
  || match.stats_system
  || match.statsSystem
  || match.preCaudalSystemRaw
  || match.pre_caudal_system
  || match.preCaudalSystem
);

export const getHabitualOfficialSystem = (matches = []) => {
  const bySystem = new Map();
  safeArray(matches).forEach((match) => {
    const system = getStoredInitialMatchSystem(match);
    if (!system) return;
    const chronologyKey = getCompetitiveMatchChronologyKey(match);
    const current = bySystem.get(system) || { system, count: 0, latestStartKey: '' };
    current.count += 1;
    if (chronologyKey > current.latestStartKey) current.latestStartKey = chronologyKey;
    bySystem.set(system, current);
  });
  const rows = Array.from(bySystem.values()).sort((left, right) => (
    right.count - left.count
    || right.latestStartKey.localeCompare(left.latestStartKey)
    || left.system.localeCompare(right.system)
  ));
  return { system: rows[0]?.system || '', count: rows[0]?.count || 0, rows };
};

const getStatsLineup = (match = {}) => {
  const statsSlots = safeArray(match?.lineupSlots?.stats)
    .map((slot) => ({ slot: Number(slot?.slot), playerName: cleanText(slot?.playerName ?? slot?.player_name) }))
    .filter((slot) => Number.isInteger(slot.slot) && slot.slot >= 0 && slot.slot < 11 && slot.playerName)
    .sort((left, right) => left.slot - right.slot);
  if (statsSlots.length) {
    return statsSlots.reduce((lineup, slot) => {
      lineup[slot.slot] = slot.playerName;
      return lineup;
    }, Array.from({ length: 11 }, () => ''));
  }
  return Array.from({ length: 11 }, (_, slot) => cleanText(match?.statsLineup?.[slot]));
};

export const compareHabitualPlayerEvidence = (left = {}, right = {}) => (
  Number(right.starts || 0) - Number(left.starts || 0)
  || Number(right.minutes || 0) - Number(left.minutes || 0)
  || cleanText(right.latestStartKey).localeCompare(cleanText(left.latestStartKey))
  || cleanText(left.player?.name || left.name).localeCompare(cleanText(right.player?.name || right.name), 'es')
);

export const buildOfficialPlayerTotals = (officialPlayedMatches = [], players = []) => {
  const rowsByName = new Map(safeArray(players).map((player) => [player.name, {
    player,
    starts: 0,
    minutes: 0,
    goals: 0,
    assists: 0,
    latestStartKey: '',
  }]));

  safeArray(officialPlayedMatches).forEach((match) => {
    const lineup = getStatsLineup(match);
    const chronologyKey = getCompetitiveMatchChronologyKey(match);
    safeArray(players).forEach((player) => {
      const row = rowsByName.get(player.name);
      const stored = match?.statsPlayerData?.[player.name] || {};
      const minutes = Number(stored.minutes);
      if (Number.isFinite(minutes) && minutes > 0) row.minutes += minutes;
      if (lineup.includes(player.name)) {
        row.starts += 1;
        if (chronologyKey > row.latestStartKey) row.latestStartKey = chronologyKey;
      }
    });

    lineup.forEach((starterName) => {
      if (!starterName) return;
      const starterStats = match?.statsPlayerData?.[starterName] || {};
      const starterMinutes = Number(starterStats.minutes);
      const replacementName = cleanText(starterStats.replacementName ?? starterStats.replacement_name);
      if (!Number.isFinite(starterMinutes) || starterMinutes <= 0 || starterMinutes >= 90 || !replacementName) return;
      const replacementStats = match?.statsPlayerData?.[replacementName] || {};
      if (Number(replacementStats.minutes) > 0 || !rowsByName.has(replacementName)) return;
      rowsByName.get(replacementName).minutes += 90 - starterMinutes;
    });

    safeArray(match.statsGoalEvents).forEach((goal) => {
      if (goal?.type !== 'Gol a favor') return;
      const scorer = safeArray(players).find((player) => goalParticipantMatchesPlayer(goal, 'scorer', player));
      if (scorer && rowsByName.has(scorer.name)) rowsByName.get(scorer.name).goals += 1;
      if (!hasGoalAssistant(goal)) return;
      const assistant = safeArray(players).find((player) => goalParticipantMatchesPlayer(goal, 'assistant', player));
      if (assistant && rowsByName.has(assistant.name)) rowsByName.get(assistant.name).assists += 1;
    });
  });

  const rows = Array.from(rowsByName.values());
  const topBy = (field) => rows
    .filter((row) => Number(row[field] || 0) > 0)
    .sort((left, right) => (
      Number(right[field]) - Number(left[field])
      || cleanText(left.player?.name).localeCompare(cleanText(right.player?.name), 'es')
    ))[0] || null;
  return {
    rows,
    topMinutes: topBy('minutes'),
    topScorer: topBy('goals'),
    topAssistant: topBy('assists'),
  };
};

export const getOfficialCaptainPlayerId = (officialPlayedMatches = []) => {
  const byPlayerId = new Map();
  safeArray(officialPlayedMatches).forEach((match) => {
    const playerId = cleanText(match.captainPlayerId ?? match.captain_player_id);
    if (!playerId) return;
    const chronologyKey = getCompetitiveMatchChronologyKey(match);
    const current = byPlayerId.get(playerId) || { playerId, count: 0, latestStartKey: '' };
    current.count += 1;
    if (chronologyKey > current.latestStartKey) current.latestStartKey = chronologyKey;
    byPlayerId.set(playerId, current);
  });
  return Array.from(byPlayerId.values()).sort((left, right) => (
    right.count - left.count
    || right.latestStartKey.localeCompare(left.latestStartKey)
    || left.playerId.localeCompare(right.playerId)
  ))[0]?.playerId || null;
};
