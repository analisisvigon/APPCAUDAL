import { calendarWeekDays } from '../utils/teamCalendar.js';

// Se activa solo despues de instalar y verificar manualmente la migracion 4D.
export const MICROCYCLE_RECOVERY_4D_ENABLED = import.meta.env?.VITE_MICROCYCLE_RECOVERY_4D_ENABLED === 'true';
const STATES = new Set(['absent', 'below_threshold', 'available']);
const KEYS = new Set(['day_date', 'rpe_average', 'rpe_responses', 'rpe_state',
  'wellness_average', 'wellness_responses', 'wellness_state']);

export async function loadMicrocycleCollectiveRecovery(client, contextId, days, enabled = MICROCYCLE_RECOVERY_4D_ENABLED) {
  if (!enabled) throw new Error('La consulta colectiva 4D todavía no está activada.');
  if (!contextId || !Array.isArray(days) || days.length !== 7
    || JSON.stringify(calendarWeekDays(days[0])) !== JSON.stringify(days)) {
    throw new Error('Selecciona un equipo, temporada y semana válidos.');
  }
  const response = await client.rpc('get_microcycle_collective_recovery_4d', {
    p_club_team_season_id: contextId, p_week_starts_on: days[0],
  });
  if (response?.error) throw response.error;
  if (!Array.isArray(response?.data) || response.data.length !== 7) {
    throw new Error('La consulta colectiva no devolvió una semana completa.');
  }
  return response.data.map((row, index) => {
    if (!row || row.day_date !== days[index] || Object.keys(row).some((key) => !KEYS.has(key))) {
      throw new Error('La consulta colectiva devolvió fechas o campos incompatibles.');
    }
    for (const [name, min] of [['rpe', 1], ['wellness', 0]]) {
      const state = row[`${name}_state`];
      const value = row[`${name}_average`];
      const count = row[`${name}_responses`];
      if (!STATES.has(state) || (state === 'available'
        ? !Number.isFinite(Number(value)) || Number(value) < min || Number(value) > 10
          || !Number.isInteger(count) || count < 5
        : value !== null || count !== null)) {
        throw new Error('La consulta colectiva no respetó el umbral de privacidad.');
      }
    }
    return row;
  });
}
