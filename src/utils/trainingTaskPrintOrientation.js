import { buildA4LandscapePageRule, printA4LandscapeDocument } from './a4LandscapePrint.js';

export const TRAINING_TASK_PRINT_PAGE_RULE = buildA4LandscapePageRule('task-library');

export function printTrainingTaskDocument({
  windowRef = globalThis.window,
  documentRef = globalThis.document,
} = {}) {
  try {
    printA4LandscapeDocument({ pageName: 'task-library', marker: 'data-training-task-print-page', windowRef, documentRef });
  } catch (cause) {
    if (cause?.message === 'No se pudo preparar la impresión A4 horizontal.') {
      throw new Error('No se pudo preparar la impresión A4 horizontal de la tarea.');
    }
    throw cause;
  }
}
