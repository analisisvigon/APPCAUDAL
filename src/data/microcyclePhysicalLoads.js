import { aggregatePerformanceMetricPoints } from '../utils/performanceLoad.js';
import { calendarWeekDays } from '../utils/teamCalendar.js';

const numeric = (value) => value === null || value === undefined || value === ''
  ? null : Number.isFinite(Number(value)) ? Number(value) : null;

export async function loadMicrocyclePhysicalLoads(client, contextId, days) {
  if (!contextId || !Array.isArray(days) || days.length !== 7
    || JSON.stringify(calendarWeekDays(days[0])) !== JSON.stringify(days)) {
    throw new Error('Selecciona un equipo, una temporada y una semana válidos.');
  }
  const response = await client.rpc('get_microcycle_team_loads_4a', {
    p_club_team_season_id: contextId,
    p_week_starts_on: days[0],
  });
  if (response?.error) throw response.error;
  if (!Array.isArray(response?.data)) throw new Error('La consulta física no devolvió una lista válida.');
  const seen = new Set();
  for (const row of response.data) {
    if (!row?.training_session_id || !days.includes(row.session_date)
      || seen.has(row.training_session_id) || typeof row.has_team_metrics !== 'boolean') {
      throw new Error('La consulta física devolvió sesiones incompatibles con el microciclo.');
    }
    seen.add(row.training_session_id);
  }
  return response.data;
}

export function summarizeMicrocyclePhysicalLoads(rows, days, metricConfig) {
  const sessions = Array.isArray(rows) ? rows : [];
  const points = sessions.map((row) => {
    const record = {
      session: { actual_duration_minutes: row.actual_duration_minutes },
      metrics: row.has_team_metrics ? row : null,
    };
    const value = numeric(metricConfig.valueFromRecord(record));
    const weight = metricConfig.weightFromRecord?.(record) ?? null;
    return { date: row.session_date, value, weight: numeric(weight),
      hasData: value !== null, sessionType: row.session_type };
  });
  const daily = days.map((date) => {
    const sameDay = points.filter((point) => point.date === date);
    const covered = sameDay.filter((point) => point.hasData).length;
    return { date, sessionCount: sameDay.length, covered,
      value: aggregatePerformanceMetricPoints(sameDay, metricConfig),
      partial: covered > 0 && covered < sameDay.length };
  });
  const covered = points.filter((point) => point.hasData).length;
  return { daily, sessionCount: sessions.length, covered,
    trainingCount: points.filter((point) => point.sessionType !== 'match').length,
    matchCount: points.filter((point) => point.sessionType === 'match').length,
    value: aggregatePerformanceMetricPoints(points, metricConfig),
    partial: covered > 0 && covered < points.length };
}
