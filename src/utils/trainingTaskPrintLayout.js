const MM_IN_PX = 96 / 25.4;
const EPSILON_PX = 3;

const escapedElements = (sheet) => {
  const bounds = sheet.getBoundingClientRect();
  const style = getComputedStyle(sheet);
  const bottom = bounds.bottom - (parseFloat(style.paddingBottom) || 0);
  const right = bounds.right - (parseFloat(style.paddingRight) || 0);
  return [...sheet.querySelectorAll('h1,h2,h3,p,a,img,svg,.task-export-footer')].filter((node) => {
    const rect = node.getBoundingClientRect();
    return rect.bottom > bottom + EPSILON_PX || rect.right > right + EPSILON_PX;
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
  return trainingTaskPrintIssues(sheet).length === 0;
}

const panelLabel = (panel) => panel.classList?.contains('task-export-content') ? 'explicaciones'
  : panel.classList?.contains('task-export-visual') ? 'representación gráfica' : 'zona principal';

export function trainingTaskPrintIssues(sheet) {
  const issues = [];
  const panels = [...sheet.querySelectorAll('.task-export-main, .task-export-content, .task-export-visual')];
  panels.forEach((panel) => {
    if (panel.scrollHeight > panel.clientHeight + EPSILON_PX || panel.scrollWidth > panel.clientWidth + EPSILON_PX) {
      issues.push(panelLabel(panel));
    }
  });
  const escaped = escapedElements(sheet);
  if (escaped.length) issues.push('contenido exterior a los márgenes');
  const board = sheet.querySelector('.task-export-board svg');
  const size = renderedBoardSize(board);
  if (!board) return [...new Set(issues)];
  if (!size) return [...new Set([...issues, 'pizarra sin dimensiones renderizadas'])];
  const pitchType = board.closest('.task-export-board')?.dataset.pitchType;
  const minimumHeightMm = pitchType === 'half' ? 36 : pitchType === 'blank' ? 40 : 45;
  if (size.height < minimumHeightMm * MM_IN_PX) issues.push('pizarra demasiado pequeña');
  return [...new Set(issues)];
}

// Una tarea equivale siempre a una hoja. Primero ajustamos espacios a la
// densidad mínima legible (9 pt); si aún desborda, se impide imprimir para no
// truncar contenido ni crear una continuación silenciosa.
export function fitTrainingTaskPrintSheets(sheets) {
  const overflow = [];
  for (const sheet of sheets) {
    delete sheet.dataset.density;
    delete sheet.dataset.fit;
    if (!taskSheetFits(sheet)) sheet.dataset.density = 'compact';
    if (!taskSheetFits(sheet)) sheet.dataset.fit = 'text-heavy';
    const issues = trainingTaskPrintIssues(sheet);
    if (issues.length) overflow.push({ name: sheet.dataset.taskName || sheet.dataset.taskId || 'tarea sin nombre', issues });
  }
  if (overflow.length) {
    throw new Error(`No se ha generado el documento: ${overflow.map(({ name, issues }) =>
      `«${name}» no cabe completa y legible en una sola hoja A4 horizontal (${issues.join(', ')})`).join('; ')}.`);
  }
  return { sheets: sheets.length, continuations: 0 };
}
