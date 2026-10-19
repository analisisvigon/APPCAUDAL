const estimatedPrintLines = (description) => String(description || '').split(/\r?\n/)
  .reduce((lines, paragraph) => lines + Math.max(1, Math.ceil(paragraph.length / 55)), 0);
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
