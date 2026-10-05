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
  if (tool === 'goal') return { id, type: 'goal', x: 50, y: 36, colorKey: 'white', rotation: 0, width: 14, height: 6 };
  if (tool === 'mini_goal') return { id, type: 'mini_goal', x: 50, y: 36, colorKey: 'white', rotation: 0, width: 8, height: 4 };
  if (['arrow', 'curved_arrow', 'dashed_arrow', 'line', 'dashed_line'].includes(tool)) {
    const base = { id, type: tool, x1: 34, y1: 44, x2: 62, y2: 25, colorKey: 'blue' };
    return tool === 'curved_arrow' ? { ...base, controlX: 43, controlY: 22 } : base;
  }
  if (tool === 'zone') return { id, type: 'zone', x: 34, y: 22, width: 26, height: 18, colorKey: 'blue', opacity: 0.22, label: '' };
  return { id, type: 'text', x: 50, y: 36, colorKey: 'white', label: 'Texto' };
};

export const getTrainingBoardColor = (element, fallback = 'blue') => {
  const colorKey = element?.colorKey || fallback;
  return TRAINING_BOARD_PALETTE[colorKey] || TRAINING_BOARD_PALETTE[fallback];
};

export const getTrainingBoardElementLayer = (element) => {
  if (element?.type === 'zone') return 1;
  if (['arrow', 'curved_arrow', 'dashed_arrow', 'double_arrow', 'line', 'dashed_line'].includes(element?.type)) return 2;
  if (['ball', 'cone', 'pole', 'mannequin', 'hoop', 'goal', 'mini_goal', 'block'].includes(element?.type)) return 3;
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
  if (element?.type === 'zone') return { colorKey: 'blue', opacity: 0.22, label: '', ...element };
  return element;
};
