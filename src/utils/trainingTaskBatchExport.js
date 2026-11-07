import { normalizeTrainingTask } from './trainingTasks.js';

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

export const listTrainingTasksForExport = async (client, clubId, fromDate, toDate) => {
  if (!clubId) throw new Error('No hay un club activo para exportar tareas.');
  const range = trainingTaskCreationRange(fromDate, toDate);
  const rows = [];
  let offset = 0;
  let total = null;

  do {
    const { data, count, error } = await client
      .from('training_tasks')
      .select('*', { count: 'exact' })
      .eq('club_id', clubId)
      .gte('created_at', range.from)
      .lt('created_at', range.until)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + EXPORT_PAGE_SIZE - 1);
    if (error) throw error;
    if (total === null) total = Number.isInteger(count) ? count : null;
    const page = data || [];
    rows.push(...page);
    offset += page.length;
    if (!page.length || (total !== null && offset >= total) || (total === null && page.length < EXPORT_PAGE_SIZE)) break;
  } while (true);

  const unique = new Map();
  rows.forEach((row) => unique.set(row.id, row));
  return [...unique.values()]
    .sort((left, right) => String(left.created_at || '').localeCompare(String(right.created_at || '')) ||
      String(left.id || '').localeCompare(String(right.id || '')))
    .map(normalizeTrainingTask);
};

export const trainingTaskExportFileName = (fromDate, toDate) =>
  `Tareas_${fromDate}_a_${toDate}.pdf`;
