import assert from 'node:assert/strict';
import { fitTrainingTaskPrintSheets } from './trainingTaskPrintLayout.js';

globalThis.getComputedStyle = () => ({ paddingBottom: '0', paddingRight: '0' });
const sheet = (fits, name) => ({
  dataset: { taskId: name.toLowerCase(), taskName: name },
  getBoundingClientRect: () => ({ right: 1000, bottom: 700 }),
  querySelector: () => null,
  querySelectorAll(selector) {
    if (selector.includes('.task-export-main')) return [{ scrollHeight: fits ? 100 : 900, clientHeight: 700,
      scrollWidth: 900, clientWidth: 900 }];
    return [];
  },
});

const normal = sheet(true, 'Normal');
assert.deepEqual(fitTrainingTaskPrintSheets([normal]), { sheets: 1, continuations: 0 });
assert.equal(normal.dataset.density, undefined);
const extensive = sheet(false, 'Excepcionalmente extensa');
assert.throws(() => fitTrainingTaskPrintSheets([extensive]), /Excepcionalmente extensa.*una sola hoja A4 horizontal/);
assert.equal(extensive.dataset.density, 'compact', 'solo se reduce hasta el límite legible de 9 pt');

console.log('training task print capacity tests passed');
