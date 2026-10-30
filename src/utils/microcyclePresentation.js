export const MICROCYCLE_INTENSITY_LEVELS = Object.freeze({
  '': 0,
  'Muy baja': 1,
  Baja: 2,
  Media: 3,
  Alta: 4,
  'Muy alta': 5,
});

export function microcycleDayIntensity(day, hasMatch = false) {
  if (hasMatch || day?.type === 'Partido') return { level: 5, label: 'Partido', peak: true };
  if (day?.type === 'Descanso') return { level: 0, label: 'Descanso', peak: false };
  const label = typeof day?.intensity === 'string' ? day.intensity : '';
  return { level: MICROCYCLE_INTENSITY_LEVELS[label] ?? 0,
    label: label || 'Sin asignar', peak: false };
}

export function plannedMicrocycleMinutes(days, dailyPlan) {
  return days.reduce((total, key) => {
    const value = Number(dailyPlan?.[key]?.durationMinutes);
    return Number.isInteger(value) && value > 0 ? total + value : total;
  }, 0);
}

export function normalizeMicrocycleDay(day) {
  return day?.type === 'Partido' ? { ...day, intensity: 'Muy alta' } : day;
}
