import { normalizeTrainingTask } from './trainingTasks.js';
import { chunkTrainingTaskIds, loadTrainingTaskLibraryScope } from './trainingTaskLibraryScope.js';

const EXPORT_PAGE_SIZE = 250;

const parseLocalDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 &&
    date.getDate() === Number(match[3]) ? date : null;
};

export const trainingTaskCreationRange = (fromDate, toDate) => {
  const from = parseLocalDate(fromDate);
  const to = parseLocalDate(toDate);
  if (!from || !to || from > to) throw new Error('Selecciona un intervalo de fechas válido.');
  const until = new Date(to);
  until.setDate(until.getDate() + 1);
  return { from: from.toISOString(), until: until.toISOString() };
};

export const listTrainingTasksForExport = async (client, clubTeamSeasonId, fromDate, toDate) => {
  if (!clubTeamSeasonId) throw new Error('No hay un equipo y temporada autorizados para exportar tareas.');
  const range = trainingTaskCreationRange(fromDate, toDate);
  const scope = await loadTrainingTaskLibraryScope(client, clubTeamSeasonId, {
    createdFrom: range.from,
    createdUntil: range.until,
  });
  if (!scope.length) return [];
  const rows = [];
  for (const ids of chunkTrainingTaskIds(scope.map((entry) => entry.taskId), EXPORT_PAGE_SIZE)) {
    const { data, error } = await client
      .from('training_tasks')
      .select('*')
      .in('id', ids)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    if (error) throw error;
    rows.push(...(data || []));
  }

  const unique = new Map();
  rows.forEach((row) => unique.set(row.id, row));
  return [...unique.values()]
    .sort((left, right) => String(left.created_at || '').localeCompare(String(right.created_at || '')) ||
      String(left.id || '').localeCompare(String(right.id || '')))
    .map(normalizeTrainingTask);
};

export const trainingTaskExportFileName = (fromDate, toDate) =>
  `Tareas_${fromDate}_a_${toDate}.pdf`;
