import {
  clampDiagramCoordinate,
  DIAGRAM_PITCH_CATALOG,
  DIAGRAM_PITCH_TYPES,
} from './diagramScene.js';

export const TRAINING_TASK_EDITOR_SCHEMA_VERSION = 1;
export const TRAINING_TASK_EDITOR_PAYLOAD_LIMIT_BYTES = 256 * 1024;
export const TRAINING_TASK_EDITOR_ELEMENT_TYPES = Object.freeze([
  'player',
  'opponent',
  'ball',
  'arrow',
  'dashed_arrow',
  'curved_arrow',
  'double_arrow',
  'zone',
  'block',
  'text',
  'text_box',
  'participant',
  'cone',
  'pole',
  'mannequin',
  'hoop',
  'goal',
  'mini_goal',
  'line',
  'dashed_line',
]);

const ARROW_ELEMENT_TYPES = new Set(['arrow', 'dashed_arrow', 'curved_arrow', 'double_arrow', 'line', 'dashed_line']);
const EPHEMERAL_EDITOR_KEYS = new Set([
  'selectedId', 'hover', 'hoverId', 'zoom', 'undo', 'redo', 'history', 'drag', 'clipboard',
]);

const POSITION_COORDINATES = Object.freeze([
  ['x', 'x'], ['y', 'y'], ['x1', 'x'], ['y1', 'y'], ['x2', 'x'], ['y2', 'y'],
  ['controlX', 'x'], ['controlY', 'y'],
]);

const isPlainObject = (value) => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
);

const cloneJsonValue = (value) => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const isEmptyPayload = (payload) => (
  payload == null || (isPlainObject(payload) && Object.keys(payload).length === 0)
);

const normalizeElement = (element) => {
  const normalized = { ...element, id: String(element.id), type: String(element.type) };
  POSITION_COORDINATES.forEach(([field, axis]) => {
    if (!(field in element)) return;
    const coordinate = clampDiagramCoordinate(element[field], axis);
    if (coordinate !== null) normalized[field] = coordinate;
  });
  return normalized;
};

const validateV1Board = (board) => {
  if (!isPlainObject(board)) return 'board debe ser un objeto.';
  if (!Object.prototype.hasOwnProperty.call(DIAGRAM_PITCH_CATALOG, board.pitchType)) return 'pitchType no esta soportado en V1.';
  if (!Array.isArray(board.elements)) return 'elements debe ser una coleccion.';
  const ids = new Set();
  for (const element of board.elements) {
    if (!isPlainObject(element) || !String(element.id || '').trim() || !String(element.type || '').trim()) {
      return 'Cada elemento debe tener id y type.';
    }
    if (ids.has(String(element.id))) return 'Los ids de elementos deben ser unicos.';
    ids.add(String(element.id));
    if (!TRAINING_TASK_EDITOR_ELEMENT_TYPES.includes(String(element.type))) return `Tipo de elemento V1 no soportado: ${element.type}.`;
    const requiredCoordinates = ARROW_ELEMENT_TYPES.has(String(element.type))
      ? ['x1', 'y1', 'x2', 'y2']
      : ['x', 'y'];
    if (requiredCoordinates.some((field) => !Number.isFinite(Number(element[field])))) {
      return `El elemento ${element.id} no tiene coordenadas relativas validas.`;
    }
  }
  return '';
};

export const createTrainingTaskEditorSceneV1 = ({
  pitchType = DIAGRAM_PITCH_TYPES.FULL,
  elements = [],
} = {}) => {
  const payload = {
    schemaVersion: TRAINING_TASK_EDITOR_SCHEMA_VERSION,
    board: { pitchType, elements },
  };
  const result = readTrainingTaskEditorPayload(payload);
  if (result.kind !== 'v1') throw new TypeError(result.error || 'Escena V1 no valida.');
  assertSafeTrainingTaskEditorPayload(result.scene);
  return result.scene;
};

