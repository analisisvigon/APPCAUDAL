import assert from 'node:assert/strict';
import { assertPlannedSessionPrintFits, plannedSessionPrintIssues } from './plannedSessionPrintLayout.js';

globalThis.getComputedStyle = () => ({ paddingBottom: '0', paddingRight: '0' });
const makeSheet = (overflow = false) => ({
  clientHeight: 700, scrollHeight: overflow ? 7010 : 700,
  clientWidth: 1000, scrollWidth: 1000,
  getBoundingClientRect: () => ({ right: 1000, bottom: 700 }),
  querySelectorAll: () => [],
});
const documentNode = (sheets) => ({ dataset: { sessionDate: '28/11/2026' },
  querySelectorAll: () => sheets });
const root = (documents) => ({ matches: () => false, querySelectorAll: () => documents });

const valid = root([documentNode([makeSheet(), makeSheet()])]);
assert.deepEqual(plannedSessionPrintIssues(valid), []);
assert.equal(assertPlannedSessionPrintFits(valid), true);
assert.throws(() => assertPlannedSessionPrintFits(root([documentNode([makeSheet(), makeSheet(), makeSheet()])])),
  /máximo de dos hojas/);
assert.throws(() => assertPlannedSessionPrintFits(root([documentNode([makeSheet(true)])])),
  /no cabe completa y legible/);

console.log('planned session print capacity tests passed');
