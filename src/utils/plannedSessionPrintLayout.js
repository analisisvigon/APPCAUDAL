const EPSILON_PX = 4;

const escapedNodes = (sheet) => {
  const bounds = sheet.getBoundingClientRect();
  const style = getComputedStyle(sheet);
  const bottom = bounds.bottom - (parseFloat(style.paddingBottom) || 0);
  const right = bounds.right - (parseFloat(style.paddingRight) || 0);
  const nodes = sheet.querySelectorAll('.planned-print-exercise,.planned-print-roster,.planned-print-field,img,svg');
  return [...nodes].filter((node) => {
    const rect = node.getBoundingClientRect();
    return rect.bottom > bottom + EPSILON_PX || rect.right > right + EPSILON_PX;
  });
};

const overflowingNodes = (sheet) => [...sheet.querySelectorAll(
  '.planned-print-exercise,.planned-print-tasks,.planned-print-task,.planned-print-task-content,.planned-print-development,.planned-print-graphic',
)].filter((node) => node.scrollHeight > node.clientHeight + EPSILON_PX ||
  node.scrollWidth > node.clientWidth + EPSILON_PX);

const blockLabel = (node) => {
  const exercise = node.closest?.('.planned-print-exercise');
  const exerciseName = exercise?.querySelector?.('.planned-print-exercise-head strong')?.textContent?.trim();
  if (node.classList?.contains('planned-print-roster')) return 'plantilla de jugadores';
  if (node.classList?.contains('planned-print-field')) return 'datos generales';
  if (node.classList?.contains('planned-print-development')) return `texto de ${exerciseName || 'una actividad'}`;
  if (node.classList?.contains('planned-print-graphic') || node.matches?.('img,svg')) {
    return `representación gráfica de ${exerciseName || 'una actividad'}`;
  }
  return exerciseName || 'composición de la hoja';
};

const printDocuments = (root) => root?.matches?.('.planned-print-pages')
  ? [root] : [...(root?.querySelectorAll?.('.planned-print-pages') || [])];

export function plannedSessionPrintIssues(root) {
  if (!root?.querySelectorAll) return [{ reason: 'No se encontró la vista imprimible.' }];
  const documents = printDocuments(root);
  if (!documents.length) return [{ reason: 'No se encontró la vista imprimible.' }];
  const issues = [];
  documents.forEach((documentNode, documentIndex) => {
    const sheets = [...documentNode.querySelectorAll(':scope > .planned-print-sheet')];
    const label = documentNode.dataset.sessionDate || `sesión ${documentIndex + 1}`;
    if (!sheets.length) issues.push({ label, reason: 'no contiene hojas' });
    if (sheets.length > 2) issues.push({ label, reason: `necesita ${sheets.length} hojas` });
    sheets.forEach((sheet, sheetIndex) => {
      const sheetOverflow = sheet.scrollHeight > sheet.clientHeight + EPSILON_PX ||
        sheet.scrollWidth > sheet.clientWidth + EPSILON_PX;
      const nodes = [...overflowingNodes(sheet), ...escapedNodes(sheet)];
      if (sheetOverflow && !nodes.length) issues.push({ label, page: sheetIndex + 1,
        block: 'composición de la hoja', reason: 'el contenido desborda el A4 horizontal' });
      [...new Set(nodes.map(blockLabel))].forEach((block) => issues.push({ label, page: sheetIndex + 1,
        block, reason: 'el contenido desborda el A4 horizontal' }));
    });
  });
  return issues;
}

export function fitPlannedSessionPrint(root) {
  const documents = printDocuments(root);
  documents.forEach((documentNode) => { delete documentNode.dataset.density; });
  let issues = plannedSessionPrintIssues(root);
  if (!issues.length) return [];
  const affected = new Set(issues.map((issue) => issue.label));
  documents.forEach((documentNode, index) => {
    const label = documentNode.dataset.sessionDate || `sesión ${index + 1}`;
    if (affected.has(label)) documentNode.dataset.density = 'compact';
  });
  issues = plannedSessionPrintIssues(root);
  return issues;
}

export function assertPlannedSessionPrintFits(root) {
  const issues = fitPlannedSessionPrint(root);
  if (!issues.length) return true;
  const affected = [...new Set(issues.map((issue) => issue.label).filter(Boolean))].join(', ');
  const blocks = [...new Set(issues.map((issue) => issue.block).filter(Boolean))].join(', ');
  throw new Error(`La impresión no se ha generado porque ${affected || 'la sesión'} no cabe completa y legible en un máximo de dos hojas A4 horizontales${blocks ? `. Bloque que desborda: ${blocks}` : ''}.`);
}
