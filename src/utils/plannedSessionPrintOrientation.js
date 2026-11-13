export const PLANNED_SESSION_PRINT_PAGE_RULE = '@page { size: A4 landscape; margin: 0; }';

export function printPlannedSessionDocument({
  windowRef = globalThis.window,
  documentRef = globalThis.document,
} = {}) {
  if (typeof windowRef?.print !== 'function' || typeof windowRef.addEventListener !== 'function' ||
      typeof windowRef.removeEventListener !== 'function' || !documentRef?.head ||
      typeof documentRef.createElement !== 'function') {
    throw new Error('No se pudo preparar la impresión A4 horizontal de la sesión.');
  }

  const style = documentRef.createElement('style');
  style.media = 'print';
  style.setAttribute('data-planned-session-print-page', '');
  style.textContent = PLANNED_SESSION_PRINT_PAGE_RULE;
  documentRef.head.appendChild(style);

  const cleanup = () => {
    windowRef.removeEventListener('afterprint', cleanup);
    style.remove();
  };

  try {
    windowRef.addEventListener('afterprint', cleanup, { once: true });
    windowRef.print();
  } catch (error) {
    cleanup();
    throw error;
  }
}
