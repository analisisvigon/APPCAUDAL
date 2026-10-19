import assert from 'node:assert/strict';
import { planPlannedSessionPrintSheets } from './plannedSessionSheetPages.js';

const exercise = (id, phase, items = 1) => ({ id, phase, duration: '12', items: Array.from({ length: items }, (_, index) => ({
  id: `${id}-${index}`, kind: 'free', title: `Tarea ${index}`, description: 'Desarrollo',
})) });
const ids = (pages) => pages.flatMap((page) => [...(page.activation ? [page.activation] : []), ...(page.slots || [])])
  .map((slot) => slot.id);

const normal = [exercise('a', 'activation'), ...Array.from({ length: 4 }, (_, i) => exercise(`m${i}`, 'main'))];
const normalPages = planPlannedSessionPrintSheets(normal);
assert.equal(normalPages.length, 2, 'una activación y cuatro ejercicios normales requieren dos hojas');
assert.equal(normalPages[1].slots.length, 4);
assert.deepEqual(ids(normalPages), normal.map((slot) => slot.id));

const mixed = [exercise('a', 'activation'), exercise('m1', 'main', 2), exercise('m2', 'main'), exercise('c', 'cooldown')];
const mixedPages = planPlannedSessionPrintSheets(mixed);
assert.equal(mixedPages.length, 2, 'una tarea doble y dos sencillas caben en la segunda hoja');
assert.deepEqual(ids(mixedPages), mixed.map((slot) => slot.id), 'no se pierde ni duplica ningún ejercicio');

const dualActivation = [exercise('a', 'activation', 2), exercise('m', 'main')];
const dualPages = planPlannedSessionPrintSheets(dualActivation);
assert.equal(dualPages.length, 2, 'una activación doble se integra con la parte principal');
assert.equal(dualPages[0].activation, null);
assert.deepEqual(ids(dualPages), dualActivation.map((slot) => slot.id));

assert.equal(planPlannedSessionPrintSheets([exercise('a', 'activation')]).length, 1,
  'no se crea una segunda hoja vacía');
assert.equal(planPlannedSessionPrintSheets([]).length, 1, 'la sesión vacía no genera hojas sobrantes');
const excess = [...normal, exercise('m4', 'main')];
assert.equal(planPlannedSessionPrintSheets(excess).length, 3,
  'el contenido realmente excesivo se conserva y pasa a otra hoja');
assert.deepEqual(ids(planPlannedSessionPrintSheets(excess)), excess.map((slot) => slot.id));

console.log('planned session print pagination tests passed');
