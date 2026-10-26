import { normalizeCompetitionKey } from './competitionFilters.js';
import { isPlannedMicrocycle } from './plannedSessions.js';
import { getMatchOutcome, getMatchScore, getMatchStatus } from './matchStatus.js';

export const calendarDateKey = (value) => {
  const text = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? text : '';
};

export const calendarTime = (value) => {
  const text = String(value || '').trim();
  return /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(text) ? text.slice(0, 5) : '';
};

export const calendarLocalDateKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const calendarLocalDate = (key) => {
  if (!calendarDateKey(key)) return null;
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
};

export const calendarWeekDays = (referenceKey) => {
  const date = calendarLocalDate(referenceKey);
  if (!date) return [];
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(date);
    day.setDate(date.getDate() + offset);
    return calendarLocalDateKey(day);
  });
};

export const shiftCalendarWeek = (referenceKey, weeks) => {
  const date = calendarLocalDate(referenceKey);
  if (!date || !Number.isInteger(weeks)) return '';
  date.setDate(date.getDate() + weeks * 7);
  return calendarLocalDateKey(date);
};

export const calendarWeekSummary = (events, days) => {
  const daySet = new Set(days);
  const weekly = events.filter((event) => daySet.has(event.date));
  const sessions = [...new Map(weekly.filter((event) => event.kind === 'training')
    .map((event) => [event.id, event])).values()];
  const matches = [...new Set(weekly.filter((event) => event.kind !== 'training').map((event) => event.id))];
  const known = sessions.filter((event) => event.durationKnown);
  return { sessions: sessions.length, matches: matches.length,
    activeDays: new Set(weekly.map((event) => event.date)).size,
    durationMinutes: known.reduce((sum, event) => sum + event.durationMinutes, 0),
    durationCoverage: !sessions.length ? 'none' : known.length === sessions.length ? 'complete' : 'partial' };
};

export const calendarWeeklyCountLabel = ({ sessions, matches, activeDays }) =>
  `${sessions} ${sessions === 1 ? 'sesión' : 'sesiones'} · ` +
  `${matches} ${matches === 1 ? 'partido' : 'partidos'} · ` +
  `${activeDays} ${activeDays === 1 ? 'día' : 'días'} con actividad`;

export const calendarMatchKind = (match) => {
  const key = normalizeCompetitionKey(match);
  if (key === 'league') return 'league';
  if (key === 'copa_rfef') return 'cup';
  if (key === 'friendly') return 'friendly';
  return 'other';
};

export const buildTeamCalendarEvents = (sessions = [], matches = [], teams = []) => {
  const events = [];
  const seenSessions = new Set();
  for (const session of sessions) {
    const id = String(session.id || '');
    const date = calendarDateKey(session.session_date);
    if (!id || !date || seenSessions.has(id)) continue;
    seenSessions.add(id);
    const title = session.planning_state === 'confirmed' && session.session_number != null
      ? `Sesión nº ${session.session_number}` : 'Borrador de sesión';
    const durationKnown = session.durationKnown === true &&
      Number.isFinite(Number(session.total_minutes)) && Number(session.total_minutes) > 0;
    events.push({ id, kind: 'training', date, time: calendarTime(session.starts_at), title,
      microcycle: isPlannedMicrocycle(session.morphology_pattern) ? session.morphology_pattern : '',
      durationKnown,
      durationMinutes: durationKnown ? Number(session.total_minutes) : null,
      objective: String(session.objectives || '').trim(),
      contextId: session.club_team_season_id, label: 'Entrenamiento' });
  }
  const seenMatches = new Set();
  for (const match of matches) {
    const id = String(match.id || '');
    const date = calendarDateKey(match.date);
    if (!id || !date || seenMatches.has(id)) continue;
    seenMatches.add(id);
    const team = teams.find((row) => row.id === (match.equipoRivalId || match.equipo_rival_id));
    const kind = calendarMatchKind(match);
    const label = { league: 'Liga', cup: 'Copa', friendly: 'Amistoso', other: 'Otro partido' }[kind];
    const status = getMatchStatus(match);
    const venue = match.isHome ?? match.is_home;
    const candidateScore = status === 'played' ? getMatchScore(match) : null;
    const explicitlyFinished = ['finalizado', 'jugado', 'played', 'finished', 'cerrado', 'closed', 'revisado', 'reviewed']
      .includes(String(match.status || '').trim().toLocaleLowerCase('es'));
    const score = candidateScore && (candidateScore.source !== 'official_goal_events' || explicitlyFinished) &&
      (typeof venue === 'boolean' ||
      ['home_away_score', 'stored_result'].includes(candidateScore.source)) ? candidateScore : null;
    const outcome = score && typeof venue === 'boolean' ? getMatchOutcome(match) : null;
    events.push({ id, kind, date, time: calendarTime(match.time), label,
      title: match.opponent || 'Rival pendiente', opponent: match.opponent || 'Rival pendiente',
      crest: team?.crest || match.opponentCrest || match.opponent_crest || '',
      venue, status, outcome,
      score: score ? `${score.home}–${score.away}` : '', match });
  }
  return events.sort((a, b) => a.date.localeCompare(b.date)
    || (a.time || '99:99').localeCompare(b.time || '99:99')
    || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
};

export const calendarMonthDays = (year, monthIndex) => {
  const first = new Date(year, monthIndex, 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(year, monthIndex + 1, 0).getDate();
  return [...Array(offset).fill(null), ...Array.from({ length: days }, (_, index) =>
    `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`)];
};
