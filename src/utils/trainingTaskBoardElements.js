import { createDiagramElementId } from './diagramEditorState.js';

export const TRAINING_BOARD_PALETTE = Object.freeze({
  blue: Object.freeze({ key: 'blue', label: 'Azul', value: '#2563eb', contrast: '#ffffff' }),
  red: Object.freeze({ key: 'red', label: 'Rojo', value: '#dc2626', contrast: '#ffffff' }),
  yellow: Object.freeze({ key: 'yellow', label: 'Amarillo', value: '#facc15', contrast: '#172033' }),
  green: Object.freeze({ key: 'green', label: 'Verde', value: '#16a34a', contrast: '#ffffff' }),
  orange: Object.freeze({ key: 'orange', label: 'Naranja', value: '#f97316', contrast: '#172033' }),
  purple: Object.freeze({ key: 'purple', label: 'Morado', value: '#9333ea', contrast: '#ffffff' }),
  white: Object.freeze({ key: 'white', label: 'Blanco', value: '#f8fafc', contrast: '#172033' }),
  black: Object.freeze({ key: 'black', label: 'Negro', value: '#111827', contrast: '#ffffff' }),
});

export const TRAINING_BOARD_TEAM_OPTIONS = Object.freeze([
  { key: 'team-1', label: 'Equipo 1', colorKey: 'blue' },
  { key: 'team-2', label: 'Equipo 2', colorKey: 'red' },
  { key: 'team-3', label: 'Equipo 3', colorKey: 'yellow' },
]);

export const TRAINING_BOARD_TOOL_GROUPS = Object.freeze([
  { key: 'participants', label: 'Participantes', tools: [
    ['team-1', 'Equipo 1'], ['team-2', 'Equipo 2'], ['team-3', 'Equipo 3'],
    ['neutral', 'Comodin'], ['goalkeeper', 'Portero'], ['coach', 'Entrenador'],
  ] },
  { key: 'material', label: 'Material', tools: [
    ['ball', 'Balon'], ['cone', 'Cono'], ['pole', 'Pica'], ['mannequin', 'Maniqui'],
    ['hoop', 'Aro'], ['goal', 'Porteria'], ['mini_goal', 'Miniporteria'],
  ] },
  { key: 'drawing', label: 'Dibujo', tools: [
    ['arrow', 'Flecha'], ['curved_arrow', 'Curva'], ['dashed_arrow', 'Discontinua'],
    ['line', 'Linea'], ['dashed_line', 'Linea discontinua'], ['zone', 'Zona'], ['text', 'Texto'],
  ] },
]);

const materialLine = (x1, y1, x2, y2, stroke = 'primary', strokeWidth = 1.6) => ({
  type: 'line', x1, y1, x2, y2, stroke, strokeWidth,
});
const materialPolyline = (points, stroke = 'primary', strokeWidth = 1.6) => ({
  type: 'polyline', points, stroke, strokeWidth,
});
const materialRect = (x, y, width, height, {
  stroke = 'primary', fill = 'none', strokeWidth = 1.5, radius = 0,
} = {}) => ({ type: 'rect', x, y, width, height, stroke, fill, strokeWidth, radius });
const materialEllipse = (cx, cy, rx, ry, {
  stroke = 'primary', fill = 'none', strokeWidth = 1.5,
} = {}) => ({ type: 'ellipse', cx, cy, rx, ry, stroke, fill, strokeWidth });
const conditionalMaterial = (id, name, category, width, height, shapes) => Object.freeze({
  id,
  name,
  category,
  icon: Object.freeze({ viewBox: '0 0 24 24', shapes: Object.freeze(shapes.map((shape) => Object.freeze(shape))) }),
  geometry: Object.freeze({ width, height }),
});

export const TRAINING_CONDITIONAL_MATERIAL_CATEGORIES = Object.freeze([
  'FUERZA',
  'EQUILIBRIO',
  'COORDINACIÓN',
  'PLIOMETRÍA',
  'RESISTENCIA',
  'TRABAJO EN SUELO',
  'VELOCIDAD',
]);

