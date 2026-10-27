import { blankMicrocycleDraft, hydrateMicrocycleDraft, loadMicrocycle2b,
  saveMicrocycle2b, verifyMicrocycleSave } from './microcycles2bStore.js';

const validWeek = (days) => {
  if (!Array.isArray(days) || days.length !== 7 || !/^\d{4}-\d{2}-\d{2}$/.test(days[0])) return false;
  const start = new Date(`${days[0]}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) || start.getUTCDay() !== 1) return false;
  return days.every((day, index) => {
    const expected = new Date(start);
    expected.setUTCDate(start.getUTCDate() + index);
    return day === expected.toISOString().slice(0, 10);
  });
};

export const copyMicrocycleDraft = (source, sourceDays, targetDays, includeObservations, season) => {
  if (!source || !validWeek(sourceDays) || !validWeek(targetDays) ||
    !season?.starts_on || !season?.ends_on ||
    !targetDays.some((day) => day >= season.starts_on && day <= season.ends_on)) {
    throw new Error('La semana de destino no pertenece a la temporada seleccionada.');
  }
  const original = hydrateMicrocycleDraft(source, sourceDays);
  const copied = blankMicrocycleDraft(targetDays);
  copied.objective = original.objective;
  copied.priorities = [...original.priorities];
  copied.responsible = original.responsible;
  copied.observations = includeObservations ? original.observations : '';
  targetDays.forEach((day, index) => {
    if (day < season.starts_on || day > season.ends_on) return;
    copied.days[day] = { ...original.days[sourceDays[index]],
      observations: includeObservations ? original.days[sourceDays[index]].observations : '' };
  });
  return copied;
};

const stale = () => Object.assign(new Error('La planificación cambió desde que se abrió. Recarga antes de copiar.'),
  { code: '40001' });

export const applyMicrocycleCopy = async (client, { sourcePlan, sourceContextId, sourceDays,
  targetPlan, targetContextId, targetDays, includeObservations, overwriteConfirmed = false, season }) => {
  if (!sourcePlan || !sourceContextId || !targetContextId ||
    !validWeek(sourceDays) || !validWeek(targetDays) ||
    (sourceContextId === targetContextId && sourceDays[0] === targetDays[0]) ||
    season?.status !== 'open') throw new Error('Origen o destino de la copia no válido.');
  if (targetPlan && !overwriteConfirmed) throw new Error('Debes confirmar la sustitución de la semana de destino.');
  const draft = copyMicrocycleDraft(sourcePlan, sourceDays, targetDays, includeObservations, season);
  const permission = await client.rpc('can_write_club_team_season', {
    target_club_team_season_id: targetContextId,
  });
  if (permission.error) throw permission.error;
  if (permission.data !== true) throw new Error('No tienes permiso para planificar este equipo y temporada.');
  const [freshSource, freshTarget] = await Promise.all([
    loadMicrocycle2b(client, sourceContextId, sourceDays[0]),
    loadMicrocycle2b(client, targetContextId, targetDays[0]),
  ]);
  if (!freshSource || freshSource.id !== sourcePlan.id ||
    freshSource.revision !== sourcePlan.revision ||
    (freshTarget?.id || null) !== (targetPlan?.id || null) ||
    (freshTarget?.revision || 0) !== (targetPlan?.revision || 0)) throw stale();
  const expectedRevision = targetPlan?.revision ?? 0;
  const reply = await saveMicrocycle2b(client, targetContextId, targetDays[0],
    expectedRevision, draft, targetDays);
  const saved = await loadMicrocycle2b(client, targetContextId, targetDays[0]);
  return verifyMicrocycleSave(reply, saved, targetContextId, targetDays[0],
    expectedRevision, draft, targetDays);
};
