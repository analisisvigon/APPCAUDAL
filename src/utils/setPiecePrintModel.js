import {
  getSetPieceChronology,
  getSetPieceDefenseTypeLabel,
  getSetPieceDefensiveStructure,
  getSetPieceDeliveryTypeLabel,
  getSetPieceIndividualInstructions,
  getSetPieceTacticalMeta,
  groupSetPieceIndividualInstructions,
  isDefensiveSetPieceType,
  optimizeSetPieceElementsForPrint,
} from './setPieceProfessional.js';
import { getSetPieceLabType } from './setPieceLaboratory.js';

const PLACEHOLDER_VALUES = new Set([
  'consigna pendiente de definir',
  'objetivo pendiente de definir',
  'sin definir',
  'sin observaciones',
  'sin alternativa',
  'sin riesgo',
  'sin roles asignados',
]);

export const normalizeSetPieceComparableText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[_\-/\\]+/g, ' ')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLocaleLowerCase('es');

const normalizeComparableText = normalizeSetPieceComparableText;

export const areSetPieceLabelsEquivalent = (type, title, order) => {
  const normalizedType = normalizeComparableText(type);
  const normalizedTitle = normalizeComparableText(title);
  if (!normalizedType || !normalizedTitle) return false;
  if (normalizedType === normalizedTitle) return true;
  const numericOrder = Number(order);
  if (!Number.isFinite(numericOrder)) return false;
  const titleWithoutGenericOrder = normalizedTitle
    .replace(new RegExp(`(?:\\s+jugada)?\\s+${numericOrder}$`), '')
    .trim();
  return titleWithoutGenericOrder === normalizedType;
};

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

export const shouldUseSingleSetPiecePrintPage = (play) => {
  const indications = Array.isArray(play?.individualInstructions) ? play.individualInstructions : [];
  if (indications.length < 9) return false;
  const instructionCharacters = indications.reduce((total, item) => total + String(item?.instruction || '').trim().length, 0);
  return instructionCharacters > indications.length * 72;
};

export const paginateSetPiecePrintPlays = (plays = []) => plays.reduce((pages, play) => {
  const previousPage = pages.at(-1);
  const playNeedsFullPage = shouldUseSingleSetPiecePrintPage(play);
  const previousPlayNeedsFullPage = previousPage?.some(shouldUseSingleSetPiecePrintPage);
  if (!previousPage || previousPage.length >= 2 || playNeedsFullPage || previousPlayNeedsFullPage) {
    pages.push([play]);
  } else {
    previousPage.push(play);
  }
  return pages;
}, []);

export const getSetPiecePrintTypeLabel = (type) => (
  getSetPieceLabType(type).label
);

const formatIdentity = (element, displayLayers) => {
  const number = getMeaningfulSetPiecePrintText(element?.label);
  const abbreviation = getMeaningfulSetPiecePrintText(element?.printName);
  return [
    displayLayers.dorsals ? number : '',
    displayLayers.abbreviations ? abbreviation : '',
  ].filter((value, index, values) => value && values.indexOf(value) === index).join(' ');
};

