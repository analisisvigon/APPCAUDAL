// Screen and print share identical millimetre dimensions. No scaling or clipping.
export function taskSheetFits(sheet) {
  const bounds = sheet.getBoundingClientRect();
  const style = getComputedStyle(sheet);
  const bottom = bounds.bottom - parseFloat(style.paddingBottom);
  const right = bounds.right - parseFloat(style.paddingRight);
  const panels = [...sheet.querySelectorAll('.task-export-main, .task-export-content, .task-export-visual')];
  if (panels.some((panel) => panel.scrollHeight > panel.clientHeight + 2 || panel.scrollWidth > panel.clientWidth + 2)) return false;
  if ([...sheet.querySelectorAll('h1,h2,h3,p,a,svg,.task-export-footer')].some((node) => {
    const rect = node.getBoundingClientRect();
    return rect.bottom > bottom + 1 || rect.right > right + 1;
  })) return false;
  const board = sheet.querySelector('.task-export-board svg');
  // A full pitch must retain at least 65 mm of height (96 CSS pixels per inch).
  return !board || board.getBoundingClientRect().height >= 65 * 96 / 25.4;
}

export function fitTrainingTaskPrintSheets(sheets) {
  const failures = [];
  for (const sheet of sheets) {
    delete sheet.dataset.density;
    if (!taskSheetFits(sheet)) sheet.dataset.density = 'compact';
    if (!taskSheetFits(sheet)) failures.push(sheet.querySelector('h1')?.textContent || sheet.dataset.taskId);
  }
  if (failures.length) throw new Error(`Estas tareas exceden una página A4 horizontal con letra legible: ${failures.join('; ')}. Reduce o selecciona el contenido de estas tareas antes de volver a exportar. No se ha impreso ninguna ficha.`);
}
