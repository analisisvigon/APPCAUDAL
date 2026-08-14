import assert from 'node:assert/strict';
import { DELEGATED_EVENT_STAT_EFFECTS } from './delegatedEventSaveFlow.js';
import {
  applyDelegatedMatchStatus,
  delegatedEventRequiresPlayer,
  filterDelegatedValidatedEvents,
  getDelegatedMatchAudit,
  getDelegatedRegistryQuality,
  getValidatedDelegatedEvents,
  isDelegatedEventResolvable,
  runDelegatedMatchStatusBatch,
} from './delegatedMatchValidation.js';

const matchId = '33333333-3333-4333-8333-333333333333';
const playerId = '11111111-1111-4111-8111-111111111111';
const secondPlayerId = '22222222-2222-4222-8222-222222222222';
const event = (index, overrides = {}) => ({
  id: `event-${index}`,
  partidoId: matchId,
  jugadorId: playerId,
  playerId,
  equipo: 'caudal',
  tipoEvento: index % 2 ? 'tiro' : 'robo',
  minute: String(index),
  reviewed: false,
  ...overrides,
});

const partialFixture = {
  id: matchId,
  delegatedDataStatus: 'Revisado',
  quickEvents: [
    ...Array.from({ length: 55 }, (_, index) => event(index + 1)),
    event(56, { equipo: 'rival', jugadorId: null, playerId: null }),
    event(57, { equipo: 'rival', jugadorId: null, playerId: null, tipoEvento: 'gol' }),
    event(58, { tipoEvento: 'corner', jugadorId: null, playerId: null }),
    event(59, { tipoEvento: 'corner', jugadorId: null, playerId: null }),
    event(60, { jugadorId: null, playerId: null }),
    event(61, { jugadorId: null, playerId: null, tipoEvento: 'centro' }),
  ],
};

const partialValidated = applyDelegatedMatchStatus(partialFixture, 'Validado', '2026-08-14T10:00:00Z');
assert.deepEqual(getDelegatedMatchAudit(partialValidated), {
  events: partialValidated.quickEvents,
  validated: 59,
  pending: 2,
  unidentified: 2,
  unidentifiedEvents: partialValidated.quickEvents.slice(-2),
  validatedPercent: 96.7,
}, '61 eventos producen 59 validados y 2 pendientes sin inventar jugador');
assert.equal(partialValidated.quickEvents[55].reviewed, true, 'un evento rival no requiere jugador propio');
assert.equal(partialValidated.quickEvents[57].reviewed, true, 'un córner de Caudal es colectivo');
assert.equal(partialValidated.quickEvents[59].reviewed, false, 'un evento individual sin UUID permanece pendiente');
assert.equal(isDelegatedEventResolvable(partialValidated.quickEvents[59]), false);
assert.equal(delegatedEventRequiresPlayer(partialValidated.quickEvents[57]), false);

const completeFixture = {
  id: '44444444-4444-4444-8444-444444444444',
  delegatedDataStatus: 'Revisado',
  quickEvents: Array.from({ length: 50 }, (_, index) => event(index + 1, { id: `complete-${index}` })),
};
const completeValidated = applyDelegatedMatchStatus(completeFixture, 'Validado');
assert.equal(getDelegatedMatchAudit(completeValidated).validated, 50);
assert.equal(getDelegatedMatchAudit(completeValidated).validatedPercent, 100);

const validatedEvents = getValidatedDelegatedEvents([partialValidated, completeValidated]);
assert.equal(validatedEvents.length, 109, 'el análisis recibe solo eventos realmente validados');
const playerShotsFirstHalf = filterDelegatedValidatedEvents(validatedEvents, {
  team: 'caudal', playerId, eventType: 'tiro', period: '0-15',
});
assert.ok(playerShotsFirstHalf.length > 0, 'los filtros se aplican sobre eventos validados');
assert.ok(playerShotsFirstHalf.every((row) => row.reviewed && row.playerId === playerId));

const quality = getDelegatedRegistryQuality([partialValidated]);
assert.deepEqual(quality, { registered: 61, validated: 59, pending: 2, discarded: 0, percent: 96.7 });

const discarded = applyDelegatedMatchStatus(partialValidated, 'Descartado');
assert.equal(getValidatedDelegatedEvents([discarded]).length, 0, 'descartar excluye el partido sin borrar eventos');
assert.equal(discarded.quickEvents.length, 61);
assert.ok(discarded.quickEvents.every((row) => !row.reviewed), 'descartar elimina la contradicción con el estado individual');
assert.deepEqual(getDelegatedRegistryQuality([discarded]), {
  registered: 61, validated: 0, pending: 0, discarded: 61, percent: 0,
});

const reviewedAgain = applyDelegatedMatchStatus(partialValidated, 'Revisado');
assert.ok(reviewedAgain.quickEvents.every((row) => !row.reviewed), 'volver a Revisado deja todos los eventos pendientes');

const correctedEvents = partialValidated.quickEvents.map((row) => (
  row.id === 'event-60' ? { ...row, jugadorId: secondPlayerId, playerId: secondPlayerId } : row
));
const corrected = applyDelegatedMatchStatus({ ...partialValidated, quickEvents: correctedEvents }, 'Validado');
assert.equal(getDelegatedMatchAudit(corrected).validated, 60, 'un jugador corregido manualmente pasa a validado');
assert.equal(corrected.quickEvents.find((row) => row.id === 'event-60').playerId, secondPlayerId, 'validar preserva la corrección manual');

const derived = ['gol', 'tiro_puerta'].reduce((stats, type) => {
  Object.entries(DELEGATED_EVENT_STAT_EFFECTS[type].team).forEach(([key, value]) => {
    stats[key] = (stats[key] || 0) + value;
  });
  return stats;
}, {});
assert.deepEqual(derived, { goals: 1, shots: 2, shotsOnTarget: 2 }, 'gol y TAP aplican sus derivaciones una sola vez');

const batchCalls = [];
const batch = await runDelegatedMatchStatusBatch(['one', 'two'], async (id) => {
  batchCalls.push(id);
  return { ok: id === 'one' };
});
assert.deepEqual(batchCalls, ['one', 'two']);
assert.deepEqual(batch, { succeeded: ['one'], failed: ['two'] }, 'el lote usa la misma operación y conserva los fallos');

console.log('delegatedMatchValidation tests passed');
