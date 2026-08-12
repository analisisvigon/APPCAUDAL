import assert from 'node:assert/strict';
import {
  TACTICAL_AUTOSAVE_DELAY_MS,
  createFlushableSaveCoordinator,
  flushPendingSaveTargets,
} from './flushableSaveCoordinator.js';

assert.equal(TACTICAL_AUTOSAVE_DELAY_MS, 900, 'se conserva el debounce táctico de 900 ms');

const deferred = () => {
  let resolve;
  const promise = new Promise((next) => { resolve = next; });
  return { promise, resolve };
};

const statuses = [];
const saves = [];
let snapshot = { matchId: 'A', value: 1 };
const firstSave = deferred();
const coordinator = createFlushableSaveCoordinator({
  readSnapshot: () => ({ ...snapshot }),
  persist: async (payload) => {
    saves.push(payload);
    if (saves.length === 1) return firstSave.promise;
    return { ok: true };
  },
  onStatusChange: (status) => statuses.push(status),
});

coordinator.markDirty();
assert.equal(coordinator.getState().dirty, true);
const pendingSave = coordinator.save();
assert.equal(coordinator.getState().inFlight, true);
assert.equal(coordinator.save(), pendingSave, 'un guardado en curso se reutiliza');

snapshot = { matchId: 'A', value: 2 };
coordinator.markDirty();
const flushPromise = coordinator.flush();
firstSave.resolve({ ok: true });
assert.equal((await flushPromise).ok, true);
assert.deepEqual(saves, [
  { matchId: 'A', value: 1 },
  { matchId: 'A', value: 2 },
], 'flush persiste también los cambios producidos durante el primer save');
assert.equal(coordinator.hasPending(), false);
assert.equal(coordinator.getState().status, 'Guardado');

let shouldFail = true;
const retry = createFlushableSaveCoordinator({
  readSnapshot: () => ({ matchId: 'A' }),
  persist: async () => shouldFail ? { ok: false, error: new Error('Supabase KO') } : { ok: true },
});
retry.markDirty();
assert.equal((await retry.flush()).ok, false);
assert.equal(retry.getState().dirty, true, 'el error conserva dirty');
assert.equal(retry.getState().status, 'Error al guardar');
shouldFail = false;
assert.equal((await retry.flush()).ok, true, 'Reintentar persiste el mismo cambio');

const late = deferred();
const stale = createFlushableSaveCoordinator({
  readSnapshot: () => ({ matchId: 'A' }),
  persist: () => late.promise,
});
stale.markDirty();
const staleSave = stale.save();
stale.reset('');
late.resolve({ ok: true });
assert.equal((await staleSave).stale, true, 'una respuesta de un ciclo anterior se identifica como obsoleta');
assert.equal(stale.getState().status, '', 'la respuesta tardía no marca el nuevo contexto como guardado');

let navigationExecuted = false;
const navigationGuard = createFlushableSaveCoordinator({
  readSnapshot: () => ({}),
  persist: async () => ({ ok: true }),
});
navigationGuard.markDirty();
const navigationResult = await flushPendingSaveTargets([navigationGuard]);
if (navigationResult.ok) navigationExecuted = true;
assert.equal(navigationExecuted, true, 'la navegación sólo continúa después del flush real');
assert.ok(statuses.includes('Guardando'));

console.log('flushable save coordinator tests: ok');
