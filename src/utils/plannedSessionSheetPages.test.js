import assert from 'node:assert/strict';
import { planPlannedSessionSheets } from './plannedSessionSheetPages.js';

const slot = (id, phase, tasks = 1) => ({ id, phase, items: Array.from({ length: tasks }, (_, index) => ({ id: `${id}-${index}` })) });
const collect = (sheets) => sheets.flatMap((sheet) => [
  ...(sheet.activation || []), ...(sheet.slots || []), ...(sheet.cooldown || []),
]).map((entry) => entry.id);

assert.deepEqual(planPlannedSessionSheets([]).map((sheet) => sheet.kind), ['cover', 'main']);

const originalShape = [slot('activation-1', 'activation'), slot('main-1', 'main'),
  slot('main-2', 'main'), slot('main-3', 'main'), slot('cooldown-1', 'cooldown')];
const twoSheets = planPlannedSessionSheets(originalShape);
assert.equal(twoSheets.length, 2, 'la estructura original cabe en dos hojas');
assert.deepEqual(twoSheets[0].activation.map((entry) => entry.id), ['activation-1']);
assert.deepEqual(twoSheets[1].slots.map((entry) => entry.id), ['main-1', 'main-2', 'main-3']);
assert.deepEqual(twoSheets[1].cooldown.map((entry) => entry.id), ['cooldown-1']);

const overflow = [slot('main-1', 'main', 2), slot('main-2', 'main', 2),
  slot('main-3', 'main'), slot('cooldown-1', 'cooldown')];
const extraSheets = planPlannedSessionSheets(overflow);
assert.equal(extraSheets.length, 3);
assert.deepEqual(collect(extraSheets), overflow.map((entry) => entry.id),
  'ningún ejercicio se duplica, pierde o divide entre hojas');
assert.deepEqual(extraSheets[1].slots.map((entry) => entry.id), ['main-1', 'main-2']);
assert.deepEqual(extraSheets[2].slots.map((entry) => entry.id), ['main-3']);
assert.deepEqual(extraSheets[2].cooldown.map((entry) => entry.id), ['cooldown-1']);

const parallelCooldown = planPlannedSessionSheets([slot('m1', 'main'), slot('m2', 'main'),
  slot('m3', 'main'), slot('c1', 'cooldown', 2)]);
assert.equal(parallelCooldown.length, 3, 'dos tareas de vuelta a la calma no desbordan la segunda hoja');
assert.deepEqual(collect(parallelCooldown), ['m1', 'm2', 'm3', 'c1']);

const activationOverflow = planPlannedSessionSheets([slot('a1', 'activation'), slot('a2', 'activation'),
  slot('a3', 'activation'), slot('m1', 'main')]);
assert.deepEqual(activationOverflow.map((sheet) => sheet.kind), ['cover', 'activation', 'main']);
assert.deepEqual(collect(activationOverflow), ['a1', 'a2', 'a3', 'm1']);

console.log('planned session sheet pagination tests passed');
