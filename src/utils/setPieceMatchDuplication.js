import { cloneSetPieceElementsWithFreshIds } from './setPieceProfessional.js';

export const duplicateMatchSetPiece = ({
  source = {},
  targetMatchId,
  order,
  elements = source.elements,
} = {}) => ({
  partido_id: targetMatchId,
  tipo: source.tipo,
  orden: Number(order) || 1,
  titulo: source.titulo ?? '',
  consigna: source.consigna || '',
  elements: cloneSetPieceElementsWithFreshIds(elements || []),
});
