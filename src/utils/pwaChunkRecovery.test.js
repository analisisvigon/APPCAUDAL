import assert from 'node:assert/strict';
import {
  PDF_GENERATOR_LOAD_ERROR_MESSAGE,
  isStaleChunkLoadError,
  recoverFromStaleChunkOnce,
} from './pwaChunkRecovery.js';

assert.equal(isStaleChunkLoadError(new TypeError('Failed to fetch dynamically imported module: /assets/jspdf.es.min-Dyi3BRiJ.js')), true);
assert.equal(isStaleChunkLoadError(new Error('ChunkLoadError: Loading chunk 824 failed')), true);
assert.equal(isStaleChunkLoadError(new Error('Importing a module script failed')), true);
assert.equal(isStaleChunkLoadError(new Error('El PDF no conserva sus enlaces')), false, 'los errores reales del PDF no se confunden con un chunk obsoleto');
assert.equal(PDF_GENERATOR_LOAD_ERROR_MESSAGE, 'No se pudo cargar el generador de PDF. Actualiza la aplicación e inténtalo de nuevo.');

const stored = new Map();
const storage = {
  getItem: (key) => stored.get(key) || null,
  setItem: (key, value) => stored.set(key, value),
};
let updateCalls = 0;
let reloadCalls = 0;
const navigatorRef = {
  serviceWorker: {
    getRegistration: async () => ({ update: async () => { updateCalls += 1; } }),
  },
};
const locationRef = { reload: () => { reloadCalls += 1; } };
const chunkError = new TypeError('Failed to fetch dynamically imported module: /assets/jspdf.es.min-Dyi3BRiJ.js');

const firstRecovery = await recoverFromStaleChunkOnce(chunkError, {
  navigatorRef,
  locationRef,
  storage,
  now: 1000,
});
assert.deepEqual(firstRecovery, { handled: true, reloadRequested: true });
assert.equal(updateCalls, 1, 'antes de recargar se solicita la versión actual del service worker');
assert.equal(reloadCalls, 1, 'el primer fallo obsoleto recarga una sola vez');

const repeatedRecovery = await recoverFromStaleChunkOnce(chunkError, {
  navigatorRef,
  locationRef,
  storage,
  now: 2000,
});
assert.deepEqual(repeatedRecovery, { handled: true, reloadRequested: false });
assert.equal(updateCalls, 1, 'un segundo fallo dentro de la ventana no vuelve a actualizar');
assert.equal(reloadCalls, 1, 'un segundo fallo no crea un bucle de recargas');

const unrelatedError = await recoverFromStaleChunkOnce(new Error('No hay páginas A4'), {
  navigatorRef,
  locationRef,
  storage,
  now: 3000,
});
assert.deepEqual(unrelatedError, { handled: false, reloadRequested: false });

console.log('pwaChunkRecovery tests passed');
