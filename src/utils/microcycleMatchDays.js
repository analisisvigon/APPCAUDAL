import { calendarDateKey } from './teamCalendar.js';
import { getMatchStatus } from './matchStatus.js';

// A reference is useful for the training week only near the recorded match date.
export const MD_REFERENCE_WINDOW_DAYS = 7;
const excludedStatuses = new Set(['cancelled', 'postponed', 'suspended']);
const dayNumber = (key) => Date.parse(`${key}T00:00:00Z`) / 86400000;

export function plannedMdReferences(days, matches, contextId, season) {
  const result = new Map((days || []).map((day) => [day, []]));
  const start = calendarDateKey(season?.starts_on);
  const end = calendarDateKey(season?.ends_on);
  if (!contextId || !Array.isArray(days) || !Array.isArray(matches) ||
    !start || !end || start > end) return result;
  const seen = new Set();
  const eligible = matches.flatMap((match) => {
    const id = String(match?.id || '');
    const date = calendarDateKey(match?.date);
    const matchContext = match?.clubTeamSeasonId || match?.club_team_season_id;
    if (!id || seen.has(id) || matchContext !== contextId || !date ||
      date < start || date > end ||
      excludedStatuses.has(getMatchStatus(match))) return [];
    seen.add(id);
    return [{ id, date, opponent: String(match.opponent || '').trim() || 'Rival pendiente' }];
  });
  for (const day of days) {
    if (!calendarDateKey(day) || day < start || day > end) continue;
    const target = dayNumber(day);
    const nearby = eligible.map((match) => ({ ...match, offset: target - dayNumber(match.date) }))
      .filter((match) => Math.abs(match.offset) <= MD_REFERENCE_WINDOW_DAYS);
    const prior = Math.min(...nearby.filter((match) => match.offset > 0).map((match) => match.offset));
    const next = Math.min(...nearby.filter((match) => match.offset < 0).map((match) => -match.offset));
    const references = nearby.filter((match) => match.offset === 0 || match.offset === prior || -match.offset === next)
      .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id))
      .map(({ id, date, opponent, offset }) => ({ matchId: id, matchDate: date, opponent,
        label: offset === 0 ? 'MD' : offset > 0 ? `MD+${offset}` : `MD${offset}` }));
    result.set(day, references);
  }
  return result;
}
