import { buildDailyLoadRpcParams, isIsoCalendarDate } from './performanceLoad.js';

export function normalizeTrainingLoadRecord(record) {
  if (!record) return null;
  const session = record.session || record.trainingSession || record;
  const nestedMetrics = record.metrics
    || record.training_session_load_metrics
    || session.training_session_load_metrics;
  const metrics = Array.isArray(nestedMetrics) ? nestedMetrics[0] || null : nestedMetrics || null;
  if (!session?.id || !session?.session_date || !metrics?.id) return null;
  return {
    session: {
      id: session.id,
      session_date: session.session_date,
      session_type: session.session_type,
      actual_duration_minutes: session.actual_duration_minutes,
      notes: session.notes,
      record_kind: session.record_kind,
      updated_at: session.updated_at,
    },
    metrics: {
      id: metrics.id,
      session_id: metrics.session_id,
      scope: metrics.scope,
      jugador_id: metrics.jugador_id,
      aggregation_method: metrics.aggregation_method,
      distance_m: metrics.distance_m,
      hsr_m: metrics.hsr_m,
      accelerations: metrics.accelerations,
      decelerations: metrics.decelerations,
      sprints: metrics.sprints,
      meters_per_minute: metrics.meters_per_minute,
      load_units: metrics.load_units,
      updated_at: metrics.updated_at,
    },
  };
}

export async function loadTrainingLoadsRange(client, startDate, endDate) {
  if (!isIsoCalendarDate(startDate) || !isIsoCalendarDate(endDate) || startDate > endDate) {
    throw new Error('El rango de fechas de carga no es válido.');
  }
  const response = await client
    .from('training_sessions')
    .select(`
      id,
      session_date,
      session_type,
      actual_duration_minutes,
      notes,
      record_kind,
      updated_at,
      training_session_load_metrics!inner (
        id,
        session_id,
        scope,
        jugador_id,
        aggregation_method,
        distance_m,
        hsr_m,
        accelerations,
        decelerations,
        sprints,
        meters_per_minute,
        load_units,
        updated_at
      )
    `)
    .eq('record_kind', 'daily_team_load')
    .eq('training_session_load_metrics.scope', 'team')
    .gte('session_date', startDate)
    .lte('session_date', endDate)
    .order('session_date', { ascending: true });

  if (response.error) throw response.error;
  return (response.data || []).map(normalizeTrainingLoadRecord).filter(Boolean);
}

export function getTrainingLoadForDate(loads, date) {
  if (!isIsoCalendarDate(date)) return null;
  return (Array.isArray(loads) ? loads : []).find((load) => load?.session?.session_date === date) || null;
}

export async function saveDailyTeamLoad(client, draft) {
  const params = buildDailyLoadRpcParams(draft);
  const response = await client.rpc('upsert_team_daily_training_load', params);
  if (response.error) throw response.error;
  const saved = normalizeTrainingLoadRecord(response.data);
  if (!saved) throw new Error('Supabase no devolvió la carga diaria guardada.');
  return saved;
}

export function replaceTrainingLoadByDate(loads, savedLoad) {
  const nextLoads = (Array.isArray(loads) ? loads : [])
    .filter((load) => load?.session?.session_date !== savedLoad?.session?.session_date);
  if (savedLoad) nextLoads.push(savedLoad);
  return nextLoads.sort((left, right) => left.session.session_date.localeCompare(right.session.session_date));
}