export const readTrainingTaskEditorPayload = (payload) => {
  if (isEmptyPayload(payload)) return { kind: 'empty', scene: null, sourcePayload: payload ?? {} };
  if (!isPlainObject(payload)) return { kind: 'invalid', scene: null, sourcePayload: payload, error: 'editor_payload debe ser un objeto JSON.' };
  if (payload.schemaVersion !== TRAINING_TASK_EDITOR_SCHEMA_VERSION) {
    return { kind: 'unsupported', scene: null, sourcePayload: cloneJsonValue(payload) };
  }
  const error = validateV1Board(payload.board);
  if (error) return { kind: 'invalid', scene: null, sourcePayload: cloneJsonValue(payload), error };
  const scene = {
    ...cloneJsonValue(payload),
    schemaVersion: TRAINING_TASK_EDITOR_SCHEMA_VERSION,
    board: {
      ...cloneJsonValue(payload.board),
      pitchType: payload.board.pitchType,
      elements: payload.board.elements.map(normalizeElement),
    },
  };
  return { kind: 'v1', scene, sourcePayload: cloneJsonValue(payload) };
};

const inspectJsonValue = (value, seen) => {
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' || value === undefined) {
    throw new TypeError('editor_payload solo admite valores JSON.');
  }
  if (typeof value === 'string' && /^data:/i.test(value.trim())) {
    throw new TypeError('editor_payload no admite recursos embebidos/base64.');
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('editor_payload no admite numeros no finitos.');
  }
  if (value === null || typeof value !== 'object') return;
  if (seen.has(value)) throw new TypeError('editor_payload no admite referencias circulares.');
  seen.add(value);
  if (!Array.isArray(value) && !isPlainObject(value)) throw new TypeError('editor_payload solo admite objetos JSON puros.');
  if (!Array.isArray(value) && Object.keys(value).some((key) => EPHEMERAL_EDITOR_KEYS.has(key))) {
    throw new TypeError('editor_payload no admite estado efimero de la interfaz.');
  }
  Object.values(value).forEach((entry) => inspectJsonValue(entry, seen));
  seen.delete(value);
};

export const assertSafeTrainingTaskEditorPayload = (payload) => {
  inspectJsonValue(payload, new Set());
  return payload;
};

export const serializeTrainingTaskEditorScene = (scene) => {
  assertSafeTrainingTaskEditorPayload(scene);
  const result = readTrainingTaskEditorPayload(scene);
  if (result.kind !== 'v1') throw new TypeError(result.error || 'Solo se pueden serializar escenas V1 compatibles.');
  return result.scene;
};

const expandExponentialNumber = (value) => {
  const serialized = JSON.stringify(value);
  if (!/[eE]/.test(serialized)) return serialized;
  const [coefficient, exponentText] = serialized.toLowerCase().split('e');
  const negative = coefficient.startsWith('-');
  const unsigned = negative ? coefficient.slice(1) : coefficient;
  const [integer, fraction = ''] = unsigned.split('.');
  const digits = `${integer}${fraction}`;
  const decimalPosition = integer.length + Number(exponentText);
  const expanded = decimalPosition <= 0
    ? `0.${'0'.repeat(-decimalPosition)}${digits}`
    : decimalPosition >= digits.length
      ? `${digits}${'0'.repeat(decimalPosition - digits.length)}`
      : `${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`;
  return negative ? `-${expanded}` : expanded;
};

// PostgreSQL applies the SQL constraint to editor_payload::text. jsonb uses a
// space after separators and expands numeric exponents, unlike JSON.stringify.
const serializePostgresJsonbText = (value) => {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') return expandExponentialNumber(value);
  if (Array.isArray(value)) return `[${value.map(serializePostgresJsonbText).join(', ')}]`;
  return `{${Object.entries(value)
    .map(([key, entry]) => `${JSON.stringify(key)}: ${serializePostgresJsonbText(entry)}`)
    .join(', ')}}`;
};

export const measureTrainingTaskEditorPayloadBytes = (payload) => {
  assertSafeTrainingTaskEditorPayload(payload);
  const serialized = serializePostgresJsonbText(payload);
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(serialized).byteLength;
  return Buffer.byteLength(serialized, 'utf8');
};

export const getTrainingTaskEditorPayloadSize = (payload) => {
  const bytes = measureTrainingTaskEditorPayloadBytes(payload);
  return {
    bytes,
    limitBytes: TRAINING_TASK_EDITOR_PAYLOAD_LIMIT_BYTES,
    remainingBytes: TRAINING_TASK_EDITOR_PAYLOAD_LIMIT_BYTES - bytes,
    exceedsLimit: bytes > TRAINING_TASK_EDITOR_PAYLOAD_LIMIT_BYTES,
  };
};