export const buildSetPiecePrintPlayModel = (diagram, players = [], fallbackOrder = 1, options = {}) => {
  const meta = getSetPieceTacticalMeta(diagram?.elements);
  const elements = optimizeSetPieceElementsForPrint(diagram?.elements, players);
  const elementsById = new Map(elements.map((element) => [element.id, element]));
  const order = Number(diagram?.orden) || fallbackOrder;
  const typeLabel = getSetPiecePrintTypeLabel(diagram?.tipo);
  const defensive = isDefensiveSetPieceType(diagram?.tipo);
  const displayLayers = meta.displayLayers;
  const destination = defensive ? '' : getMeaningfulSetPiecePrintText(meta.libraryZone);
  const delivery = defensive ? '' : getMeaningfulSetPiecePrintText(getSetPieceDeliveryTypeLabel(meta.deliveryType));
  const defenseTypeLabel = defensive ? getSetPieceDefenseTypeLabel(meta.libraryMarking) : '';
  const storedTitle = getMeaningfulSetPiecePrintText(diagram?.titulo);
  const title = storedTitle || typeLabel || `Jugada ${order}`;
  const displayTitle = storedTitle && !areSetPieceLabelsEquivalent(typeLabel, storedTitle, order) ? storedTitle : '';
  const defensiveStructure = defensive ? getSetPieceDefensiveStructure(diagram?.elements) : '';
  const chronology = (displayLayers.chronology ? getSetPieceChronology(diagram?.elements, players) : []).map((step) => ({
    ...step,
    identity: formatIdentity(elementsById.get(step.id), displayLayers),
    role: displayLayers.roles ? getMeaningfulSetPiecePrintText(step.role) : '',
    instruction: getMeaningfulSetPiecePrintText(step.instruction),
  }));
  const individualInstructions = getSetPieceIndividualInstructions(diagram?.elements, players).map((item) => ({
    ...item,
    identity: formatIdentity(elementsById.get(item.id), displayLayers),
    role: displayLayers.roles ? getMeaningfulSetPiecePrintText(item.role) : '',
    instruction: getMeaningfulSetPiecePrintText(item.instruction),
  }));
  const rawInstruction = getMeaningfulSetPiecePrintText(diagram?.consigna || meta.generalInstruction);
  const rawObjective = getMeaningfulSetPiecePrintText(meta.objective);
  const defenseTypeComparables = new Set([
    normalizeComparableText(defenseTypeLabel),
    normalizeComparableText(`Defensa ${defenseTypeLabel}`),
  ].filter(Boolean));
  const instruction = defensive && defensiveStructure && normalizeComparableText(rawInstruction) === normalizeComparableText(defensiveStructure)
    ? ''
    : rawInstruction;
  const objective = defensive && defenseTypeLabel && defenseTypeComparables.has(normalizeComparableText(rawObjective))
    ? ''
    : rawObjective;
  return {
    id: diagram?.id,
    order,
    typeLabel,
    defensive,
    defenseTypeLabel,
    defensiveStructure,
    title,
    displayTitle,
    showPlayNumber: Number(options.totalPlayCount) > 1,
    deliveryType: meta.deliveryType,
    deliveryTypeLabel: getSetPieceDeliveryTypeLabel(meta.deliveryType),
    headerFacts: [
      defensiveStructure ? { id: 'structure', label: 'Estructura', value: defensiveStructure } : null,
      destination ? { id: 'destination', label: 'Destino', value: destination } : null,
      delivery ? { id: 'delivery', label: 'Golpeo', value: delivery } : null,
    ].filter(Boolean),
    signal: getMeaningfulSetPiecePrintText(meta.signal),
    instruction,
    objective,
    whenToUse: getMeaningfulSetPiecePrintText(meta.whenToUse),
    risk: getMeaningfulSetPiecePrintText(meta.risk),
    alternative: getMeaningfulSetPiecePrintText(meta.alternative),
    observations: getMeaningfulSetPiecePrintText(meta.observations),
    displayLayers,
    chronology,
    individualInstructions,
    instructionGroups: groupSetPieceIndividualInstructions(individualInstructions, diagram?.tipo),
    elements,
    fullField: String(diagram?.tipo || '').includes('saque_inicio'),
  };
};

export const buildSetPiecePrintPages = (diagrams = [], players = [], options = {}) => {
  const totalPlayCount = Number.isFinite(Number(options.totalPlayCount))
    ? Number(options.totalPlayCount)
    : diagrams.length;
  const printPlays = diagrams.map((diagram, index) => buildSetPiecePrintPlayModel(diagram, players, index + 1, { totalPlayCount }));
  return paginateSetPiecePrintPlays(printPlays).map((pagePlays, pageIndex) => ({
    pageNumber: pageIndex + 1,
    plays: pagePlays,
  }));
};