export const TRAINING_CONDITIONAL_MATERIALS = Object.freeze([
  conditionalMaterial('dumbbell', 'Mancuerna', 'FUERZA', 10, 7, [
    materialLine(4, 12, 20, 12, 'primary', 2),
    materialRect(3, 8, 2.5, 8, { fill: 'paper', strokeWidth: 1.6, radius: 0.6 }),
    materialRect(6, 9, 2, 6, { fill: 'accent', strokeWidth: 1.4, radius: 0.5 }),
    materialRect(16, 9, 2, 6, { fill: 'accent', strokeWidth: 1.4, radius: 0.5 }),
    materialRect(18.5, 8, 2.5, 8, { fill: 'paper', strokeWidth: 1.6, radius: 0.6 }),
  ]),
  conditionalMaterial('kettlebell', 'Kettlebell', 'FUERZA', 9, 9, [
    materialEllipse(12, 8.5, 3.8, 3.7, { strokeWidth: 1.8 }),
    materialEllipse(12, 15, 6.4, 5.2, { stroke: 'ink', fill: 'accent', strokeWidth: 1.5 }),
    materialLine(8, 15, 16, 15, 'primary', 1.2),
  ]),
  conditionalMaterial('barbell', 'Barra con discos', 'FUERZA', 12, 7, [
    materialLine(3, 12, 21, 12, 'paper', 1.8),
    materialLine(3, 12, 21, 12, 'ink', 0.5),
    materialRect(3.2, 7, 2, 10, { fill: 'accent', strokeWidth: 1.2, radius: 0.4 }),
    materialRect(6, 8, 1.7, 8, { fill: 'paper', strokeWidth: 1.2, radius: 0.4 }),
    materialRect(16.3, 8, 1.7, 8, { fill: 'paper', strokeWidth: 1.2, radius: 0.4 }),
    materialRect(18.8, 7, 2, 10, { fill: 'accent', strokeWidth: 1.2, radius: 0.4 }),
  ]),
  conditionalMaterial('weight_plate', 'Disco de peso', 'FUERZA', 8, 8, [
    materialEllipse(12, 12, 8, 8, { stroke: 'ink', fill: 'accent', strokeWidth: 1.6 }),
    materialEllipse(12, 12, 4.1, 4.1, { strokeWidth: 1.5, fill: 'turf' }),
    materialEllipse(12, 12, 1.3, 1.3, { strokeWidth: 1.1 }),
  ]),
  conditionalMaterial('medicine_ball', 'Balón medicinal', 'FUERZA', 8, 8, [
    materialEllipse(12, 12, 8, 8, { stroke: 'ink', fill: 'accent', strokeWidth: 1.5 }),
    materialPolyline([[7, 6], [9, 9], [10, 12], [9, 15], [7, 18]], 'primary', 1.1),
    materialPolyline([[17, 6], [15, 9], [14, 12], [15, 15], [17, 18]], 'primary', 1.1),
    materialLine(5, 12, 19, 12, 'ink', 0.8),
  ]),
  conditionalMaterial('bosu', 'BOSU', 'EQUILIBRIO', 10, 8, [
    materialPolyline([[4, 16], [5, 12], [7, 9], [9, 7], [12, 6], [15, 7], [17, 9], [19, 12], [20, 16]], 'paper', 2),
    materialLine(4, 16, 20, 16, 'primary', 2),
    materialRect(6, 17, 12, 2, { fill: 'accent', strokeWidth: 1, radius: 0.6 }),
  ]),
  conditionalMaterial('fitball', 'Fitball', 'EQUILIBRIO', 9, 9, [
    materialEllipse(12, 12, 8.5, 8.5, { stroke: 'ink', fill: 'paper', strokeWidth: 1.5 }),
    materialEllipse(12, 12, 4, 8, { strokeWidth: 1.1 }),
    materialEllipse(12, 12, 8, 3.5, { strokeWidth: 1.1 }),
  ]),
  conditionalMaterial('balance_platform', 'Plataforma de equilibrio', 'EQUILIBRIO', 11, 8, [
    materialRect(3, 6, 18, 4, { fill: 'paper', strokeWidth: 1.5, radius: 1 }),
    materialPolyline([[6, 11], [9, 17], [15, 17], [18, 11]], 'accent', 2),
    materialLine(8, 19, 16, 19, 'primary', 1.5),
  ]),
  conditionalMaterial('coordination_ladder', 'Escalera de coordinación', 'COORDINACIÓN', 13, 8, [
    materialLine(4, 4, 4, 20, 'accent', 2),
    materialLine(20, 4, 20, 20, 'accent', 2),
    materialLine(4, 6, 20, 6, 'paper', 1.4),
    materialLine(4, 9, 20, 9, 'paper', 1.4),
    materialLine(4, 12, 20, 12, 'paper', 1.4),
    materialLine(4, 15, 20, 15, 'paper', 1.4),
    materialLine(4, 18, 20, 18, 'paper', 1.4),
  ]),
  conditionalMaterial('hoops', 'Aros', 'COORDINACIÓN', 12, 7, [
    materialEllipse(6, 12, 3.6, 5.2, { stroke: 'accent', strokeWidth: 1.8 }),
    materialEllipse(12, 12, 3.6, 5.2, { stroke: 'paper', strokeWidth: 1.8 }),
    materialEllipse(18, 12, 3.6, 5.2, { stroke: 'primary', strokeWidth: 1.8 }),
  ]),
  conditionalMaterial('low_hurdle', 'Valla baja', 'COORDINACIÓN', 11, 8, [
    materialLine(4, 7, 20, 7, 'accent', 2),
    materialLine(6, 7, 6, 18, 'paper', 1.7),
    materialLine(18, 7, 18, 18, 'paper', 1.7),
    materialLine(3, 19, 9, 19, 'primary', 1.6),
    materialLine(15, 19, 21, 19, 'primary', 1.6),
  ]),
  conditionalMaterial('plyometric_box', 'Cajón pliométrico', 'PLIOMETRÍA', 10, 9, [
    materialRect(5, 9, 12, 10, { fill: 'accent', stroke: 'ink', strokeWidth: 1.3, radius: 0.5 }),
    materialPolyline([[5, 9], [9, 5], [21, 5], [17, 9]], 'paper', 1.5),
    materialPolyline([[17, 9], [21, 5], [21, 15], [17, 19]], 'primary', 1.4),
    materialLine(7, 12, 15, 12, 'primary', 0.9),
  ]),
  conditionalMaterial('step', 'Step', 'PLIOMETRÍA', 11, 7, [
    materialRect(3, 9, 18, 6, { fill: 'accent', stroke: 'ink', strokeWidth: 1.4, radius: 1 }),
    materialLine(6, 16, 6, 19, 'paper', 1.8),
    materialLine(18, 16, 18, 19, 'paper', 1.8),
    materialLine(4, 20, 8, 20, 'primary', 1.4),
    materialLine(16, 20, 20, 20, 'primary', 1.4),
  ]),
  conditionalMaterial('low_obstacle', 'Obstáculo bajo', 'PLIOMETRÍA', 10, 8, [
    materialLine(5, 9, 19, 9, 'accent', 2.1),
    materialLine(7, 9, 7, 18, 'paper', 1.7),
    materialLine(17, 9, 17, 18, 'paper', 1.7),
    materialLine(4, 19, 10, 19, 'primary', 1.5),
    materialLine(14, 19, 20, 19, 'primary', 1.5),
  ]),
  conditionalMaterial('resistance_band', 'Banda elástica', 'RESISTENCIA', 10, 8, [
    materialRect(5, 5, 14, 14, { stroke: 'accent', strokeWidth: 2.2, radius: 5 }),
    materialLine(5, 12, 8, 12, 'paper', 1.5),
    materialLine(16, 12, 19, 12, 'paper', 1.5),
  ]),
  conditionalMaterial('resistance_tube', 'Goma de resistencia', 'RESISTENCIA', 12, 7, [
    materialLine(3, 7, 3, 17, 'paper', 1.8),
    materialLine(21, 7, 21, 17, 'paper', 1.8),
    materialPolyline([[3, 12], [6, 8], [9, 16], [12, 8], [15, 16], [18, 8], [21, 12]], 'accent', 1.8),
    materialLine(2, 7, 4, 7, 'primary', 1.4),
    materialLine(20, 17, 22, 17, 'primary', 1.4),
  ]),
  conditionalMaterial('trx', 'TRX', 'RESISTENCIA', 9, 10, [
    materialEllipse(12, 4, 2.5, 2, { stroke: 'accent', strokeWidth: 1.8 }),
    materialLine(10, 6, 7, 17, 'paper', 1.8),
    materialLine(14, 6, 17, 17, 'paper', 1.8),
    materialRect(5, 16, 4, 3, { fill: 'accent', stroke: 'ink', strokeWidth: 1, radius: 0.8 }),
    materialRect(15, 16, 4, 3, { fill: 'accent', stroke: 'ink', strokeWidth: 1, radius: 0.8 }),
    materialLine(7, 19, 7, 21, 'primary', 1.5),
    materialLine(17, 19, 17, 21, 'primary', 1.5),
  ]),
  conditionalMaterial('exercise_mat', 'Esterilla', 'TRABAJO EN SUELO', 12, 7, [
    materialRect(4, 7, 16, 10, { fill: 'paper', stroke: 'ink', strokeWidth: 1.2, radius: 1.2 }),
    materialEllipse(5, 12, 2, 5, { stroke: 'accent', strokeWidth: 1.8 }),
    materialLine(8, 9, 18, 9, 'primary', 0.8),
    materialLine(8, 15, 18, 15, 'primary', 0.8),
  ]),
  conditionalMaterial('gym_mat', 'Colchoneta', 'TRABAJO EN SUELO', 12, 8, [
    materialRect(4, 5, 15, 10, { fill: 'accent', stroke: 'ink', strokeWidth: 1.2, radius: 1 }),
    materialRect(6, 9, 15, 10, { fill: 'paper', stroke: 'primary', strokeWidth: 1.2, radius: 1 }),
    materialLine(8, 16, 19, 16, 'accent', 0.8),
  ]),
  conditionalMaterial('ab_wheel', 'Rueda abdominal', 'TRABAJO EN SUELO', 10, 8, [
    materialEllipse(12, 12, 5.2, 7.3, { stroke: 'ink', fill: 'accent', strokeWidth: 1.5 }),
    materialEllipse(12, 12, 2.2, 3.3, { stroke: 'primary', fill: 'turf', strokeWidth: 1.2 }),
    materialLine(3, 12, 21, 12, 'paper', 1.8),
    materialRect(2, 10.5, 3, 3, { fill: 'paper', stroke: 'ink', strokeWidth: 1, radius: 0.8 }),
    materialRect(19, 10.5, 3, 3, { fill: 'paper', stroke: 'ink', strokeWidth: 1, radius: 0.8 }),
  ]),
  conditionalMaterial('drag_sled', 'Trineo de arrastre', 'VELOCIDAD', 12, 9, [
    materialLine(3, 19, 21, 19, 'paper', 2),
    materialPolyline([[5, 17], [7, 9], [17, 9], [19, 17]], 'accent', 1.8),
    materialRect(8, 6, 8, 5, { fill: 'accent', stroke: 'ink', strokeWidth: 1.2, radius: 0.6 }),
    materialLine(12, 6, 12, 2, 'paper', 1.5),
    materialLine(12, 2, 20, 2, 'primary', 1.4),
  ]),
  conditionalMaterial('resistance_parachute', 'Paracaídas de resistencia', 'VELOCIDAD', 12, 10, [
    materialRect(2, 10, 3, 4, { fill: 'accent', stroke: 'ink', strokeWidth: 1, radius: 0.8 }),
    materialLine(5, 12, 10, 5, 'paper', 1.1),
    materialLine(5, 12, 12, 3, 'paper', 1.1),
    materialLine(5, 12, 14, 3, 'paper', 1.1),
    materialLine(5, 12, 16, 5, 'paper', 1.1),
    materialPolyline([[10, 5], [11, 3], [13, 2], [15, 3], [16, 5], [14, 6], [12, 6], [10, 5]], 'accent', 1.8),
    materialLine(12, 3, 12, 6, 'primary', 0.8),
    materialLine(15, 3, 14, 6, 'primary', 0.8),
  ]),
]);

