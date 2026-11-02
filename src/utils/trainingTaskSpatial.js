const BOARD_WIDTH = 100;
const BOARD_LENGTH = 72;
const MATERIAL_TYPES = new Set(['ball', 'cone', 'pole', 'mannequin', 'hoop', 'goal', 'mini_goal', 'block']);

const finitePositive = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const round = (value) => Math.round(value * 10) / 10;

/**
 * The task stores width first and length second. The board keeps the same
 * legacy 100 × 72 coordinate system: X represents width, Y represents length.
 */
export const readTrainingTaskSpace = (spaceWidthM, spaceLengthM) => {
  const widthM = finitePositive(spaceWidthM);
  const lengthM = finitePositive(spaceLengthM);
  return widthM && lengthM ? { widthM, lengthM } : null;
};

export const getTrainingTaskZoneMetres = (zone, space) => {
  if (!space || zone?.type !== 'zone') return null;
  return {
    widthM: round((Number(zone.width) || 0) / BOARD_WIDTH * space.widthM),
    lengthM: round((Number(zone.height) || 0) / BOARD_LENGTH * space.lengthM),
  };
};

export const applyTrainingTaskZoneMetres = (zone, space, metres = {}) => {
  if (!space || zone?.type !== 'zone') return zone;
  const current = getTrainingTaskZoneMetres(zone, space);
  const widthM = finitePositive(metres.widthM) || current.widthM;
  const lengthM = finitePositive(metres.lengthM) || current.lengthM;
  const width = clamp(widthM / space.widthM * BOARD_WIDTH, 4, BOARD_WIDTH);
  const height = clamp(lengthM / space.lengthM * BOARD_LENGTH, 4, BOARD_LENGTH);
  const x = clamp(Number(zone.x) || 0, 0, BOARD_WIDTH - width);
  const y = clamp(Number(zone.y) || 0, 0, BOARD_LENGTH - height);
  return {
    ...zone,
    x,
    y,
    width,
    height,
    spatialMode: 'measured',
    zoneWidthM: round(width / BOARD_WIDTH * space.widthM),
    zoneLengthM: round(height / BOARD_LENGTH * space.lengthM),
  };
};

export const accreditTrainingTaskZone = (zone, space) => {
  if (!space || zone?.type !== 'zone') return zone;
  return applyTrainingTaskZoneMetres(zone, space, getTrainingTaskZoneMetres(zone, space));
};

export const getTrainingTaskSpatialPosition = (element, space) => {
  if (!space || !MATERIAL_TYPES.has(element?.type)) return null;
  return {
    widthM: round(clamp(Number(element.x) || 0, 0, BOARD_WIDTH) / BOARD_WIDTH * space.widthM),
    lengthM: round(clamp(Number(element.y) || 0, 0, BOARD_LENGTH) / BOARD_LENGTH * space.lengthM),
  };
};

/** Adds only non-breaking metadata. Legacy geometry remains the source of rendering. */
export const synchronizeTrainingTaskSpatialMetadata = (elements = [], space) => {
  if (!space) return elements;
  return elements.map((element) => {
    if (element?.type === 'zone' && element.spatialMode === 'measured') {
      return applyTrainingTaskZoneMetres(element, space, getTrainingTaskZoneMetres(element, space));
    }
    if (MATERIAL_TYPES.has(element?.type)) {
      const position = getTrainingTaskSpatialPosition(element, space);
      return { ...element, spatialPosition: { version: 1, ...position } };
    }
    return element;
  });
};

export const getTrainingTaskSpatialCaption = (space) => space
  ? `${space.lengthM} × ${space.widthM} m · largo × ancho`
  : 'Sin dimensiones acreditadas · modo visual';

