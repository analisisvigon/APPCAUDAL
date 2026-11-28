const MM_IN_PX = 96 / 25.4;

const elementEscapes = (sheet) => {
  const bounds = sheet.getBoundingClientRect();
  const style = getComputedStyle(sheet);
  const bottom = bounds.bottom - parseFloat(style.paddingBottom);
  const right = bounds.right - parseFloat(style.paddingRight);
  return [...sheet.querySelectorAll('h1,h2,h3,p,a,svg,.task-export-footer')].some((node) => {
    const rect = node.getBoundingClientRect();
    return rect.bottom > bottom + 1 || rect.right > right + 1;
  });
};

export function renderedBoardSize(board) {
  if (!board) return null;
  const rect = board.getBoundingClientRect();
  const viewBox = board.viewBox?.baseVal;
  if (!viewBox?.width || !viewBox?.height || !rect.width || !rect.height) return null;
  const ratio = viewBox.width / viewBox.height;
  const width = Math.min(rect.width, rect.height * ratio);
  return { width, height: width / ratio, ratio };
}

export function taskSheetFits(sheet) {
  const panels = [...sheet.querySelectorAll('.task-export-main, .task-export-content, .task-export-visual')];
  if (panels.some((panel) => panel.scrollHeight > panel.clientHeight + 2 || panel.scrollWidth > panel.clientWidth + 2)) return false;
  if (elementEscapes(sheet)) return false;
  const board = sheet.querySelector('.task-export-board svg');
  const size = renderedBoardSize(board);
  if (!size) return !board;
  const pitchType = board.closest('.task-export-board')?.dataset.pitchType;
  const minimumHeightMm = pitchType === 'half' ? 42 : pitchType === 'blank' ? 48 : 58;
  return size.height >= minimumHeightMm * MM_IN_PX;
}

// Una tarea equivale siempre a una hoja. Primero ajustamos espacios a la
// densidad mínima legible (9 pt); si aún desborda, se impide imprimir para no
// truncar contenido ni crear una continuación silenciosa.
export function fitTrainingTaskPrintSheets(sheets) {
  const overflow = [];
  for (const sheet of sheets) {
    delete sheet.dataset.density;
    if (!taskSheetFits(sheet)) sheet.dataset.density = 'compact';
    if (!taskSheetFits(sheet)) overflow.push(sheet.dataset.taskName || sheet.dataset.taskId || 'tarea sin nombre');
  }
  if (overflow.length) {
    throw new Error(`No se ha generado el documento: ${overflow.map((name) => `«${name}»`).join(', ')} no cabe completa y legible en una sola hoja A4 horizontal.`);
  }
  return { sheets: sheets.length, continuations: 0 };
}
