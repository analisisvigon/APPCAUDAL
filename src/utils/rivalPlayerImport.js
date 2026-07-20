import { mapExternalPositionToPlayerPositions } from '../constants/playerPositions.js';

export const emptyImportedFieldTokens = new Set([
  '', '-', 'sin información', 'sin informacion', 'sin posición', 'sin posicion',
  'edad pendiente', 'no indicada', 'no indicado', 'pendiente', 'avatar por defecto',
]);

export const isEmptyImportedField = (value) => {
  if (value == null) return true;
  return emptyImportedFieldTokens.has(String(value).trim().toLowerCase());
};

export const cleanImportedFieldValue = (value, fallback = '') => isEmptyImportedField(value) ? fallback : value;

export const extractTransfermarktPlayerId = (url) => String(url || '').match(/\/spieler\/(\d+)/i)?.[1] || null;

export const normalizeTransfermarktPosition = (value) => {
  return mapExternalPositionToPlayerPositions(value);
};

export const resolveImportedValue = ({ existingValue, incomingValue, resolution }) => {
  if (isEmptyImportedField(existingValue) && !isEmptyImportedField(incomingValue)) return incomingValue;
  if (resolution === 'incoming') return incomingValue;
  return existingValue;
};
