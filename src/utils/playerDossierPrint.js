const numberOrZero = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const inspectPlayerDossier = (documentRef) => {
  const nodes = Array.from(documentRef?.querySelectorAll?.('[data-player-pdf-report="true"]') || []);
  const node = nodes[0] || null;
  const rect = node?.getBoundingClientRect?.() || {};
  const scrollHeight = numberOrZero(node?.scrollHeight);
  const scrollWidth = numberOrZero(node?.scrollWidth);
  const width = numberOrZero(rect.width) || numberOrZero(node?.clientWidth) || scrollWidth;
  const height = numberOrZero(rect.height) || numberOrZero(node?.clientHeight) || scrollHeight;
  const childElementCount = numberOrZero(node?.childElementCount);
  const text = String(node?.innerText || node?.textContent || '').replace(/\s+/g, ' ').trim();
  const exportableBlockCount = numberOrZero(node?.querySelectorAll?.('section, article, table')?.length);
  const valid = nodes.length === 1
    && width > 0
    && height > 0
    && scrollHeight > 0
    && scrollWidth > 0
    && childElementCount > 0
    && text.length > 0
    && exportableBlockCount > 0;

  return {
    node,
    nodeCount: nodes.length,
    width,
    height,
    scrollHeight,
    scrollWidth,
    childElementCount,
    textLength: text.length,
    textPreview: text.slice(0, 160),
    exportableBlockCount,
    valid,
  };
};

export const printPlayerDossier = ({ documentRef, print, logger = console } = {}) => {
  const inspection = inspectPlayerDossier(documentRef);
  const { node, ...diagnostics } = inspection;
  if (!inspection.valid || typeof print !== 'function') {
    logger.error('No se puede exportar el perfil: el informe imprimible está vacío o no tiene dimensiones válidas.', diagnostics);
    return { printed: false, diagnostics };
  }

  logger.info('Informe de jugador preparado para impresión.', diagnostics);
  print();
  return { printed: true, diagnostics };
};
