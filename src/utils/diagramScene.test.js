import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DIAGRAM_PITCH_TYPES,
  normalizeDiagramPitchType,
  resolveLegacySetPiecePitchType,
} from './diagramScene.js';
import { getDrawableSetPieceElements } from './setPieceProfessional.js';

assert.equal(resolveLegacySetPiecePitchType(true), DIAGRAM_PITCH_TYPES.FULL);
assert.equal(resolveLegacySetPiecePitchType(false), DIAGRAM_PITCH_TYPES.PENALTY_AREA);
assert.equal(normalizeDiagramPitchType('future-pitch'), DIAGRAM_PITCH_TYPES.PENALTY_AREA, 'un terreno no soportado usa un fallback visual seguro');

const legacyElements = [
  { id: 'player-1', type: 'player', x: 20, y: 30 },
  { id: 'ball-1', type: 'ball', x: 25, y: 30 },
  { id: 'straight-1', type: 'arrow', x1: 20, y1: 30, x2: 40, y2: 30 },
  { id: 'curve-1', type: 'curved_arrow', x1: 20, y1: 30, x2: 40, y2: 40, controlX: 32, controlY: 25 },
  { id: 'zone-1', type: 'zone', x: 50, y: 20, width: 18, height: 10 },
  { id: 'text-1', type: 'text', x: 50, y: 60, label: 'ABP' },
];
assert.deepEqual(getDrawableSetPieceElements(legacyElements), legacyElements, 'una escena ABP legacy sigue siendo renderizable sin conversion de schema');

const canvasSource = await readFile(new URL('../components/print/SetPieceDiagramCanvas.jsx', import.meta.url), 'utf8');
const coreSource = await readFile(new URL('../components/diagram/DiagramCanvasSurface.jsx', import.meta.url), 'utf8');
assert.match(canvasSource, /DiagramCanvasSurface/, 'ABP consume el nucleo SVG reutilizable');
assert.match(canvasSource, /thumbnail: Object\.freeze\(\{[\s\S]*playerRadius: 1\.45/, 'los tokens thumbnail existentes no cambian');
assert.doesNotMatch(coreSource, /training_library|training_tasks|Supabase|cronolog|dossier/i, 'el nucleo no conoce persistencia ni conceptos ABP/Tareas');

console.log('diagram scene tests passed');