const TRAINING_CONDITIONAL_MATERIAL_BY_ID = new Map(
  TRAINING_CONDITIONAL_MATERIALS.map((material) => [material.id, material]),
);

export const getTrainingConditionalMaterial = (id) => TRAINING_CONDITIONAL_MATERIAL_BY_ID.get(id) || null;

export const PARTICIPANT_ROLES = Object.freeze([
  { key: 'player', label: 'Jugador' },
  { key: 'neutral', label: 'Comodin' },
  { key: 'goalkeeper', label: 'Portero' },
  { key: 'coach', label: 'Entrenador' },
]);

const participant = (id, fields) => ({
  id,
  type: 'participant',
  x: 50,
  y: 35,
  teamKey: 'team-1',
  role: 'player',
  colorKey: 'blue',
  label: '',
  ...fields,
});

export const createTrainingTaskBoardElement = (tool, createId = createDiagramElementId) => {
  const id = createId();
  if (typeof tool === 'string' && tool.startsWith('conditional:')) {
    const materialKey = tool.slice('conditional:'.length);
    const material = getTrainingConditionalMaterial(materialKey);
    return {
      id,
      type: 'conditional_material',
      materialKey,
      x: 50,
      y: 36,
      width: material?.geometry.width || 10,
      height: material?.geometry.height || 8,
      rotation: 0,
      colorKey: 'yellow',
    };
  }
  const team = TRAINING_BOARD_TEAM_OPTIONS.find((entry) => entry.key === tool);
  if (team) return participant(id, { teamKey: team.key, colorKey: team.colorKey });
  if (tool === 'neutral') return participant(id, { teamKey: '', role: 'neutral', colorKey: 'green', label: 'C' });
  if (tool === 'goalkeeper') return participant(id, { role: 'goalkeeper', colorKey: 'orange', label: 'P' });
  if (tool === 'coach') return participant(id, { teamKey: '', role: 'coach', colorKey: 'black', label: 'E' });
  if (tool === 'ball') return { id, type: 'ball', x: 50, y: 36 };
  if (tool === 'cone') return { id, type: 'cone', x: 50, y: 36, colorKey: 'orange' };
  if (tool === 'pole') return { id, type: 'pole', x: 50, y: 36, colorKey: 'yellow', rotation: 0 };
  if (tool === 'mannequin') return { id, type: 'mannequin', x: 50, y: 36, colorKey: 'yellow', rotation: 0 };
  if (tool === 'hoop') return { id, type: 'hoop', x: 50, y: 36, colorKey: 'red' };
  if (tool === 'goal') return { id, type: 'goal', x: 50, y: 36, colorKey: 'white', rotation: 0, width: 10, height: 4.5 };
  if (tool === 'mini_goal') return { id, type: 'mini_goal', x: 50, y: 36, colorKey: 'white', rotation: 0, width: 6, height: 3 };
  if (['arrow', 'curved_arrow', 'dashed_arrow', 'line', 'dashed_line'].includes(tool)) {
    const base = { id, type: tool, x1: 34, y1: 44, x2: 62, y2: 25, colorKey: 'blue' };
    return tool === 'curved_arrow' ? { ...base, controlX: 43, controlY: 22 } : base;
  }
  if (tool === 'zone') return { id, type: 'zone', x: 34, y: 22, width: 26, height: 18, colorKey: 'blue', opacity: 0.18, borderStyle: 'solid', label: '' };
  return { id, type: 'text', x: 50, y: 36, colorKey: 'white', label: 'Texto' };
};

