import assert from 'node:assert/strict';
import {
  cloneTacticalBoardArrow,
  convertTacticalBoardArrowToCurve,
  duplicateTacticalBoardArrow,
  getTacticalBoardArrowPath,
  normalizeTacticalBoardArrow,
  normalizeTacticalBoardArrows,
  straightenTacticalBoardArrow,
  updateTacticalBoardArrowPoint,
} from './tacticalBoardGeometry.js';
import { instantiateTemplateArrows, serializeTemplateArrows } from './tacticalTemplates.js';

const legacyPass = {
  id: 'pass-legacy',
  type: 'pass',
  start: { x: 20, y: 36 },
  end: { x: 80, y: 36 },
};

const normalizedLegacy = normalizeTacticalBoardArrow(legacyPass);
assert.deepEqual(normalizedLegacy, legacyPass, 'un trazado antiguo sigue siendo una recta sin campos obligatorios nuevos');
assert.equal(getTacticalBoardArrowPath(normalizedLegacy), 'M 20 36 L 80 36');

const curvedPass = convertTacticalBoardArrowToCurve(normalizedLegacy);
assert.deepEqual(curvedPass.controlPoint, { x: 50, y: 24 }, 'la conversión reutiliza el control cuadrático central del editor ABP');
assert.equal(getTacticalBoardArrowPath(curvedPass), 'M 20 36 Q 50 24 80 36');

const editedStart = updateTacticalBoardArrowPoint(curvedPass, 'start', { x: 14.25, y: 32.5 });
const editedControl = updateTacticalBoardArrowPoint(editedStart, 'controlPoint', { x: 48.5, y: 11.25 });
const editedEnd = updateTacticalBoardArrowPoint(editedControl, 'end', { x: 91.5, y: 43.75 });
assert.deepEqual(editedEnd.start, { x: 14.25, y: 32.5 });
assert.deepEqual(editedEnd.controlPoint, { x: 48.5, y: 11.25 });
assert.deepEqual(editedEnd.end, { x: 91.5, y: 43.75 });

const straightAgain = straightenTacticalBoardArrow(editedEnd);
assert.equal('controlPoint' in straightAgain, false, 'Enderezar vuelve al formato antiguo start/end');
assert.equal(getTacticalBoardArrowPath(straightAgain), 'M 14.25 32.5 L 91.5 43.75');

const curvedMovement = convertTacticalBoardArrowToCurve({ ...legacyPass, id: 'movement-curve', type: 'movement' });
assert.equal(curvedMovement.type, 'movement', 'la forma curva no altera la semántica Movimiento');
const duplicated = duplicateTacticalBoardArrow(curvedMovement, 'movement-copy');
assert.deepEqual(duplicated.start, { x: 24, y: 40 });
assert.deepEqual(duplicated.end, { x: 84, y: 40 });
assert.deepEqual(duplicated.controlPoint, { x: 54, y: 28 });

const cloned = cloneTacticalBoardArrow(curvedMovement, 'clone');
cloned.controlPoint.y = 90;
assert.equal(curvedMovement.controlPoint.y, 24, 'copias, historial y duplicados no comparten la geometría anidada');

const portable = serializeTemplateArrows([legacyPass, curvedMovement]);
assert.equal('controlPoint' in portable[0], false);
assert.deepEqual(portable[1].controlPoint, { x: 50, y: 24 });
let sequence = 0;
const reloaded = instantiateTemplateArrows(portable, () => `arrow-${++sequence}`);
assert.deepEqual(reloaded[1].controlPoint, curvedMovement.controlPoint, 'guardar/cargar plantilla conserva la curva exacta');
reloaded[1].controlPoint.x = 90;
assert.equal(portable[1].controlPoint.x, 50, 'la recarga crea una copia profunda');

assert.deepEqual(normalizeTacticalBoardArrows([
  legacyPass,
  { id: 'invalid', type: 'text', start: { x: 1, y: 1 }, end: { x: 2, y: 2 } },
]).map((arrow) => arrow.id), ['pass-legacy']);

console.log('tacticalBoardGeometry tests passed');
