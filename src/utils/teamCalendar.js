import { normalizeCompetitionKey } from './competitionFilters.js';

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
    events.push({ id, kind: 'training', date, time: calendarTime(session.starts_at),
      title: session.planning_state === 'confirmed' && session.session_number != null
        ? `Sesión nº ${session.session_number}` : 'Borrador de sesión',
      contextId: session.club_team_season_id, label: 'Entrenamiento' });
  }
  for (const match of matches) {
    const id = String(match.id || '');
    const date = calendarDateKey(match.date);
    if (!id || !date) continue;
    const team = teams.find((row) => row.id === (match.equipoRivalId || match.equipo_rival_id));
    const kind = calendarMatchKind(match);
    const label = { league: 'Liga', cup: 'Copa', friendly: 'Amistoso', other: 'Otro partido' }[kind];
    events.push({ id, kind, date, time: calendarTime(match.time), label,
      title: match.opponent || 'Rival pendiente', opponent: match.opponent || 'Rival pendiente',
      crest: team?.crest || match.opponentCrest || match.opponent_crest || '',
      venue: match.isHome ?? match.is_home, match });
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
