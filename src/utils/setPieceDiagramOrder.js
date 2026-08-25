const numericOrder = (diagram) => {
  const order = Number(diagram?.orden);
  return Number.isFinite(order) ? order : Number.POSITIVE_INFINITY;
};

export const getSetPieceDiagramIdentity = (diagram) => String(
  diagram?.id || diagram?.clientId || ''
);

export const createSetPieceDiagramClientId = () => (
  globalThis.crypto?.randomUUID?.()
  || `set-piece-${Date.now()}-${Math.random().toString(16).slice(2)}`
);

export const sortSetPieceDiagramsByOrder = (diagrams = []) => (
  (Array.isArray(diagrams) ? diagrams : [])
    .map((diagram, sourceIndex) => ({ diagram, sourceIndex }))
    .sort((a, b) => numericOrder(a.diagram) - numericOrder(b.diagram) || a.sourceIndex - b.sourceIndex)
    .map(({ diagram }) => diagram)
);

export const normalizeSetPieceDiagramOrders = (diagrams = []) => {
  const source = Array.isArray(diagrams) ? diagrams : [];
  const entriesByType = new Map();

  source.forEach((diagram, sourceIndex) => {
    const type = String(diagram?.tipo || '');
    const entries = entriesByType.get(type) || [];
    entries.push({ diagram, sourceIndex });
    entriesByType.set(type, entries);
  });

  const normalizedOrderBySourceIndex = new Map();
  entriesByType.forEach((entries) => {
    entries
      .sort((a, b) => numericOrder(a.diagram) - numericOrder(b.diagram) || a.sourceIndex - b.sourceIndex)
      .forEach((entry, index) => normalizedOrderBySourceIndex.set(entry.sourceIndex, index + 1));
  });

  return source.map((diagram, sourceIndex) => ({
    ...diagram,
    orden: normalizedOrderBySourceIndex.get(sourceIndex) || 1,
  }));
};

export const getSetPieceSelectionAfterDelete = (diagrams = [], deletedDiagram) => {
  const deletedIdentity = getSetPieceDiagramIdentity(deletedDiagram);
  if (!deletedIdentity) return '';
  const sameType = sortSetPieceDiagramsByOrder(
    (Array.isArray(diagrams) ? diagrams : []).filter((diagram) => diagram?.tipo === deletedDiagram?.tipo)
  );
  const deletedIndex = sameType.findIndex((diagram) => getSetPieceDiagramIdentity(diagram) === deletedIdentity);
  if (deletedIndex < 0) return '';
  return getSetPieceDiagramIdentity(sameType[deletedIndex + 1] || sameType[deletedIndex - 1]);
};
