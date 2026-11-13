import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PLANNED_SESSION_PRINT_PAGE_RULE, printPlannedSessionDocument } from './plannedSessionPrintOrientation.js';

const printCss = readFileSync('src/components/training/plannedSessionPrint.css', 'utf8');
assert.match(printCss, /@page nexo-session\s*\{\s*size:\s*A4 landscape;\s*margin:\s*0;/);
assert.match(printCss, /\.planned-print-sheet\s*\{\s*page:\s*nexo-session;/);
assert.equal(/@page\s*\{/.test(printCss), false, 'la regla general no queda activa para otros documentos');

const makeEnvironment = (print = () => {}) => {
  const listeners = new Map();
  let style;
  const documentRef = {
    createElement(tag) {
      assert.equal(tag, 'style');
      return {
        media: '',
        textContent: '',
        removed: false,
        setAttribute(name, value) { this[name] = value; },
        remove() { this.removed = true; },
      };
    },
    head: {
      appendChild(node) { style = node; },
    },
  };
  const windowRef = {
    addEventListener(name, callback, options) {
      assert.equal(name, 'afterprint');
      assert.equal(options.once, true);
      listeners.set(name, callback);
    },
    removeEventListener(name, callback) {
      if (listeners.get(name) === callback) listeners.delete(name);
    },
    print() { print({ style }); },
  };
  return { documentRef, windowRef, listeners, get style() { return style; } };
};

const environment = makeEnvironment(({ style }) => {
  assert.equal(style.media, 'print');
  assert.equal(style.textContent, PLANNED_SESSION_PRINT_PAGE_RULE);
  assert.equal(style['data-planned-session-print-page'], '');
});
printPlannedSessionDocument(environment);
assert.equal(environment.style.removed, false, 'la regla sigue activa mientras el diálogo está abierto');
environment.listeners.get('afterprint')();
assert.equal(environment.style.removed, true, 'la regla se elimina al cerrar el diálogo');
assert.equal(environment.listeners.has('afterprint'), false);

const printError = new Error('fallo de impresión');
const failingEnvironment = makeEnvironment(() => { throw printError; });
assert.throws(() => printPlannedSessionDocument(failingEnvironment), (error) => error === printError);
assert.equal(failingEnvironment.style.removed, true, 'la regla se limpia si window.print falla');
assert.equal(failingEnvironment.listeners.has('afterprint'), false);

console.log('planned session print orientation tests passed');
