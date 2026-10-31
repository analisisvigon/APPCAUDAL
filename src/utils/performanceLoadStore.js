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

const shiftDate = (date, days) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

export async function loadCtsTrainingLoadsRange(client, contextId, startDate, endDate) {
  if (!contextId || !isIsoCalendarDate(startDate) || !isIsoCalendarDate(endDate)
    || startDate > endDate) throw new Error('Selecciona un equipo, temporada y fechas válidos.');
  const weekday = new Date(`${startDate}T12:00:00Z`).getUTCDay() || 7;
  const rows = [];
  for (let monday = shiftDate(startDate, 1 - weekday); monday <= endDate;
    monday = shiftDate(monday, 7)) {
    const response = await client.rpc('get_microcycle_team_loads_4a', {
      p_club_team_season_id: contextId, p_week_starts_on: monday,
    });
    if (response.error) throw response.error;
    if (!Array.isArray(response.data)) throw new Error('La consulta física no devolvió datos verificables.');
    for (const row of response.data) {
      if (!row?.training_session_id || !isIsoCalendarDate(row.session_date)
        || row.session_date < monday || row.session_date > shiftDate(monday, 6)
        || typeof row.has_team_metrics !== 'boolean') {
        throw new Error('La consulta física devolvió una sesión fuera del CTS y semana solicitados.');
      }
      if (row.session_date >= startDate && row.session_date <= endDate) rows.push(row);
    }
  }
  if (!rows.length) return [];
  const ids = rows.map((row) => row.training_session_id);
  if (new Set(ids).size !== ids.length || new Set(rows.map((row) => row.session_date)).size !== rows.length) {
    throw new Error('Existen cargas físicas duplicadas para este equipo y fecha.');
  }
  // 4A acredita los IDs y las métricas, pero no devuelve notas. Si la lectura
  // de alguna cabecera falla, se bloquea la edición para no borrarlas.
  const details = await client.from('training_sessions')
    .select('id,session_date,notes,record_kind,updated_at').in('id', ids);
  if (details.error) throw details.error;
  const byId = new Map((details.data || []).map((row) => [row.id, row]));
  if (byId.size !== ids.length || (details.data || []).length !== ids.length
    || rows.some((row) => byId.get(row.training_session_id)?.session_date !== row.session_date)) {
    throw new Error('No se pudieron verificar las observaciones de todas las cargas vinculadas.');
  }
  return rows.map((row) => ({
    session: {
      id: row.training_session_id, session_date: row.session_date,
      session_type: row.session_type,
      actual_duration_minutes: row.actual_duration_minutes,
      notes: byId.get(row.training_session_id).notes,
      record_kind: byId.get(row.training_session_id).record_kind,
      updated_at: byId.get(row.training_session_id).updated_at,
    },
    metrics: row.has_team_metrics ? {
      session_id: row.training_session_id, scope: 'team',
      distance_m: row.distance_m, hsr_m: row.hsr_m,
      accelerations: row.accelerations, decelerations: row.decelerations,
      sprints: row.sprints, meters_per_minute: row.meters_per_minute,
      load_units: row.load_units,
    } : null,
  })).sort((left, right) => left.session.session_date.localeCompare(right.session.session_date));
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

export async function saveCtsDailyTeamLoad(client, contextId, draft, existingSessionId = null) {
  if (!contextId) throw new Error('Selecciona un equipo y temporada antes de guardar.');
  const params = buildDailyLoadRpcParams(draft);
  const response = await client.rpc('save_cts_daily_training_load_4b', {
    p_club_team_season_id: contextId,
    ...params,
    p_existing_session_id: existingSessionId,
  });
  if (response.error) throw response.error;
  const saved = normalizeTrainingLoadRecord(response.data);
  if (!saved || saved.session.id !== saved.metrics.session_id
    || saved.session.session_date !== draft.sessionDate
    || (existingSessionId && saved.session.id !== existingSessionId)) {
    throw new Error('El servidor no confirmó la carga física vinculada. Recarga antes de continuar.');
  }
  return saved;
}

export async function saveAuthorizedCtsDailyTeamLoad(client, context, draft, existingLoad = null) {
  if (!context?.id || context.seasonStatus !== 'open') {
    throw new Error('Selecciona un equipo y una temporada abierta para registrar la carga.');
  }
  const permission = await client.rpc('can_write_club_team_season', {
    target_club_team_season_id: context.id,
  });
  if (permission.error || permission.data !== true) {
    throw new Error('No se pudo confirmar el permiso de escritura para este equipo y temporada.');
  }
  if (existingLoad && existingLoad.session?.session_date !== draft.sessionDate) {
    throw new Error('La carga seleccionada no corresponde a la fecha editada.');
  }
  return saveCtsDailyTeamLoad(client, context.id, draft, existingLoad?.session?.id || null);
}

export function replaceTrainingLoadByDate(loads, savedLoad) {
  const nextLoads = (Array.isArray(loads) ? loads : [])
    .filter((load) => load?.session?.session_date !== savedLoad?.session?.session_date);
  if (savedLoad) nextLoads.push(savedLoad);
  return nextLoads.sort((left, right) => left.session.session_date.localeCompare(right.session.session_date));
}
