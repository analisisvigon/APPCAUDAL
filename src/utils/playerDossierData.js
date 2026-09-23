import {
  createMatchPlayerIdentityIndex,
  getMatchPlayerIdentityIds,
  resolveMatchPlayerCandidate,
} from './matchPlayerIdentity.js';
import {
  getMatchStatus,
  isMatchScheduledInFuture,
  parseLocalMatchDate,
} from './matchStatus.js';
import { getStatsMatchDurationMinutes } from './statsWorkingMinutes.js';

const rows = (value) => Array.isArray(value) ? value : [];
const clean = (value) => String(value ?? '').trim();
const normalize = (value) => clean(value).toLocaleLowerCase('es-ES');
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const isKnownNonNegativeNumber = (value) => (
  value !== null
  && value !== undefined
  && clean(value) !== ''
  && Number.isFinite(Number(value))
  && Number(value) >= 0
);

export const normalizePlayerDossierRole = (value) => clean(value) || null;

export const getPlayerDossierVenue = (match = {}) => {
  const value = hasOwn(match, 'isHome') ? match.isHome : match.is_home;
  return typeof value === 'boolean' ? (value ? 'Local' : 'Visitante') : null;
};

export const getKnownBoolean = (value) => typeof value === 'boolean' ? value : null;

export const getKnownYellowCount = (stats = {}) => {
  const count = stats.yellow_count ?? stats.yellowCount;
  if (count !== null && count !== undefined && clean(count) !== '') {
    const numeric = Number(count);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
  }
  const yellow = getKnownBoolean(stats.yellow);
  return yellow === null ? null : yellow ? 1 : 0;
};

const getExplicitMinutes = (stats = {}) => {
  const value = stats.minutes;
  if (value === null || value === undefined || clean(value) === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
};

const hasStrongUndatedParticipationEvidence = ({ stats = {}, goalCount = 0, assistCount = 0 } = {}) => (
  Number(getExplicitMinutes(stats) || 0) > 0
  || Number(goalCount || 0) > 0
  || Number(assistCount || 0) > 0
);

export const isPlayerDossierMatchEligible = ({
  match = {},
  stats = {},
  goalCount = 0,
  assistCount = 0,
  now = new Date(),
} = {}) => {
  if (isMatchScheduledInFuture(match, now)) return false;
  const status = getMatchStatus(match, now);
  if (['postponed', 'suspended', 'cancelled'].includes(status)) return false;
  if (status === 'played') return true;

  const matchDate = parseLocalMatchDate(match.date ?? match.matchDate ?? match.match_date);
  if (matchDate) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
    return matchDate < today;
  }

  // Sin fecha no existe fallback temporal. Solo se acepta evidencia oficial
  // inequívoca de participación almacenada para el propio jugador.
  return hasStrongUndatedParticipationEvidence({ stats, goalCount, assistCount });
};

const statsIdentityCandidate = (stats = {}) => ({
  playerId: stats.jugador_id || stats.jugadorId || stats.player_id || stats.playerId || '',
  globalPlayerId: stats.global_player_id || stats.globalPlayerId || '',
  membershipId: stats.membership_id || stats.membershipId || '',
  aliasIds: stats.alias_ids || stats.aliasIds || [],
  playerName: stats.player_name || stats.playerName || '',
});

const statsCompletenessScore = (stats = {}) => [
  stats.minutes,
  stats.role,
  stats.yellow_count ?? stats.yellowCount,
  stats.yellow,
  stats.red,
  stats.injured,
  stats.replacement_name ?? stats.replacementName,
].reduce((score, value) => score + (value !== null && value !== undefined && clean(value) !== '' ? 1 : 0), 0);

const compareStatsCandidates = (left, right) => (
  right.identityPriority - left.identityPriority
  || right.completeness - left.completeness
  || clean(left.row.id).localeCompare(clean(right.row.id), 'es')
  || clean(left.row.player_name).localeCompare(clean(right.row.player_name), 'es')
);

const getStatsIdentityPriority = (stats, player) => {
  const statsIds = getMatchPlayerIdentityIds(statsIdentityCandidate(stats));
  const canonicalId = clean(player.id || player.canonicalPlayerId || player.canonical_player_id);
  if (canonicalId && statsIds.includes(canonicalId)) return 5;
  const globalId = clean(player.globalPlayerId || player.global_player_id);
  if (globalId && statsIds.includes(globalId)) return 4;
  const membershipId = clean(player.membershipId || player.membership_id);
  if (membershipId && statsIds.includes(membershipId)) return 3;
  const aliases = rows(player.aliasIds || player.alias_ids || player.legacyIds || player.legacy_ids).map(clean).filter(Boolean);
  if (statsIds.some((id) => aliases.includes(id))) return 2;
  return 1;
};

export const deduplicatePlayerOfficialStatsRows = ({ statsRows = [], player = {}, players = [] } = {}) => {
  const identityIndex = createMatchPlayerIdentityIndex([...rows(players), player]);
  const accepted = rows(statsRows).flatMap((row) => {
    const resolution = resolveMatchPlayerCandidate({
      reference: player,
      candidates: [statsIdentityCandidate(row)],
      identityIndex,
    });
    if (resolution.status !== 'resolved') return [];
    return [{
      row,
      resolution,
      identityPriority: getStatsIdentityPriority(row, player),
      completeness: statsCompletenessScore(row),
    }];
  });

  const byMatch = new Map();
  accepted.forEach((candidate) => {
    const matchId = clean(candidate.row.partido_id || candidate.row.partidoId);
    if (!matchId) return;
    const current = byMatch.get(matchId);
    if (!current || compareStatsCandidates(candidate, current) < 0) byMatch.set(matchId, candidate);
  });
  return [...byMatch.values()].map(({ row }) => row);
};

