import { calendarDateKey, calendarWeekDays } from './teamCalendar.js';

export function seasonWeekForDate(season, date) {
  const start = calendarDateKey(season?.starts_on);
  const end = calendarDateKey(season?.ends_on);
  const target = calendarDateKey(date);
  if (!start || !end || !target || start > end || target < start || target > end) return null;
  const days = calendarWeekDays(target);
  return days.length === 7 ? { monday: days[0], sunday: days[6], days } : null;
}

// Solo las sesiones con MC guardado crean una entrada navegable.
export function assignedMicrocycles(sessions, contextId, season) {
  const start = calendarDateKey(season?.starts_on);
  const end = calendarDateKey(season?.ends_on);
  const byMonday = new Map();
  for (const session of sessions || []) {
    const date = calendarDateKey(session.session_date);
    const number = Number(session.mc_number);
    if (session.club_team_season_id !== contextId || !date || date < start || date > end ||
        !Number.isInteger(number) || number < 1 || number > 9999) continue;
    const days = calendarWeekDays(date);
    const current = byMonday.get(days[0]);
    if (current && current.number !== number)
      throw new Error('Hay números MC contradictorios en una misma semana.');
    byMonday.set(days[0], { number, label: `MC ${number}`, monday: days[0], sunday: days[6], days });
  }
  const result = [...byMonday.values()].sort((a, b) => a.monday.localeCompare(b.monday));
  if (new Set(result.map((week) => week.number)).size !== result.length)
    throw new Error('Un mismo número MC figura en semanas distintas.');
  return result;
}

export function clampMicrocycleDate(season, date) {
  const start = calendarDateKey(season?.starts_on);
  const end = calendarDateKey(season?.ends_on);
  const target = calendarDateKey(date);
  if (!start || !end || start > end) return target;
  if (!target || target < start) return start;
  return target > end ? end : target;
}

export function microcycleRangeLabel(week, includeYear = false) {
  if (!week?.monday || !week?.sunday) return '';
  const start = new Date(`${week.monday}T12:00:00`);
  const end = new Date(`${week.sunday}T12:00:00`);
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  const first = start.toLocaleDateString('es-ES', { day: 'numeric', month: 'short',
    ...(startYear !== endYear ? { year: 'numeric' } : {}) });
  const last = end.toLocaleDateString('es-ES', { day: 'numeric', month: 'short',
    ...(includeYear || startYear !== endYear ? { year: 'numeric' } : {}) });
  return `${first} – ${last}`;
}
