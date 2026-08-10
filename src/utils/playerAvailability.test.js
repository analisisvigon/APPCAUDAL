import assert from 'node:assert/strict';
import {
  addAllAvailableOutsidePlayers,
  buildAvailabilityRpcInput,
  consumeSuspensionsForEligibleMatches,
  consumeSuspensionModel,
  getAvailableOutsidePlayerNames,
  getEligibleSuspensionMatches,
  getPlayerAvailabilityPresentation,
  isPlayerAvailable,
  normalizePlayerAvailability,
  transitionPlayerAvailability,
} from './playerAvailability.js';

const available = { id: 'a', name: 'Disponible', availabilityStatus: 'available' };
const injured = { id: 'i', name: 'Lesionado', availabilityStatus: 'injured' };
const unavailable = { id: 'u', name: 'No disponible', availabilityStatus: 'unavailable' };
const suspended = { id: 's', name: 'Sancionado', availabilityStatus: 'suspended', suspensionMatchesRemaining: 2 };
const baseRows = [available, injured, unavailable, suspended].map((player) => ({ player, status: 'Fuera' }));

assert.deepEqual(getAvailableOutsidePlayerNames(baseRows), ['Disponible'], 'A-D: solo disponible entra en añadir todos');
const bulkRows = addAllAvailableOutsidePlayers(baseRows);
assert.equal(bulkRows[0].status, 'Suplente', 'A: disponible se convoca');
assert.ok(bulkRows.slice(1).every((row) => row.status === 'Fuera'), 'B-D: lesionado, no disponible y sancionado siguen fuera');
assert.equal(getPlayerAvailabilityPresentation(suspended).label, 'SANCIONADO · 2 partidos');
assert.equal(getPlayerAvailabilityPresentation({ ...suspended, suspensionMatchesRemaining: 1 }).label, 'SANCIONADO · 1 partido');
assert.equal(getPlayerAvailabilityPresentation(injured).label, 'LESIONADO');
assert.equal(getPlayerAvailabilityPresentation(unavailable).label, 'NO DISPONIBLE');

assert.deepEqual(buildAvailabilityRpcInput('i', 'injured', 9), {
  p_jugador_id: 'i', p_availability_status: 'injured', p_suspension_matches_remaining: 0,
}, 'F: lesión persistente no lleva contador');
assert.deepEqual(buildAvailabilityRpcInput('i', 'available', 2), {
  p_jugador_id: 'i', p_availability_status: 'available', p_suspension_matches_remaining: 0,
}, 'G/I: alta manual limpia contador');
assert.deepEqual(normalizePlayerAvailability({ availabilityStatus: 'suspended', suspensionMatchesRemaining: 0 }), {
  status: 'available', remaining: 0,
}, 'J: contador cero no deja sanción inválida');
assert.equal(isPlayerAvailable({ availabilityStatus: 'available' }), true);

const matches = [
  { id: 'old', date: '2025-01-01', competitionKey: 'league', status: 'Jugado' },
  { id: 'league', date: '2026-08-11', competitionKey: 'league', status: 'Jugado' },
  { id: 'cup', date: '2026-08-12', competitionKey: 'copa_rfef', homeScore: '1', awayScore: '0' },
  { id: 'playoff', date: '2026-08-13', competitionKey: 'playoff', goalsFor: '0', goalsAgainst: '0' },
  { id: 'friendly', date: '2026-08-14', competitionKey: 'friendly', status: 'Jugado' },
  { id: 'postponed', date: '2026-08-15', competitionKey: 'league', status: 'Aplazado', homeScore: '1', awayScore: '0' },
  { id: 'suspended', date: '2026-08-16', competitionKey: 'league', status: 'Suspendido', homeScore: '1', awayScore: '0' },
  { id: 'cancelled', date: '2026-08-17', competitionKey: 'league', status: 'Cancelado', homeScore: '1', awayScore: '0' },
];
assert.deepEqual(
  getEligibleSuspensionMatches(matches, [], new Date(2026, 7, 20)).map(({ id }) => id),
  ['old', 'league', 'cup', 'playoff'],
  'E/M: amistoso y estados especiales nunca llegan a la RPC; las tres claves oficiales sí'
);

const rpcCalls = [];
const mockSupabase = {
  rpc: async (name, payload) => {
    rpcCalls.push({ name, payload });
    return { data: payload.p_partido_id === 'league' ? [{ jugador_id: 's', matches_remaining_before: 2, matches_remaining_after: 1 }] : [], error: null };
  },
};
const consumptions = await consumeSuspensionsForEligibleMatches({ supabase: mockSupabase, matches: matches.slice(1), now: new Date(2026, 7, 20) });
assert.deepEqual(rpcCalls.map((call) => call.payload.p_partido_id), ['league', 'cup', 'playoff']);
assert.equal(consumptions[0].partidoId, 'league');

