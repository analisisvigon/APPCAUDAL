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
  const raw = String(value || '').trim();
  const text = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!text) return { position: '', specificPosition: '' };
  if (/^(por|pt|gk|goalkeeper|keeper|portero|arquero|guardameta)$/.test(text)) return { position: 'Portero', specificPosition: 'Portero' };
  if (/(centre back|center back|central|defensa|zaguero|dfc|cb|left back|right back|lateral|carrilero|li\b|ld\b|lb\b|rb\b)/.test(text)) return { position: 'Defensa', specificPosition: raw };
  if (/(defensive midfield|central midfield|attacking midfield|mediocentro|centrocampista|medio centro|medio defensivo|pivote|mediapunta|interior|mcd|mc\b|mp\b|dm\b|cm\b|am\b)/.test(text)) return { position: 'Centrocampista', specificPosition: raw };
  if (/(right winger|left winger|extremo|centre forward|center forward|delantero|forward|atacante|punta|striker|ed\b|ei\b|rw\b|lw\b|dc\b|cf\b|st\b)/.test(text)) return { position: 'Atacante', specificPosition: raw };
  return { position: '', specificPosition: raw };
};

export const resolveImportedValue = ({ existingValue, incomingValue, resolution }) => {
  if (isEmptyImportedField(existingValue) && !isEmptyImportedField(incomingValue)) return incomingValue;
  if (resolution === 'incoming') return incomingValue;
  return existingValue;
};
