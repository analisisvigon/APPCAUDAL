import { buildA4LandscapePageRule, printA4LandscapeDocument } from './a4LandscapePrint.js';

export const PLANNED_SESSION_PRINT_PAGE_RULE = buildA4LandscapePageRule('nexo-session');

export function printPlannedSessionDocument({
  windowRef = globalThis.window,
  documentRef = globalThis.document,
} = {}) {
  try {
    printA4LandscapeDocument({ pageName: 'nexo-session', marker: 'data-planned-session-print-page', windowRef, documentRef });
  } catch (cause) {
    if (cause?.message === 'No se pudo preparar la impresión A4 horizontal.') {
      throw new Error('No se pudo preparar la impresión A4 horizontal de la sesión.');
    }
    throw cause;
  }
}
