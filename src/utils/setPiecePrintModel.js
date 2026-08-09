import {
  SET_PIECE_PRINT_IDENTITY_MODES,
  getSetPieceChronology,
  getSetPieceTacticalMeta,
  optimizeSetPieceElementsForPrint,
} from './setPieceProfessional.js';

const TYPE_LABELS = Object.freeze({
  corner_ofensivo: 'Córner ofensivo',
  falta_lateral_ofensiva: 'Falta lateral ofensiva',
  saque_banda_ofensivo: 'Saque de banda ofensivo',
  saque_inicio_ofensivo: 'Saque de inicio',
  corner_defensivo: 'Córner defensivo',
  falta_lateral_defensiva: 'Falta lateral defensiva',
  saque_banda_defensivo: 'Saque de banda defensivo',
});

const PLACEHOLDER_VALUES = new Set([
  'consigna pendiente de definir',
  'objetivo pendiente de definir',
  'sin definir',
  'sin observaciones',
  'sin alternativa',
  'sin riesgo',
  'sin roles asignados',
]);

const normalizeComparableText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[.!:;]+$/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLocaleLowerCase('es');

export const getMeaningfulSetPiecePrintText = (value) => {
  const text = String(value || '').trim();
  if (!text || PLACEHOLDER_VALUES.has(normalizeComparableText(text))) return '';
  return text;
};

export const chunkSetPiecePrintPlays = (plays = [], size = 2) => {
  const chunks = [];
  for (let index = 0; index < plays.length; index += size) chunks.push(plays.slice(index, index + size));
  return chunks;
};

export const getSetPiecePrintTypeLabel = (type) => (
  TYPE_LABELS[type]
  || String(type || '').replaceAll('_', ' ').replace(/^./, (character) => character.toUpperCase())
);

const formatIdentity = (element, mode) => {
  const number = getMeaningfulSetPiecePrintText(element?.label);
  const abbreviation = getMeaningfulSetPiecePrintText(element?.printName);
  if (mode === SET_PIECE_PRINT_IDENTITY_MODES.NUMBER) return number || abbreviation;
  if (mode === SET_PIECE_PRINT_IDENTITY_MODES.ABBREVIATION) return abbreviation || number;
  return [number, abbreviation].filter((value, index, values) => value && values.indexOf(value) === index).join(' ');
};

export const buildSetPiecePrintPlayModel = (diagram, players = [], fallbackOrder = 1) => {
  const meta = getSetPieceTacticalMeta(diagram?.elements);
  const elements = optimizeSetPieceElementsForPrint(diagram?.elements, players);
  const elementsById = new Map(elements.map((element) => [element.id, element]));
  const order = Number(diagram?.orden) || fallbackOrder;
  const typeLabel = getSetPiecePrintTypeLabel(diagram?.tipo);
  const chronology = getSetPieceChronology(diagram?.elements, players).map((step) => ({
    ...step,
    identity: formatIdentity(elementsById.get(step.id), meta.printIdentityMode) || getMeaningfulSetPiecePrintText(step.playerName),
    role: getMeaningfulSetPiecePrintText(step.role),
    instruction: getMeaningfulSetPiecePrintText(step.instruction),
  }));
  return {
    id: diagram?.id,
    order,
    typeLabel,
    title: getMeaningfulSetPiecePrintText(diagram?.titulo) || typeLabel || `Jugada ${order}`,
    classifications: [meta.libraryZone, meta.libraryMechanism, meta.libraryMarking]
      .map(getMeaningfulSetPiecePrintText)
      .filter(Boolean),
    instruction: getMeaningfulSetPiecePrintText(diagram?.consigna || meta.generalInstruction),
    objective: getMeaningfulSetPiecePrintText(meta.objective),
    whenToUse: getMeaningfulSetPiecePrintText(meta.whenToUse),
    risk: getMeaningfulSetPiecePrintText(meta.risk),
    alternative: getMeaningfulSetPiecePrintText(meta.alternative),
    observations: getMeaningfulSetPiecePrintText(meta.observations),
    identityMode: meta.printIdentityMode,
    chronology,
    elements,
    fullField: String(diagram?.tipo || '').includes('saque_inicio'),
  };
};

export const buildSetPiecePrintPages = (diagrams = [], players = []) => (
  chunkSetPiecePrintPlays(diagrams, 2).map((pageDiagrams, pageIndex) => ({
    pageNumber: pageIndex + 1,
    plays: pageDiagrams.map((diagram, index) => buildSetPiecePrintPlayModel(diagram, players, pageIndex * 2 + index + 1)),
  }))
);
