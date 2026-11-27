const BOARD_WIDTH = 100;
const BOARD_LENGTH = 72;
const MATERIAL_TYPES = new Set(['ball', 'cone', 'pole', 'mannequin', 'hoop', 'goal', 'mini_goal', 'block']);
export const TRAINING_TASK_REFERENCE_FIELD = Object.freeze({ lengthM: 105, widthM: 60 });
export const TRAINING_TASK_METRIC_CALIBRATION_VERSION = 1;

const finitePositive = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const round = (value) => Math.round(value * 10) / 10;

export const createTrainingTaskMetricCalibration = (pitchType = 'full') => ({
  version: TRAINING_TASK_METRIC_CALIBRATION_VERSION,
  unit: 'm',
  fieldLengthM: TRAINING_TASK_REFERENCE_FIELD.lengthM,
  fieldWidthM: TRAINING_TASK_REFERENCE_FIELD.widthM,
  viewOriginXM: pitchType === 'half' || pitchType === 'penalty-area'
    ? TRAINING_TASK_REFERENCE_FIELD.lengthM / 2 : 0,
  viewLengthM: pitchType === 'half' || pitchType === 'penalty-area'
    ? TRAINING_TASK_REFERENCE_FIELD.lengthM / 2 : TRAINING_TASK_REFERENCE_FIELD.lengthM,
  viewWidthM: TRAINING_TASK_REFERENCE_FIELD.widthM,
  gridStepM: 5,
  showGrid: false,
  snapToGrid: false,
  showZoneDimensions: true,
  showMeasurements: true,
});

export const readTrainingTaskMetricCalibration = (board) => {
  const value = board?.metricCalibration;
  if (!value || value.version !== TRAINING_TASK_METRIC_CALIBRATION_VERSION || value.unit !== 'm' ||
      Number(value.fieldLengthM) !== TRAINING_TASK_REFERENCE_FIELD.lengthM ||
      Number(value.fieldWidthM) !== TRAINING_TASK_REFERENCE_FIELD.widthM) return null;
  const viewLengthM = finitePositive(value.viewLengthM);
  const viewWidthM = finitePositive(value.viewWidthM);
  if (!viewLengthM || !viewWidthM || viewLengthM > TRAINING_TASK_REFERENCE_FIELD.lengthM ||
      viewWidthM > TRAINING_TASK_REFERENCE_FIELD.widthM) return null;
  return { ...value, viewLengthM, viewWidthM,
    gridStepM: [1, 2, 5, 10].includes(Number(value.gridStepM)) ? Number(value.gridStepM) : 5 };
};

export const getTrainingTaskBoardBounds = (board) => {
  const calibration = readTrainingTaskMetricCalibration(board);
  return calibration
    ? { width: calibration.viewLengthM, height: calibration.viewWidthM, metric: true }
    : { width: BOARD_WIDTH, height: BOARD_LENGTH, metric: false };
};

const scaleElementGeometry = (element, scaleX, scaleY) => {
  const next = { ...element };
  for (const key of ['x', 'x1', 'x2', 'controlX']) if (Number.isFinite(Number(next[key]))) next[key] = Number(next[key]) * scaleX;
  for (const key of ['y', 'y1', 'y2', 'controlY']) if (Number.isFinite(Number(next[key]))) next[key] = Number(next[key]) * scaleY;
  if (Number.isFinite(Number(next.width))) next.width = Number(next.width) * scaleX;
  if (Number.isFinite(Number(next.height))) next.height = Number(next.height) * scaleY;
  delete next.spatialPosition;
  delete next.spatialMode;
  delete next.zoneWidthM;
  delete next.zoneLengthM;
  return next;
};

export const activateTrainingTaskMetricCalibration = (board) => {
  if (readTrainingTaskMetricCalibration(board)) return board;
  const calibration = createTrainingTaskMetricCalibration(board?.pitchType);
  const scaleX = calibration.viewLengthM / BOARD_WIDTH;
  const scaleY = calibration.viewWidthM / BOARD_LENGTH;
  return {
    ...board,
    metricCalibration: calibration,
    elements: (board?.elements || []).map((element) => scaleElementGeometry(element, scaleX, scaleY)),
    measurements: [],
  };
};