export const isPlayerDossierRowPlayed = (row = {}) => (
  isKnownNonNegativeNumber(row.minutes) && Number(row.minutes) > 0
  || normalize(row.role) === 'titular'
  || rows(row.goals).length > 0
  || rows(row.assists).length > 0
);

export const sortPlayerDossierMatchRows = (matchRows = []) => rows(matchRows).slice().sort((left, right) => {
  const leftDate = parseLocalMatchDate(left.match?.date);
  const rightDate = parseLocalMatchDate(right.match?.date);
  if (leftDate && rightDate && leftDate.getTime() !== rightDate.getTime()) return rightDate.getTime() - leftDate.getTime();
  if (leftDate && !rightDate) return -1;
  if (!leftDate && rightDate) return 1;
  return clean(left.match?.id).localeCompare(clean(right.match?.id), 'es');
});

const summarizeNullableCount = (matchRows, field) => {
  const values = rows(matchRows).map((row) => row[field]);
  const complete = values.every((value) => value !== null && value !== undefined && Number.isFinite(Number(value)));
  return {
    value: complete ? values.reduce((sum, value) => sum + Number(value), 0) : null,
    knownValue: values.reduce((sum, value) => sum + (Number.isFinite(Number(value)) ? Number(value) : 0), 0),
    complete,
  };
};

export const calculatePlayerDossierPer90 = (value, minutes) => (
  Number.isFinite(Number(minutes)) && Number(minutes) > 0 && Number.isFinite(Number(value))
    ? ((Number(value) / Number(minutes)) * 90).toFixed(2)
    : null
);

export const buildPlayerDossierAggregate = (matchRows = []) => {
  const allRows = sortPlayerDossierMatchRows(matchRows);
  const playedRows = allRows.filter((row) => row.played ?? isPlayerDossierRowPlayed(row));
  const starts = playedRows.filter((row) => normalize(row.role) === 'titular').length;
  const knownBenchEntries = playedRows.filter((row) => normalize(row.role) === 'suplente').length;
  const rolesComplete = playedRows.every((row) => Boolean(normalizePlayerDossierRole(row.role)));
  const minutesComplete = playedRows.every((row) => isKnownNonNegativeNumber(row.minutes));
  const knownMinutes = playedRows.reduce((sum, row) => (
    isKnownNonNegativeNumber(row.minutes) ? sum + Number(row.minutes) : sum
  ), 0);
  const possibleMinutes = playedRows.reduce((sum, row) => sum + getStatsMatchDurationMinutes({
    ...row.match,
    statsPlayerData: {
      ...(row.match?.statsPlayerData && typeof row.match.statsPlayerData === 'object' ? row.match.statsPlayerData : {}),
      __dossierPlayer: { minutes: row.minutes },
    },
  }), 0);
  const goals = allRows.reduce((sum, row) => sum + rows(row.goals).length, 0);
  const assists = allRows.reduce((sum, row) => sum + rows(row.assists).length, 0);
  const yellow = summarizeNullableCount(allRows, 'yellow');
  const red = summarizeNullableCount(allRows.map((row) => ({ ...row, red: row.red === null ? null : row.red ? 1 : 0 })), 'red');
  const injured = summarizeNullableCount(allRows.map((row) => ({ ...row, injured: row.injured === null ? null : row.injured ? 1 : 0 })), 'injured');
  const minutes = minutesComplete ? knownMinutes : null;
  const participation = minutesComplete && possibleMinutes > 0
    ? Math.round((knownMinutes / possibleMinutes) * 100)
    : null;

  return {
    rows: allRows,
    played: playedRows.length,
    starts,
    knownBenchEntries,
    benchEntries: rolesComplete ? knownBenchEntries : null,
    rolesComplete,
    minutes,
    knownMinutes,
    minutesComplete,
    possibleMinutes,
    participation,
    goals,
    assists,
    yellow: yellow.value,
    knownYellow: yellow.knownValue,
    yellowComplete: yellow.complete,
    red: red.value,
    knownRed: red.knownValue,
    redComplete: red.complete,
    injured: injured.value,
    knownInjured: injured.knownValue,
    injuredComplete: injured.complete,
    goalsPer90: calculatePlayerDossierPer90(goals, minutes),
    assistsPer90: calculatePlayerDossierPer90(assists, minutes),
  };
};

export const buildPlayerDossierCompetitionBreakdown = ({ matchRows = [], getCompetition } = {}) => {
  const grouped = new Map();
  rows(matchRows).forEach((row) => {
    const competition = getCompetition(row.match);
    const key = competition.key || competition.label || 'sin-competicion';
    const current = grouped.get(key) || { competition, rows: [] };
    current.rows.push(row);
    grouped.set(key, current);
  });

  return [...grouped.entries()].flatMap(([key, group]) => {
    const aggregate = buildPlayerDossierAggregate(group.rows);
    const hasOfficialContribution = aggregate.played > 0 || aggregate.goals > 0 || aggregate.assists > 0;
    if (!hasOfficialContribution) return [];
    return [{
      key,
      label: group.competition.label || 'Sin datos',
      season: group.competition.season || '',
      logoUrl: group.competition.logoUrl || '',
      icon: group.competition.icon || '',
      played: aggregate.played,
      starts: aggregate.starts,
      minutes: aggregate.minutes,
      knownMinutes: aggregate.knownMinutes,
      minutesComplete: aggregate.minutesComplete,
      minutesPerMatch: aggregate.minutesComplete && aggregate.played > 0
        ? Math.round(aggregate.knownMinutes / aggregate.played)
        : null,
      goals: aggregate.goals,
      assists: aggregate.assists,
      goalContributions: aggregate.goals + aggregate.assists,
    }];
  });
};
