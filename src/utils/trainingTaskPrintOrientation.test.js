import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TRAINING_TASK_PRINT_PAGE_RULE, printTrainingTaskDocument } from './trainingTaskPrintOrientation.js';

const css = readFileSync('src/components/training/trainingTaskBatchPrint.css', 'utf8');
assert.match(css, /@page task-library\s*\{\s*size:\s*297mm 210mm;\s*margin:\s*0;/);
assert.doesNotMatch(css, /page-orientation|rotate\s*\(/i);
assert.match(TRAINING_TASK_PRINT_PAGE_RULE, /@page\s*\{\s*size:\s*297mm 210mm/);
assert.match(TRAINING_TASK_PRINT_PAGE_RULE, /@page task-library\s*\{\s*size:\s*297mm 210mm/);

let style;
let listener;
const documentRef = {
  createElement() { return { setAttribute(name, value) { this[name] = value; }, remove() { this.removed = true; } }; },
  head: { appendChild(node) { style = node; } },
};
const windowRef = {
  addEventListener(name, callback) { assert.equal(name, 'afterprint'); listener = callback; },
  removeEventListener() {},
  print() { assert.equal(style.textContent, TRAINING_TASK_PRINT_PAGE_RULE); },
};
printTrainingTaskDocument({ windowRef, documentRef });
assert.equal(style['data-training-task-print-page'], '');
assert.equal(style.removed, undefined);
listener();
assert.equal(style.removed, true);

console.log('training task print orientation tests passed');
