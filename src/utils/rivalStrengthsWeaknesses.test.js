import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  MAX_RIVAL_SCOUTING_POINTS,
  addRivalScoutingPoint,
  getRivalScoutingPointTitles,
  moveRivalScoutingPoint,
  normalizeRivalScoutingPoints,
  removeRivalScoutingPoint,
  updateRivalScoutingPoint,
} from './rivalStrengthsWeaknesses.js';

const legacy = normalizeRivalScoutingPoints(['Juego aéreo', 'Movilidad de atacantes'], 'strength');
assert.deepEqual(getRivalScoutingPointTitles(legacy), ['Juego aéreo', 'Movilidad de atacantes']);
assert.equal(legacy[0].description, '', 'el texto histórico sigue siendo válido sin descripción');
assert.equal(legacy[0].category, '', 'la categoría histórica es opcional');

let idSequence = 0;
const createId = () => `point-${++idSequence}`;
let strengths = addRivalScoutingPoint([], {
  title: 'Movilidad de atacantes',
  description: 'Intercambian posiciones constantemente.',
  category: 'offensive',
}, 'strength', createId);
strengths = addRivalScoutingPoint(strengths, {
  title: 'Juego aéreo',
  description: '',
  category: 'set_piece',
}, 'strength', createId);
assert.equal(strengths.length, 2);
assert.equal(strengths[0].id, 'point-1');
assert.equal(strengths[1].description, '', 'la explicación puede quedar vacía');

strengths = updateRivalScoutingPoint(strengths, 'point-1', {
  title: 'Movilidad ofensiva',
  description: 'Permutan entre líneas.',
  category: '',
}, 'strength');
assert.equal(strengths[0].title, 'Movilidad ofensiva');
assert.equal(strengths[0].category, '', 'editar permite retirar la categoría');

strengths = moveRivalScoutingPoint(strengths, 'point-2', 'up', 'strength');
assert.deepEqual(strengths.map((point) => point.id), ['point-2', 'point-1']);
strengths = removeRivalScoutingPoint(strengths, 'point-2', 'strength');
assert.deepEqual(strengths.map((point) => point.id), ['point-1']);

const capped = Array.from({ length: MAX_RIVAL_SCOUTING_POINTS + 3 }, (_, index) => `Punto ${index + 1}`);
assert.equal(normalizeRivalScoutingPoints(capped, 'weakness').length, MAX_RIVAL_SCOUTING_POINTS, 'cada columna se limita a seis puntos');
assert.equal(addRivalScoutingPoint(capped, { title: 'Séptimo' }, 'weakness', createId).length, MAX_RIVAL_SCOUTING_POINTS);

const persisted = JSON.parse(JSON.stringify({ strengths, weaknesses: normalizeRivalScoutingPoints(['Retorno lento'], 'weakness') }));
assert.equal(persisted.strengths[0].description, 'Permutan entre líneas.');
assert.equal(persisted.weaknesses[0].title, 'Retorno lento', 'el JSON mantiene columnas separadas');
const anotherRival = { strengths: normalizeRivalScoutingPoints(['Presión alta'], 'strength'), weaknesses: [] };
assert.equal(persisted.strengths[0].title, 'Movilidad ofensiva');
assert.equal(anotherRival.strengths[0].title, 'Presión alta', 'los perfiles de dos rivales no comparten datos');

const componentSource = fs.readFileSync(new URL('../components/tactical/RivalStrengthsWeaknesses.jsx', import.meta.url), 'utf8');
const collectiveSource = fs.readFileSync(new URL('../components/tactical/RivalCollectiveAssistant.jsx', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const summaryIndex = collectiveSource.indexOf('Resumen del rival');
const strengthsIndex = collectiveSource.indexOf('<RivalStrengthsWeaknesses');
const assistantIndex = collectiveSource.indexOf('<RivalTacticalAssistant');
assert.ok(summaryIndex >= 0 && strengthsIndex > summaryIndex && assistantIndex > strengthsIndex, 'el bloque queda entre Resumen y Asistente táctico');
assert.match(componentSource, /\+ Añadir \{tone === 'strength' \? 'fortaleza' : 'debilidad'\}/);
assert.match(componentSource, /onClick=\{onEdit\}/);
assert.match(componentSource, /onClick=\{onRemove\}/);
assert.match(componentSource, /onMove\('up'\)/);
assert.match(componentSource, /onMove\('down'\)/);
assert.match(componentSource, /createPortal\(/, 'captura reutiliza el patrón de portal a body');
assert.match(componentSource, /data-rival-strengths-capture="true"/);
assert.match(componentSource, /Salir de captura/);
assert.match(componentSource, /event\.key === 'Escape'/);
assert.match(componentSource, /!capture && editable/, 'los controles desaparecen en captura y sin permisos de edición');
assert.match(componentSource, /md:grid-cols-2/, 'captura prioriza dos columnas en escritorio');
assert.match(componentSource, /lg:grid-cols-2/, 'la vista normal mantiene dos columnas y se apila en estrecho');
assert.match(appSource, /collective: selectedRivalObservedScouting\.collective/, 'persiste dentro del perfil colectivo existente');
assert.match(appSource, /onChange: updateObservedCollectiveProfile/, 'reutiliza el autoguardado del scouting rival');

console.log('rivalStrengthsWeaknesses tests: OK');
