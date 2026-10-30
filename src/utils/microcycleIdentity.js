import { calendarDateKey, calendarWeekDays } from './teamCalendar.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const dayNumber = (key) => Date.parse(`${key}T00:00:00Z`) / DAY_MS;

export function seasonMicrocycleForDate(season, date) {
  const start = calendarDateKey(season?.starts_on);
  const end = calendarDateKey(season?.ends_on);
  const target = calendarDateKey(date);
  if (!start || !end || !target || start > end || target < start || target > end) return null;
  const firstMonday = calendarWeekDays(start)[0];
  const days = calendarWeekDays(target);
  if (!firstMonday || days.length !== 7) return null;
  const number = Math.floor((dayNumber(days[0]) - dayNumber(firstMonday)) / 7) + 1;
  return { number, label: `MC ${String(number).padStart(2, '0')}`,
    monday: days[0], sunday: days[6], days };
}

export function seasonMicrocycles(season) {
  const start = calendarDateKey(season?.starts_on);
  const end = calendarDateKey(season?.ends_on);
  if (!start || !end || start > end) return [];
  const firstMonday = calendarWeekDays(start)[0];
  const weeks = [];
  for (let monday = firstMonday; monday <= end;) {
    const dateInSeason = monday < start ? start : monday;
    const week = seasonMicrocycleForDate(season, dateInSeason);
    if (!week || week.monday !== monday) break;
    weeks.push(week);
    monday = new Date((dayNumber(monday) + 7) * DAY_MS).toISOString().slice(0, 10);
  }
  return weeks;
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
