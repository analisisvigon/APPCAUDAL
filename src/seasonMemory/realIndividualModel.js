import { getStatsMatchDurationMinutes } from '../utils/statsWorkingMinutes.js';

const uuid = (value) => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(String(value || ''));
const clean = (value) => String(value ?? '').trim();
const unique = (rows) => [...new Map(rows.filter((row) => row?.id).map((row) => [row.id, row])).values()];
const nonNegative = (value) => value !== null && value !== undefined && clean(value) !== ''
  && /^\d+$/.test(clean(value)) ? Number(value) : null;
const metric = (rows, key) => {
  const values = rows.map((row) => row[key]);
  const known = values.filter((value) => value !== null).reduce((sum, value) => sum + value, 0);
  return { value: values.every((value) => value !== null) ? known : null, known,
    covered: values.filter((value) => value !== null).length, eligible: rows.length };
};
const addTo = (map, key, row) => map.set(key, [...(map.get(key) || []), row]);

function contribution(match, player, evidence, { goalsComplete, assistsComplete }) {
  const { stats, slots, substitutions, goals } = evidence;
  const started = slots.length > 0 || stats?.role === 'Titular';
  const exits = substitutions.filter((row) => row.outgoing_jugador_id === player.id);
  const entries = substitutions.filter((row) => row.incoming_jugador_id === player.id);
  const duration = getStatsMatchDurationMinutes(match.raw);
  const explicit = nonNegative(stats?.minutes);
  const goalsScored = goals.filter((row) => row.scorer_id === player.id).length;
  const assistsMade = goals.filter((row) => row.assistant_id === player.id).length;
  const participated = started || explicit > 0 || exits.length > 0 || entries.length > 0
    || goalsScored > 0 || assistsMade > 0;
  if (!participated) return null;
  const validExit = exits.length === 1 && Number.isInteger(exits[0].minute)
    && exits[0].minute > 0 && exits[0].minute <= duration;
  const validEntry = entries.length === 1 && Number.isInteger(entries[0].minute)
    && entries[0].minute >= 0 && entries[0].minute < duration;
  const knownSubstitute = stats?.role === 'Suplente';
  let minutes = explicit !== null && explicit <= 180 ? explicit : null;
  const minuteConflict = started && validExit && minutes !== null && minutes !== exits[0].minute;
  if (minuteConflict) minutes = null;
  if (minutes === null && !minuteConflict && started && validExit && !entries.length) minutes = exits[0].minute;
  if (minutes === null && !started && validEntry && !exits.length) minutes = duration - entries[0].minute;
  const yellowCount = nonNegative(stats?.yellow_count);
  const yellow = yellowCount !== null ? yellowCount
    : typeof stats?.yellow === 'boolean' ? Number(stats.yellow) : null;
  const red = typeof stats?.red === 'boolean' ? Number(stats.red) : null;
  return { matchId: match.id, competitionId: match.competition.id, date: match.date,
    played: 1,
    started: started ? 1 : knownSubstitute || validEntry ? 0 : null,
    bench: started ? 0 : knownSubstitute || validEntry ? 1 : null,
    minutes, minuteConflict, goals: goalsComplete ? goalsScored : null,
    assists: assistsComplete ? assistsMade : null, knownGoals: goalsScored,
    knownAssists: assistsMade, yellow, red };
}

function summarize(player, contributions) {
  const minutes = metric(contributions, 'minutes');
  const goals = metric(contributions, 'goals');
  const assists = metric(contributions, 'assists');
  const yellow = metric(contributions, 'yellow');
  const red = metric(contributions, 'red');
  const starts = metric(contributions, 'started');
  const bench = metric(contributions, 'bench');
  return { id: player.id, name: clean(player.name) || 'Jugador sin nombre',
    number: player.number, position: clean(player.position),
    retired: player.active_in_squad === false || player.retired === true,
    played: contributions.length, starts, bench,
    minutes, goals, assists, yellow, red, contributions };
}

const rowOrder = (a, b) => b.played - a.played || b.minutes.known - a.minutes.known
  || a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id);
export function rankIndividuals(rows, field, limit = 6) {
  return rows.filter((row) => row[field]?.value !== null && row[field].value > 0)
    .sort((a, b) => b[field].value - a[field].value
      || a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id)).slice(0, limit);
}

