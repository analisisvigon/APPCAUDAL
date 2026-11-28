const EPSILON_PX = 2;

const escapesSheet = (sheet) => {
  const bounds = sheet.getBoundingClientRect();
  const style = getComputedStyle(sheet);
  const bottom = bounds.bottom - (parseFloat(style.paddingBottom) || 0);
  const right = bounds.right - (parseFloat(style.paddingRight) || 0);
  const nodes = sheet.querySelectorAll('.planned-print-exercise,.planned-print-roster,.planned-print-field,img,svg');
  return [...nodes].some((node) => {
    const rect = node.getBoundingClientRect();
    return rect.bottom > bottom + EPSILON_PX || rect.right > right + EPSILON_PX;
  });
};

const nestedContentOverflows = (sheet) => [...sheet.querySelectorAll(
  '.planned-print-exercise,.planned-print-tasks,.planned-print-task,.planned-print-task-content,.planned-print-development,.planned-print-graphic',
)].some((node) => node.scrollHeight > node.clientHeight + EPSILON_PX ||
  node.scrollWidth > node.clientWidth + EPSILON_PX);

export function plannedSessionPrintIssues(root) {
  if (!root?.querySelectorAll) return [{ reason: 'No se encontró la vista imprimible.' }];
  const documents = root.matches?.('.planned-print-pages')
    ? [root] : [...root.querySelectorAll('.planned-print-pages')];
  if (!documents.length) return [{ reason: 'No se encontró la vista imprimible.' }];
  const issues = [];
  documents.forEach((documentNode, documentIndex) => {
    const sheets = [...documentNode.querySelectorAll(':scope > .planned-print-sheet')];
    const label = documentNode.dataset.sessionDate || `sesión ${documentIndex + 1}`;
    if (!sheets.length) issues.push({ label, reason: 'no contiene hojas' });
    if (sheets.length > 2) issues.push({ label, reason: `necesita ${sheets.length} hojas` });
    sheets.forEach((sheet, sheetIndex) => {
      if (sheet.scrollHeight > sheet.clientHeight + EPSILON_PX ||
          sheet.scrollWidth > sheet.clientWidth + EPSILON_PX || nestedContentOverflows(sheet) || escapesSheet(sheet)) {
        issues.push({ label, page: sheetIndex + 1, reason: 'el contenido desborda el A4 horizontal' });
      }
    });
  });
  return issues;
}

export function assertPlannedSessionPrintFits(root) {
  const issues = plannedSessionPrintIssues(root);
  if (!issues.length) return true;
  const affected = [...new Set(issues.map((issue) => issue.label).filter(Boolean))].join(', ');
  throw new Error(`La impresión no se ha generado porque ${affected || 'la sesión'} no cabe completa y legible en un máximo de dos hojas A4 horizontales.`);
}