const historicalCallup = { player: { ...available, availabilityStatus: 'injured' }, status: 'Titular' };
assert.equal(addAllAvailableOutsidePlayers([historicalCallup])[0].status, 'Titular', 'H: la acción masiva no reinterpreta un titular histórico');

const sanctionStart = '2026-08-10T10:00:00.000Z';
let sanctionedPlayer = transitionPlayerAvailability(
  { id: 's', availabilityStatus: 'available' },
  'suspended',
  2,
  { cycleId: 'cycle-a', now: sanctionStart }
);
const officialA = { id: 'official-a', date: '2026-08-11', time: '18:00', competitionKey: 'league', status: 'Jugado' };
let consumption = consumeSuspensionModel({ player: sanctionedPlayer, match: officialA, now: new Date(2026, 7, 20) });
assert.equal(consumption.player.suspensionMatchesRemaining, 1, 'D: primer oficial descuenta 2→1');
const repeated = consumeSuspensionModel({ player: consumption.player, match: officialA, consumedKeys: consumption.consumedKeys, now: new Date(2026, 7, 20) });
assert.equal(repeated.player.suspensionMatchesRemaining, 1, 'D/N: reabrir o editar no vuelve a descontar');
const officialB = { ...officialA, id: 'official-b', date: '2026-08-12' };
consumption = consumeSuspensionModel({ player: repeated.player, match: officialB, consumedKeys: repeated.consumedKeys, now: new Date(2026, 7, 20) });
assert.equal(consumption.player.availabilityStatus, 'available', 'D: segundo oficial completa y da de alta');
assert.equal(consumption.player.suspensionMatchesRemaining, 0);

sanctionedPlayer = transitionPlayerAvailability(
  consumption.player,
  'suspended',
  1,
  { cycleId: 'cycle-b', now: '2026-08-13T10:00:00.000Z' }
);
assert.equal(sanctionedPlayer.suspensionCycleId, 'cycle-b', 'L: una sanción posterior abre ciclo nuevo');
const oldCycleKeys = new Set(['s:official-b:cycle-a']);
const newCycleMatch = { ...officialA, id: 'official-b', date: '2026-08-14' };
assert.equal(consumeSuspensionModel({ player: sanctionedPlayer, match: newCycleMatch, consumedKeys: oldCycleKeys, now: new Date(2026, 7, 20) }).consumed, true, 'L: auditoría del ciclo anterior no bloquea el nuevo');

const friendlyResult = consumeSuspensionModel({ player: sanctionedPlayer, match: { ...officialA, id: 'friendly-x', competitionKey: 'friendly' }, now: new Date(2026, 7, 20) });
assert.equal(friendlyResult.consumed, false, 'E: friendly no consume');
const historicalResult = consumeSuspensionModel({ player: sanctionedPlayer, match: { ...officialA, id: 'old-x', date: '2025-01-01' }, now: new Date(2026, 7, 20) });
assert.equal(historicalResult.consumed, false, 'K: partido anterior al inicio no consume');
for (const specialStatus of ['Aplazado', 'Suspendido', 'Cancelado']) {
  assert.equal(consumeSuspensionModel({ player: sanctionedPlayer, match: { ...officialA, id: specialStatus, status: specialStatus }, now: new Date(2026, 7, 20) }).consumed, false, `M: ${specialStatus} no consume`);
}
const firstConcurrentAttempt = consumeSuspensionModel({ player: sanctionedPlayer, match: newCycleMatch, consumedKeys: oldCycleKeys, now: new Date(2026, 7, 20) });
const secondConcurrentAttempt = consumeSuspensionModel({ player: firstConcurrentAttempt.player, match: newCycleMatch, consumedKeys: firstConcurrentAttempt.consumedKeys, now: new Date(2026, 7, 20) });
assert.equal(Number(firstConcurrentAttempt.consumed) + Number(secondConcurrentAttempt.consumed), 1, 'O: una clave única solo admite un decremento');

const injuredState = transitionPlayerAvailability({ id: 'i' }, 'injured', 0);
assert.equal(transitionPlayerAvailability(injuredState, 'injured', 0).availabilityStatus, 'injured', 'F: lesión persiste');
assert.equal(transitionPlayerAvailability(injuredState, 'available', 0).availabilityStatus, 'available', 'G: alta desde convocatoria se refleja en la fuente única');
const manualRelease = transitionPlayerAvailability(sanctionedPlayer, 'available', 0);
assert.deepEqual([manualRelease.availabilityStatus, manualRelease.suspensionMatchesRemaining, manualRelease.suspensionCycleId], ['available', 0, null], 'I: alta manual limpia contador y ciclo');
assert.equal(transitionPlayerAvailability(sanctionedPlayer, 'suspended', 0).availabilityStatus, 'available', 'J: sancionado con cero se convierte en disponible');

console.log('playerAvailability tests passed');