export function buildRealIndividualMemory({ context, matches = [], competitions = [], source = {} }) {
  const played = matches.filter((match) => match.result);
  const byMatch = new Map(played.map((match) => [match.id, match]));
  const coverage = { unattributedStats: 0, conflictingStats: 0, unattributedGoals: 0,
    incompleteGoalMatches: 0, unattributedSlots: 0, invalidPlayers: 0, minuteConflicts: 0 };
  const players = new Map();
  for (const player of unique(source.players || [])) {
    if (!uuid(player.id) || !player.stage || player.stage.id !== player.membership_id
      || player.stage.team_id !== context.teamId || player.stage.player_id !== player.global_player_id) {
      coverage.invalidPlayers++; continue;
    }
    players.set(player.id, player);
  }
  const stats = new Map();
  for (const row of unique(source.stats || [])) {
    if (!byMatch.has(row.partido_id)) continue;
    if (!players.has(row.jugador_id)) { coverage.unattributedStats++; continue; }
    addTo(stats, `${row.partido_id}:${row.jugador_id}`, row);
  }
  const slots = new Map();
  for (const row of unique(source.slots || [])) {
    if (!byMatch.has(row.partido_id) || row.scope !== 'stats') continue;
    if (!players.has(row.jugador_id)) { coverage.unattributedSlots++; continue; }
    addTo(slots, `${row.partido_id}:${row.jugador_id}`, row);
  }
  const substitutions = new Map();
  for (const row of unique(source.substitutions || [])) {
    if (byMatch.has(row.partido_id)) addTo(substitutions, row.partido_id, row);
  }
  const goals = new Map();
  for (const row of unique(source.goals || [])) {
    if (byMatch.has(row.partido_id)) addTo(goals, row.partido_id, row);
  }
  const contributions = new Map();
  for (const match of played) {
    const events = goals.get(match.id) || [];
    const goalCount = events.filter((row) => row.type === 'Gol a favor').length;
    const againstCount = events.filter((row) => row.type === 'Gol en contra').length;
    const ledgerComplete = goalCount === match.result.goalsFor
      && againstCount === match.result.goalsAgainst
      && events.every((row) => ['Gol a favor', 'Gol en contra'].includes(row.type));
    if (!ledgerComplete) coverage.incompleteGoalMatches++;
    const ownGoals = events.filter((row) => row.type === 'Gol a favor' && row.is_own_goal !== true);
    const goalsComplete = ledgerComplete && ownGoals.every((row) => row.scorer_id
      && players.has(row.scorer_id));
    const assistsComplete = ledgerComplete && ownGoals.every((row) =>
      row.assistant_id ? players.has(row.assistant_id) : !clean(row.assistant));
    for (const event of ownGoals) {
      if (!event.scorer_id || !players.has(event.scorer_id)) coverage.unattributedGoals++;
      if (event.assistant_id ? !players.has(event.assistant_id) : Boolean(clean(event.assistant))) {
        coverage.unattributedGoals++;
      }
    }
    for (const player of players.values()) {
      const key = `${match.id}:${player.id}`;
      const candidates = stats.get(key) || [];
      if (candidates.length > 1) coverage.conflictingStats++;
      const contributionRow = contribution(match, player, {
        stats: candidates.length === 1 ? candidates[0] : null,
        slots: slots.get(key) || [], substitutions: substitutions.get(match.id) || [], goals: ownGoals,
      }, { goalsComplete, assistsComplete });
      if (contributionRow) {
        if (contributionRow.minuteConflict) coverage.minuteConflicts++;
        addTo(contributions, player.id, contributionRow);
      }
    }
  }
  const rows = [...players.values()].flatMap((player) => {
    const own = contributions.get(player.id) || [];
    return own.length ? [summarize(player, own)] : [];
  }).sort(rowOrder);
  const byCompetition = competitions.map((competition) => ({ id: competition.id,
    name: competition.name, kind: competition.kind,
    rows: rows.flatMap((row) => {
      const own = row.contributions.filter((item) => item.competitionId === competition.id);
      return own.length ? [summarize(row, own)] : [];
    }).sort(rowOrder) }));
  return { rows, byCompetition, coverage, playedMatches: played.length,
    totals: { players: rows.length, starts: rows.reduce((n, row) => n + row.starts.known, 0),
      minutes: rows.reduce((n, row) => n + row.minutes.known, 0),
      attributedGoals: rows.reduce((n, row) => n + row.goals.known, 0),
      attributedAssists: rows.reduce((n, row) => n + row.assists.known, 0) } };
}