export const placeTrainingTaskBoardElement = (tool, point, createId = createDiagramElementId) => {
  const element = createTrainingTaskBoardElement(tool, createId);
  const placed = {
    ...element,
    x: Math.max(0, Math.min(100, finiteNumber(point?.x, element.x))),
    y: Math.max(0, Math.min(72, finiteNumber(point?.y, element.y))),
  };
  return placed.type === 'conditional_material' ? moveTrainingBoardElement(placed, 0, 0) : placed;
};

export const drawTrainingTaskBoardElement = (tool, start, end, createId = createDiagramElementId) => {
  const element = createTrainingTaskBoardElement(tool, createId);
  const x1 = Math.max(0, Math.min(100, finiteNumber(start?.x, 0)));
  const y1 = Math.max(0, Math.min(72, finiteNumber(start?.y, 0)));
  const x2 = Math.max(0, Math.min(100, finiteNumber(end?.x, x1)));
  const y2 = Math.max(0, Math.min(72, finiteNumber(end?.y, y1)));
  if (tool === 'zone') {
    const x = Math.min(96, Math.min(x1, x2));
    const y = Math.min(68, Math.min(y1, y2));
    return {
      ...element,
      x,
      y,
      width: Math.min(100 - x, Math.max(4, Math.abs(x2 - x1))),
      height: Math.min(72 - y, Math.max(4, Math.abs(y2 - y1))),
    };
  }
  const trace = { ...element, x1, y1, x2, y2 };
  if (tool !== 'curved_arrow') return trace;
  return { ...trace, controlX: (x1 + x2) / 2, controlY: Math.max(0, Math.min(72, (y1 + y2) / 2 - 10)) };
};

