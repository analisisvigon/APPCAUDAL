import { getPlannedLibraryValue } from './plannedSessions.js';

const estimatedPrintLines = (description) => String(description || '').split(/\r?\n/)
  .reduce((lines, paragraph) => lines + Math.max(1, Math.ceil(paragraph.length / 55)), 0);
const printableTaskText = (item) => item.kind === 'library_task'
  ? ['description','exercise_rules','tactical_content','tactical_content_offensive',
    'tactical_content_defensive','material'].map((field) =>
    getPlannedLibraryValue(item, field) || '').join('\n')
  : item.description || '';
export const needsPlannedPrintContinuation = (slot) => slot.items.some((item) =>
  estimatedPrintLines(printableTaskText(item)) > (slot.items.length > 1 ? 12 : 18));
const needsTextContinuation = (description) => estimatedPrintLines(description) > 6;
export const needsPlannedTextFragmentation = (slot) => slot.items.some((item) =>
  item.kind === 'free' && estimatedPrintLines(item.description) > 40);
export const needsPlannedWideSheet = (slot) => slot.items.some((item) =>
  item.kind === 'library_task' || needsTextContinuation(item.description));
const visualUnits = (slot) => needsPlannedWideSheet(slot) ? 4 : slot.items.length > 1 ? 2 : 1;
const needsActivationContinuation = (slot) => slot && (
  slot.items.length > 1 || needsPlannedWideSheet(slot)
);

const pack = (slots, capacity) => {
  const groups = [];
  let group = [];
  let units = 0;
  for (const slot of slots) {
    const weight = visualUnits(slot);
    if (group.length && units + weight > capacity) {
      groups.push(group);
      group = [];
      units = 0;
    }
    group.push(slot);
    units += weight;
  }
  if (group.length) groups.push(group);
  return groups;
};

// Una unidad ocupa un cuadrante de la segunda hoja original. Dos tareas
// simultáneas utilizan un bloque de ancho doble y nunca se separan.
export const planPlannedSessionSheets = (slots = []) => {
  const activation = slots.filter((slot) => slot.phase === 'activation');
  const main = slots.filter((slot) => slot.phase === 'main');
  const cooldown = slots.filter((slot) => slot.phase === 'cooldown');
  const coverOverflow = needsActivationContinuation(activation[0]);
  const sheets = [{ kind: 'cover', activation: coverOverflow ? [] : activation.slice(0, 1), coverOverflow }];
  if (coverOverflow) sheets.push({ kind: 'activation', slots: activation.slice(0, 1), coverOverflow: true });
  for (const group of pack(activation.slice(1), 4)) {
    sheets.push({ kind: 'activation', slots: group });
  }
  const mainGroups = pack(main, 4);
  if (!mainGroups.length && (!coverOverflow || cooldown.length)) mainGroups.push([]);
  for (const group of mainGroups) sheets.push({ kind: 'main', slots: group, cooldown: [] });
  const lastMain = sheets[sheets.length - 1];
  const used = lastMain.slots.reduce((sum, slot) => sum + visualUnits(slot), 0);
  if (cooldown.length && used + visualUnits(cooldown[0]) <= 4) lastMain.cooldown = cooldown.slice(0, 1);
  else if (cooldown.length) sheets.push({ kind: 'cooldown', slots: cooldown.slice(0, 1) });
  for (const group of pack(cooldown.slice(1), 4)) {
    sheets.push({ kind: 'cooldown', slots: group });
  }
  return sheets;
};

// La composición impresa utiliza el contenido deportivo, no la altura de los
// formularios editables. Una tarea doble ocupa una fila; las sencillas ocupan
// medio ancho. El desbordamiento de texto se comprueba después en el DOM real.
export const planPlannedSessionPrintSheets = (slots = []) => {
  const ordered = ['activation', 'main', 'cooldown'].flatMap((phase) =>
    slots.filter((slot) => slot.phase === phase));
  const coverCandidate = ordered.length === 1
    ? ordered[0] : ordered[0]?.phase === 'activation' ? ordered[0] : null;
  const exerciseOnCover = coverCandidate && coverCandidate.items.length <= 1 &&
    !needsPlannedTextFragmentation(coverCandidate) &&
    !needsPlannedPrintContinuation(coverCandidate) ? coverCandidate : null;
  const remaining = exerciseOnCover ? ordered.slice(1) : ordered;
  const pages = [{ kind: 'cover', activation: exerciseOnCover }];
  // El contrato de impresión admite como máximo dos A4. Conservamos todo
  // el contenido en la segunda composición y dejamos que la medición real
  // del DOM rechace el documento antes de imprimir si no resulta legible.
  if (remaining.length) pages.push({ kind: 'exercises', slots: remaining });
  return pages;
};