export const updateTrainingTaskMetricPitch = (board, pitchType) => {
  const current = readTrainingTaskMetricCalibration(board);
  if (!current) return { ...board, pitchType };
  const nextCalibration = { ...current, ...createTrainingTaskMetricCalibration(pitchType),
    gridStepM: current.gridStepM, showGrid: current.showGrid,
    snapToGrid: current.snapToGrid, showZoneDimensions: current.showZoneDimensions,
    showMeasurements: current.showMeasurements };
  const scaleX = nextCalibration.viewLengthM / current.viewLengthM;
  return { ...board, pitchType, metricCalibration: nextCalibration,
    elements: (board.elements || []).map((element) => scaleElementGeometry(element, scaleX, 1)),
    measurements: (board.measurements || []).map((measurement) => ({ ...measurement,
      from: measurement.from?.kind === 'point' ? { ...measurement.from, x: Number(measurement.from.x) * scaleX } : measurement.from,
      to: measurement.to?.kind === 'point' ? { ...measurement.to, x: Number(measurement.to.x) * scaleX } : measurement.to,
    })) };
};

export const getTrainingTaskMetricZoneDimensions = (zone, board) => {
  if (!readTrainingTaskMetricCalibration(board) || zone?.type !== 'zone') return null;
  return { lengthM: round(Number(zone.width) || 0), widthM: round(Number(zone.height) || 0) };
};

export const applyTrainingTaskMetricZoneDimensions = (zone, board, dimensions = {}) => {
  const bounds = getTrainingTaskBoardBounds(board);
  if (!bounds.metric || zone?.type !== 'zone') return zone;
  const current = getTrainingTaskMetricZoneDimensions(zone, board);
  const lengthM = clamp(finitePositive(dimensions.lengthM) || current.lengthM, .1, bounds.width);
  const widthM = clamp(finitePositive(dimensions.widthM) || current.widthM, .1, bounds.height);
  return { ...zone, x: clamp(Number(zone.x) || 0, 0, bounds.width - lengthM),
    y: clamp(Number(zone.y) || 0, 0, bounds.height - widthM), width: lengthM, height: widthM };
};

const elementPoint = (element) => {
  if (!element) return null;
  if (Number.isFinite(Number(element.x)) && Number.isFinite(Number(element.y))) {
    return { x: Number(element.x), y: Number(element.y) };
  }
  if (Number.isFinite(Number(element.x1)) && Number.isFinite(Number(element.y1))) {
    return { x: Number(element.x1), y: Number(element.y1) };
  }
  return null;
};

export const resolveTrainingTaskMeasurementPoint = (endpoint, elements = []) => endpoint?.kind === 'element'
  ? elementPoint(elements.find((element) => element.id === endpoint.elementId))
  : endpoint?.kind === 'point' && Number.isFinite(Number(endpoint.x)) && Number.isFinite(Number(endpoint.y))
    ? { x: Number(endpoint.x), y: Number(endpoint.y) } : null;

export const getTrainingTaskMeasurementDistance = (measurement, elements = []) => {
  const from = resolveTrainingTaskMeasurementPoint(measurement?.from, elements);
  const to = resolveTrainingTaskMeasurementPoint(measurement?.to, elements);
  return from && to ? round(Math.hypot(to.x - from.x, to.y - from.y)) : null;
};

export const createTrainingTaskMeasurement = (from, to, id = crypto.randomUUID()) => ({
  id, from, to, colorKey: 'yellow', label: '', visible: true,
});

export const setTrainingTaskMeasurementDistance = (measurement, elements, distanceM, board = null) => {
  const desired = finitePositive(distanceM);
  const from = resolveTrainingTaskMeasurementPoint(measurement?.from, elements);
  const to = resolveTrainingTaskMeasurementPoint(measurement?.to, elements);
  if (!desired || !from || !to || measurement?.to?.kind !== 'element') return elements;
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const direction = length > 0 ? { x: (to.x - from.x) / length, y: (to.y - from.y) / length } : { x: 1, y: 0 };
  const bounds = getTrainingTaskBoardBounds(board);
  const target = {
    x: clamp(from.x + direction.x * desired, 0, bounds.width),
    y: clamp(from.y + direction.y * desired, 0, bounds.height),
  };
  return elements.map((element) => element.id === measurement.to.elementId
    ? { ...element, x: target.x, y: target.y } : element);
};

export const snapTrainingTaskMetricValue = (value, calibration) => {
  const step = readTrainingTaskMetricCalibration({ metricCalibration: calibration })?.gridStepM || 1;
  return Math.round(Number(value) / step) * step;
};

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