export const getTrainingBoardColor = (element, fallback = 'blue') => {
  const colorKey = element?.colorKey || fallback;
  return TRAINING_BOARD_PALETTE[colorKey] || TRAINING_BOARD_PALETTE[fallback];
};

export const getTrainingBoardElementLayer = (element) => {
  if (element?.type === 'zone') return 1;
  if (['arrow', 'curved_arrow', 'dashed_arrow', 'double_arrow', 'line', 'dashed_line'].includes(element?.type)) return 2;
  if (['ball', 'cone', 'pole', 'mannequin', 'hoop', 'goal', 'mini_goal', 'block', 'conditional_material'].includes(element?.type)) return 3;
  if (['participant', 'player', 'opponent'].includes(element?.type)) return 4;
  return 5;
};

export const sortTrainingBoardElements = (elements = []) => elements
  .map((element, index) => ({ element, index }))
  .sort((left, right) => getTrainingBoardElementLayer(left.element) - getTrainingBoardElementLayer(right.element) || left.index - right.index)
  .map(({ element }) => element);

const finiteNumber = (value, fallback) => (
  Number.isFinite(Number(value)) ? Number(value) : fallback
);

const clampRange = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export const rotateTrainingBoardElement = (element, step = 90) => ({
  ...element,
  rotation: ((finiteNumber(element?.rotation, 0) + finiteNumber(step, 90)) % 360 + 360) % 360,
});

