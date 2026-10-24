import { getMatchStatus, isMatchScheduledInFuture, parseLocalMatchDate } from '../utils/matchStatus.js';
import { normalizeCompetitionKey } from '../utils/competitionFilters.js';
import { OWN_CLUB_IDENTITY } from '../constants/clubIdentity.js';

const trim = (value) => String(value ?? '').trim();
const fold = (value) => trim(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const KNOWN_LEGACY_TYPES = new Map([
  ['liga', 'league'], ['league', 'league'], ['copa', 'cup'],
  ['copa rfef', 'copa_rfef'], ['amistoso', 'friendly'], ['amistosos', 'friendly'],
  ['playoff', 'playoff'], ['play-off', 'playoff'],
]);
const LABELS = { league: 'Liga', cup: 'Copa', copa_rfef: 'Copa RFEF',
  friendly: 'Amistosos', playoff: 'Playoff' };
const METRICS = Object.freeze([
  ['possession', 'Posesión', '%', 100],
  ['shots', 'Tiros', '', null],
  ['shots_on_target', 'Tiros a puerta', '', null],
  ['corners', 'Córners', '', null],
  ['yellow_cards', 'Tarjetas amarillas', '', null],
  ['red_cards', 'Tarjetas rojas', '', null],
]);
export const SEASON_MEMORY_METRICS = METRICS;

export function resolveSeasonMemoryContexts({ membership, links = [], seasons = [], teams = [], ownTeams = [] }) {
  if (!membership?.club_id || !['owner', 'admin', 'staff'].includes(membership.role) || membership.is_active !== true) {
    throw new Error('No se pudo acreditar el acceso del cuerpo técnico.');
  }
  const clubId = membership.club_id;
  const own = ownTeams.filter((row) => row.team_kind === 'own' && trim(row.name));
  if (own.length !== 1) throw new Error('No se pudo identificar un único equipo propio.');
  const team = teams.find((row) => row.id === own[0].id && row.club_id === clubId);
  if (!team) throw new Error('El equipo propio no tiene vínculo canónico con el club autorizado.');
  const seasonById = new Map(seasons.filter((row) => row.club_id === clubId).map((row) => [row.id, row]));
  const contexts = links.filter((row) => row.club_id === clubId && row.team_id === team.id)
    .map((row) => {
      const season = seasonById.get(row.season_id);
      if (!season || !trim(season.label) || !parseLocalMatchDate(season.starts_on)
        || !parseLocalMatchDate(season.ends_on) || season.starts_on > season.ends_on) {
        throw new Error('Hay un CTS propio con temporada incompleta o incompatible.');
      }
      return { id: row.id, clubId, teamId: team.id, teamName: own[0].name,
        displayName: fold(own[0].name) === fold(OWN_CLUB_IDENTITY.name)
          ? OWN_CLUB_IDENTITY.shortName : own[0].name,
        crest: own[0].crest, seasonId: season.id, seasonLabel: season.label,
        startsOn: season.starts_on, endsOn: season.ends_on,
        active: season.is_active === true, status: season.status };
    });
  if (new Set(contexts.map((row) => row.id)).size !== contexts.length) throw new Error('CTS propio duplicado.');
  return contexts.sort((a, b) => b.startsOn.localeCompare(a.startsOn));
}

function competitionKind(value) {
  const key = fold(value);
  if (['league', 'liga'].includes(key)) return 'league';
  if (key === 'friendly' || key === 'amistoso' || key === 'amistosos') return 'friendly';
  if (key.includes('copa') || key.includes('cup')) return 'cup';
  return 'other';
}

function seasonToken(value) {
  const match = trim(value).match(/^(\d{4})\s*[/\-]\s*(\d{2}|\d{4})$/);
  if (!match) return null;
  const first = Number(match[1]);
  const second = Number(match[2].length === 2 ? `${String(first).slice(0, 2)}${match[2]}` : match[2]);
  return `${first}-${second}`;
}

export function resolveSeasonMemoryCompetition(match, catalog = [], clubId, seasonLabel = '') {
  const explicitId = trim(match.competition_id);
  const explicitKey = trim(match.competition_key);
  const catalogItem = explicitId ? catalog.find((row) => row.id === explicitId) : null;
  if (explicitId && (!catalogItem || (catalogItem.club_id && catalogItem.club_id !== clubId))) {
    return { conflict: 'Identificador de competición sin catálogo autorizado' };
  }
  if (catalogItem) {
    if (seasonToken(catalogItem.season) && seasonToken(seasonLabel)
      && seasonToken(catalogItem.season) !== seasonToken(seasonLabel)) {
      return { conflict: 'Competición catalogada en otra temporada' };
    }
    if (explicitKey && normalizeCompetitionKey({ competition_key: explicitKey })
      !== normalizeCompetitionKey({ competition_key: catalogItem.key })) {
      return { conflict: 'Identificadores de competición discrepantes' };
    }
    return { id: `catalog:${catalogItem.id}`, name: trim(catalogItem.name),
      kind: competitionKind(catalogItem.key) === 'other'
        ? competitionKind(catalogItem.competition_type) : competitionKind(catalogItem.key),
      source: 'competition_id' };
  }
  if (explicitKey) {
    const key = normalizeCompetitionKey({ competition_key: explicitKey });
    const hits = catalog.filter((row) => (!row.club_id || row.club_id === clubId)
      && (!seasonToken(row.season) || !seasonToken(seasonLabel)
        || seasonToken(row.season) === seasonToken(seasonLabel))
      && normalizeCompetitionKey({ competition_key: row.key }) === key);
    if (hits.length > 1) return { conflict: 'Clave de competición no unívoca' };
    if (hits.length === 1) return { id: `catalog:${hits[0].id}`, name: trim(hits[0].name),
      kind: competitionKind(hits[0].key) === 'other'
        ? competitionKind(hits[0].competition_type) : competitionKind(hits[0].key), source: 'competition_key' };
    return { id: `key:${key}`, name: LABELS[key] || explicitKey,
      kind: competitionKind(key), source: 'competition_key' };
  }
  const legacyKey = KNOWN_LEGACY_TYPES.get(fold(match.type));
  if (legacyKey) {
    const candidates = catalog.filter((row) => (!row.club_id || row.club_id === clubId)
      && (!seasonToken(row.season) || !seasonToken(seasonLabel)
        || seasonToken(row.season) === seasonToken(seasonLabel))
      && (legacyKey === 'cup' ? competitionKind(row.key) === 'cup'
        : normalizeCompetitionKey({ competition_key: row.key }) === legacyKey));
    if (candidates.length > 1) return { conflict: 'Tipo legacy no unívoco en el catálogo' };
    if (candidates.length === 1) return { id: `catalog:${candidates[0].id}`,
      name: trim(candidates[0].name), kind: competitionKind(candidates[0].key), source: 'type' };
    return { id: `legacy:${legacyKey}`, name: LABELS[legacyKey],
      kind: competitionKind(legacyKey), source: 'type' };
  }
  return { id: 'unknown', name: 'Competición sin identificar', kind: 'other', source: 'unknown' };
}

const scoreNumber = (value) => /^\d+$/.test(trim(value)) ? Number(value) : null;
function scoreForMatch(match) {
  if (typeof match.is_home !== 'boolean') return null;
  const home = scoreNumber(match.home_score);
  const away = scoreNumber(match.away_score);
  const own = scoreNumber(match.goals_for);
  const rival = scoreNumber(match.goals_against);
  const hasHomePair = home !== null && away !== null;
  const hasOwnPair = own !== null && rival !== null;
  if (!hasHomePair && !hasOwnPair) return null;
  const goalsFor = hasHomePair ? (match.is_home ? home : away) : own;
  const goalsAgainst = hasHomePair ? (match.is_home ? away : home) : rival;
  if (hasOwnPair && (own !== goalsFor || rival !== goalsAgainst)) return null;
  return { goalsFor, goalsAgainst, home: hasHomePair ? home : (match.is_home ? own : rival),
    away: hasHomePair ? away : (match.is_home ? rival : own) };
}

function metricValue(value, max) {
  const raw = trim(value).replace(max === 100 ? /%$/ : /$^/, '');
  if (!raw || !/^\d+(?:[.,]\d+)?$/.test(raw)) return null;
  const number = Number(raw.replace(',', '.'));
  if (!Number.isFinite(number) || number < 0 || (max !== null && number > max)
    || (max === null && !Number.isInteger(number))) return null;
  return number;
}

function newTotals() {
  return { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0,
    homePlayed: 0, awayPlayed: 0, homeWins: 0, awayWins: 0 };
}
function addResult(target, match) {
  if (!match.result) return;
  target.played++;
  target[{ win: 'wins', draw: 'draws', loss: 'losses' }[match.outcome]]++;
  target.goalsFor += match.result.goalsFor;
  target.goalsAgainst += match.result.goalsAgainst;
  target[match.isHome ? 'homePlayed' : 'awayPlayed']++;
  if (match.outcome === 'win') target[match.isHome ? 'homeWins' : 'awayWins']++;
}
function finalize(target) {
  target.goalDifference = target.goalsFor - target.goalsAgainst;
  target.winRate = target.played ? target.wins / target.played : 0;
  return target;
}
function aggregateMetrics(matches) {
  return METRICS.map(([key, label, unit, max]) => {
    const values = matches.filter((match) => match.result)
      .map((match) => metricValue(match.raw[key], max)).filter((value) => value !== null);
    return { key, label, unit, covered: values.length,
      eligible: matches.filter((match) => match.result).length,
      average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null };
  });
}

export function buildRealSeasonMemory({ context, matches = [], catalog = [], unlinkedCount = 0,
  competitionId = 'all', now = new Date() }) {
  if (!context?.id || !context?.teamId || !context?.clubId || !context?.seasonId) {
    throw new Error('Temporada y equipo no acreditados.');
  }
  const seen = new Set();
  const excluded = { unlinked: unlinkedCount, otherContext: 0, invalidDate: 0,
    duplicate: 0, competitionConflict: 0, teamContradiction: 0 };
  const accepted = [];
  for (const raw of matches) {
    if (raw.club_team_season_id !== context.id) { excluded.otherContext++; continue; }
    if (!raw.id || seen.has(raw.id)) { excluded.duplicate++; continue; }
    seen.add(raw.id);
    if (!parseLocalMatchDate(raw.date) || raw.date < context.startsOn || raw.date > context.endsOn) {
      excluded.invalidDate++; continue;
    }
    // El vínculo CTS acredita pertenencia. Un nombre propio antiguo contradice
    // la identidad actual y se excluye; el nombre jamás sirve como prueba positiva.
    const storedOwnName = raw.is_home === true ? raw.home_team : raw.is_home === false ? raw.away_team : '';
    if (typeof raw.is_home !== 'boolean' || !trim(storedOwnName)
      || fold(storedOwnName) !== fold(context.teamName)) {
      excluded.teamContradiction++; continue;
    }
    const competition = resolveSeasonMemoryCompetition(raw, catalog, context.clubId,
      context.seasonLabel);
    if (competition.conflict) { excluded.competitionConflict++; continue; }
    const status = getMatchStatus(raw, now);
    const result = scoreForMatch(raw);
    const finalStatus = ['finalizado', 'jugado', 'played', 'finished', 'cerrado', 'closed', 'revisado', 'reviewed']
      .includes(fold(raw.status));
    const played = status === 'played' && finalStatus && !isMatchScheduledInFuture(raw, now)
      && result !== null;
    accepted.push({ id: raw.id, date: raw.date, time: raw.time, round: raw.round,
      opponent: trim(raw.opponent) || 'Rival no registrado', isHome: raw.is_home,
      competition, status: played ? 'played' : status === 'played' ? 'pending_result' : status,
      result: played ? result : null,
      outcome: played ? (result.goalsFor > result.goalsAgainst ? 'win'
        : result.goalsFor < result.goalsAgainst ? 'loss' : 'draw') : null, raw });
  }
  accepted.sort((a, b) => a.date.localeCompare(b.date) || trim(a.time).localeCompare(trim(b.time))
    || a.id.localeCompare(b.id));
  const ids = [...new Set(accepted.map((match) => match.competition.id))];
  if (competitionId !== 'all' && !ids.includes(competitionId)) throw new Error('Competición no disponible.');
  const selected = competitionId === 'all' ? accepted : accepted.filter((match) => match.competition.id === competitionId);
  const competitions = [...new Set(selected.map((match) => match.competition.id))].map((id) => {
    const rows = selected.filter((match) => match.competition.id === id);
    const totals = finalize(rows.reduce((acc, match) => { addResult(acc, match); return acc; }, newTotals()));
    return { ...rows[0].competition, matches: rows, verified: rows.length, totals,
      metrics: aggregateMetrics(rows) };
  });
  const totals = finalize(competitions.reduce((acc, competition) => {
    Object.keys(newTotals()).forEach((key) => { acc[key] += competition.totals[key]; });
    return acc;
  }, newTotals()));
  return { context, matches: selected, competitions, totals,
    metrics: aggregateMetrics(selected), verified: selected.length,
    allVerified: accepted.length, excluded,
    excludedTotal: Object.values(excluded).reduce((a, b) => a + b, 0),
    selection: competitionId === 'all' ? 'season' : 'competition', generatedAt: now };
}
