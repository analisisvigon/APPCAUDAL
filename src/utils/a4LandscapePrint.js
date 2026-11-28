export const A4_LANDSCAPE_PAGE_SIZE = '297mm 210mm';

export function buildA4LandscapePageRule(pageName = '') {
  const named = String(pageName || '').trim();
  return [
    `@page { size: ${A4_LANDSCAPE_PAGE_SIZE}; margin: 0; }`,
    named ? `@page ${named} { size: ${A4_LANDSCAPE_PAGE_SIZE}; margin: 0; }` : '',
  ].filter(Boolean).join('\n');
}

export function printA4LandscapeDocument({
  pageName = '',
  marker = 'data-a4-landscape-print-page',
  windowRef = globalThis.window,
  documentRef = globalThis.document,
} = {}) {
  if (typeof windowRef?.print !== 'function' || typeof windowRef.addEventListener !== 'function' ||
      typeof windowRef.removeEventListener !== 'function' || !documentRef?.head ||
      typeof documentRef.createElement !== 'function') {
    throw new Error('No se pudo preparar la impresión A4 horizontal.');
  }

  const style = documentRef.createElement('style');
  style.media = 'print';
  style.setAttribute(marker, '');
  style.textContent = buildA4LandscapePageRule(pageName);
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
