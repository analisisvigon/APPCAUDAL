import assert from 'node:assert/strict';
import {
  DELEGATED_EVENT_STAT_EFFECTS,
  reconcileDelegatedEvent,
  saveDelegatedEventWithSync,
} from './delegatedEventSaveFlow.js';

const playerId = '11111111-1111-4111-8111-111111111111';
const savedEvent = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  partidoId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  tipoEvento: 'tiro',
  minute: '18',
  equipo: 'caudal',
  jugadorId: playerId,
  playerId,
  createdAt: '2026-07-27T12:00:00.000Z',
};

{
  let localEvents = [];
  const result = await saveDelegatedEventWithSync({
    persist: async () => savedEvent,
    syncLocal: async (event) => {
      localEvents = reconcileDelegatedEvent(localEvents, event);
    },
    reload: async () => {
      throw new Error('no debe recargar en el caso correcto');
    },
  });
  assert.equal(result.status, 'saved');
  assert.deepEqual(localEvents, [savedEvent], 'un guardado correcto actualiza la timeline local');
  assert.equal(localEvents[0].jugadorId, playerId, 'la sincronización conserva playerId');
}

{
  const insertError = new Error('Supabase insert failed');
  let localSyncCalled = false;
  const result = await saveDelegatedEventWithSync({
    persist: async () => {
      throw insertError;
    },
    syncLocal: async () => {
      localSyncCalled = true;
    },
  });
  assert.equal(result.status, 'insert-error');
  assert.equal(result.insertError, insertError);
  assert.equal(localSyncCalled, false, 'un error real de insert no actualiza la timeline');
}

{
  let reloadCalled = false;
  const result = await saveDelegatedEventWithSync({
    persist: async () => savedEvent,
    syncLocal: async () => {
      throw new ReferenceError('setSelectedMatch is not defined');
    },
    reload: async (event) => {
      reloadCalled = event.id === savedEvent.id;
    },
  });
  assert.equal(result.status, 'saved-reloaded');
  assert.equal(result.insertError, null, 'un fallo local posterior nunca se clasifica como fallo de guardado');
  assert.equal(reloadCalled, true, 'tras un fallo local se recarga la fuente real');
}

{
  const optimistic = { ...savedEvent, id: 'optimistic-id', createdAt: '' };
  const once = reconcileDelegatedEvent([optimistic], savedEvent, optimistic.id);
  const afterReload = reconcileDelegatedEvent(once, savedEvent);
  assert.equal(afterReload.length, 1, 'la reconciliación por id evita duplicados al recargar');
  assert.deepEqual(afterReload[0], savedEvent);
}

assert.deepEqual(
  DELEGATED_EVENT_STAT_EFFECTS.gol.player,
  { goals: 1, shots: 1, shotsOnTarget: 1 },
  'Gol deriva sus contadores de tiro y tiro a puerta sin crear registros duplicados',
);
assert.deepEqual(
  DELEGATED_EVENT_STAT_EFFECTS.tiro_puerta.player,
  { shots: 1, shotsOnTarget: 1 },
  'Tiro a puerta deriva también el contador de tiro',
);

console.log('delegatedEventSaveFlow tests passed');
