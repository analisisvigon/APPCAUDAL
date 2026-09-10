import { getMatchStatus, parseLocalMatchDate } from './matchStatus.js';

const isBlankMinutes = (value) => (
  value === null
  || value === undefined
  || String(value).trim() === ''
);

export const DEFAULT_STATS_MATCH_DURATION_MINUTES = 90;

export const getStatsMatchDurationMinutes = (match = {}) => {
  const candidates = [
    match.duration,
    match.matchDuration,
    match.officialDuration,
    match.minutes,
    ...Object.values(match.statsPlayerData && typeof match.statsPlayerData === 'object' ? match.statsPlayerData : {})
      .map((row) => row?.minutes),
  ];
  const numeric = candidates
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
  return Math.max(DEFAULT_STATS_MATCH_DURATION_MINUTES, ...numeric);
};

export const isStatsMatchCompleted = (match = {}, now = new Date()) => {
  const matchDate = parseLocalMatchDate(match.date);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  if (matchDate && matchDate > today) return false;
  const storedStatus = String(match.status || '').trim().toLocaleLowerCase('es-ES');
  if (['finalizado', 'jugado', 'played', 'finished', 'cerrado', 'closed', 'revisado', 'reviewed'].includes(storedStatus)) return true;
  return Boolean(matchDate && matchDate < today && getMatchStatus(match, now) === 'played');
};

const normalizedPlayerName = (value) => String(value || '')
  .trim()
  .toLocaleLowerCase('es-ES');

const getStatsRow = (statsPlayerData, playerName) => {
  const direct = statsPlayerData?.[playerName];
  if (direct) return direct;
  const identity = normalizedPlayerName(playerName);
  return Object.entries(statsPlayerData || {})
    .find(([storedName]) => normalizedPlayerName(storedName) === identity)?.[1] || {};
};

const getReplacementName = (row = {}) => String(row.replacementName ?? row.replacement_name ?? '').trim();

export const buildCompletedStatsMinutesUpdates = ({
  match = {},
  lineup = [],
  statsPlayerData = {},
  matchCompleted = false,
} = {}) => {
  if (!matchCompleted) return [];

  const duration = getStatsMatchDurationMinutes({ ...match, statsPlayerData });
  const starters = Array.from(new Set(lineup.map((name) => String(name || '').trim()).filter(Boolean)));
  const updates = [];
  const substitutionsByIncomingPlayer = new Map();

  starters.forEach((playerName) => {
    const row = getStatsRow(statsPlayerData, playerName);
    const replacementName = getReplacementName(row);
    const exitMinute = Number(row.minutes);
    if (replacementName && Number.isFinite(exitMinute) && exitMinute > 0 && exitMinute < duration) {
      const incomingIdentity = normalizedPlayerName(replacementName);
      const current = substitutionsByIncomingPlayer.get(incomingIdentity) || [];
      substitutionsByIncomingPlayer.set(incomingIdentity, [...current, { replacementName, exitMinute }]);
      return;
    }
    if (replacementName || !isBlankMinutes(row.minutes)) return;
    updates.push({ playerName, minutes: duration, reason: 'starter_completed_match' });
  });

  substitutionsByIncomingPlayer.forEach((entries) => {
    if (entries.length !== 1) return;
    const [{ replacementName, exitMinute }] = entries;
    const row = getStatsRow(statsPlayerData, replacementName);
    if (!isBlankMinutes(row.minutes)) return;
    updates.push({
      playerName: replacementName,
      minutes: duration - exitMinute,
      reason: 'substitute_completed_match',
    });
  });

  return updates;
};

export const resolveStatsWorkingMinutes = ({
  role = '',
  minutes = '',
  substituteMinutes = 0,
  matchDuration = DEFAULT_STATS_MATCH_DURATION_MINUTES,
} = {}) => {
  const normalizedSubstituteMinutes = Number(substituteMinutes);
  if (Number.isFinite(normalizedSubstituteMinutes) && normalizedSubstituteMinutes > 0) {
    return {
      value: normalizedSubstituteMinutes,
      isUnconfirmedStarterValue: false,
    };
  }

  if (!isBlankMinutes(minutes)) {
    return {
      value: minutes,
      isUnconfirmedStarterValue: false,
    };
  }

  if (String(role).trim().toLocaleLowerCase('es-ES') === 'titular') {
    return {
      value: Number(matchDuration) > 0 ? Number(matchDuration) : DEFAULT_STATS_MATCH_DURATION_MINUTES,
      isUnconfirmedStarterValue: true,
    };
  }

  return {
    value: '',
    isUnconfirmedStarterValue: false,
  };
};