export const moveTrainingBoardElement = (element, deltaX = 0, deltaY = 0) => {
  const dx = finiteNumber(deltaX, 0);
  const dy = finiteNumber(deltaY, 0);
  if (['arrow', 'curved_arrow', 'dashed_arrow', 'double_arrow', 'line', 'dashed_line'].includes(element?.type)) {
    const xValues = [element.x1, element.x2, ...(element.type === 'curved_arrow' ? [element.controlX] : [])].map((value) => finiteNumber(value, 0));
    const yValues = [element.y1, element.y2, ...(element.type === 'curved_arrow' ? [element.controlY] : [])].map((value) => finiteNumber(value, 0));
    const boundedDx = clampRange(dx, -Math.min(...xValues), 100 - Math.max(...xValues));
    const boundedDy = clampRange(dy, -Math.min(...yValues), 72 - Math.max(...yValues));
    const moved = {
      ...element,
      x1: finiteNumber(element.x1, 0) + boundedDx,
      y1: finiteNumber(element.y1, 0) + boundedDy,
      x2: finiteNumber(element.x2, 0) + boundedDx,
      y2: finiteNumber(element.y2, 0) + boundedDy,
    };
    return element.type === 'curved_arrow' ? {
      ...moved,
      controlX: finiteNumber(element.controlX, (finiteNumber(element.x1, 0) + finiteNumber(element.x2, 0)) / 2) + boundedDx,
      controlY: finiteNumber(element.controlY, (finiteNumber(element.y1, 0) + finiteNumber(element.y2, 0)) / 2) + boundedDy,
    } : moved;
  }
  if (element?.type === 'zone') {
    const width = Math.max(4, finiteNumber(element.width, 22));
    const height = Math.max(4, finiteNumber(element.height, 12));
    return { ...element, x: clampRange(finiteNumber(element.x, 0) + dx, 0, 100 - width), y: clampRange(finiteNumber(element.y, 0) + dy, 0, 72 - height) };
  }
  const goal = ['goal', 'mini_goal'].includes(element?.type);
  const conditional = element?.type === 'conditional_material';
  const quarterTurn = Math.abs(finiteNumber(element?.rotation, 0) % 180) === 90;
  const width = finiteNumber(element?.width, conditional ? 10 : 8);
  const height = finiteNumber(element?.height, conditional ? 8 : 3);
  const halfWidth = goal || conditional ? (quarterTurn ? height : width) / 2 : 0;
  const halfHeight = goal || conditional ? (quarterTurn ? width : height) / 2 : 0;
  return {
    ...element,
    x: clampRange(finiteNumber(element?.x, 0) + dx, halfWidth, 100 - halfWidth),
    y: clampRange(finiteNumber(element?.y, 0) + dy, halfHeight, 72 - halfHeight),
  };
};

export const resizeTrainingBoardMaterial = (element, fields = {}) => {
  const material = getTrainingConditionalMaterial(element?.materialKey);
  const resized = {
    ...element,
    width: clampRange(finiteNumber(fields.width, finiteNumber(element?.width, material?.geometry.width || 10)), 3, 28),
    height: clampRange(finiteNumber(fields.height, finiteNumber(element?.height, material?.geometry.height || 8)), 3, 24),
  };
  const bounded = moveTrainingBoardElement(resized, 0, 0);
  return { width: resized.width, height: resized.height, x: bounded.x, y: bounded.y };
};

export const resizeTrainingBoardZone = (element, deltaX = 0, deltaY = 0) => {
  const x = Math.max(0, Math.min(96, finiteNumber(element?.x, 0)));
  const y = Math.max(0, Math.min(68, finiteNumber(element?.y, 0)));
  const width = finiteNumber(element?.width, 22) + finiteNumber(deltaX, 0);
  const height = finiteNumber(element?.height, 12) + finiteNumber(deltaY, 0);
  return {
    width: Math.max(4, Math.min(100 - x, width)),
    height: Math.max(4, Math.min(72 - y, height)),
  };
};

export const adaptLegacyTrainingBoardElement = (element) => {
  if (element?.type === 'player') return { ...element, type: 'participant', role: 'player', teamKey: element.teamKey || 'team-1', colorKey: element.colorKey || 'blue' };
  if (element?.type === 'opponent') return { ...element, type: 'participant', role: 'player', teamKey: element.teamKey || 'team-2', colorKey: element.colorKey || 'red' };
  if (element?.type === 'zone') return { colorKey: 'blue', opacity: 0.18, borderStyle: 'solid', label: '', ...element };
  return element;
};
