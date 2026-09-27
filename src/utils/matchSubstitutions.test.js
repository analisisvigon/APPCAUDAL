import assert from 'node:assert/strict';
import {
  buildSubstitutionTimelineEvents,
  deriveLegacySubstitutionEvents,
  getMatchSubstitutionEvents,
  getOnFieldPlayerIdsAtMinute,
  projectSubstitutionMinutes,
} from './matchSubstitutions.js';

const player = (playerId, playerName) => ({ playerId, playerName });
const starters = [
  player('borja', 'Borja'),
  ...Array.from({ length: 10 }, (_, index) => player(`starter-${index}`, `Titular ${index}`)),
];
const chain = [
  {
    id: 'sub-60', minute: 60, eventOrder: 0,
    outgoingPlayerId: 'borja', incomingPlayerId: 'josin',
    outgoingNameSnapshot: 'Borja', incomingNameSnapshot: 'Josín', reason: 'tactical',
  },
  {
    id: 'sub-75', minute: 75, eventOrder: 0,
    outgoingPlayerId: 'josin', incomingPlayerId: 'julio',
    outgoingNameSnapshot: 'Josín', incomingNameSnapshot: 'Julio Rodríguez', reason: 'injury',
  },
];

const projection = projectSubstitutionMinutes({ initialPlayers: starters, events: chain, duration: 90 });
assert.equal(projection.valid, true, projection.errors.join(', '));
assert.equal(projection.minutesByPlayer.borja, 60, 'B: el titular sale en el 60');
assert.equal(projection.minutesByPlayer.josin, 15, 'D: el suplente juega del 60 al 75');
assert.equal(projection.minutesByPlayer.julio, 15, 'E: el segundo suplente juega del 75 al final');
assert.equal(projection.minutesByPlayer['starter-0'], 90, 'A: un titular sin cambio completa la duración');

assert.deepEqual(getOnFieldPlayerIdsAtMinute({ initialPlayers: starters, events: chain, minute: 59 }).sort(), starters.map((item) => item.playerId).sort());
assert.equal(getOnFieldPlayerIdsAtMinute({ initialPlayers: starters, events: chain, minute: 60 }).includes('josin'), true);
assert.equal(getOnFieldPlayerIdsAtMinute({ initialPlayers: starters, events: chain, minute: 60 }).includes('borja'), false);
assert.equal(getOnFieldPlayerIdsAtMinute({ initialPlayers: starters, events: chain, minute: 74 }).includes('josin'), true);
assert.equal(getOnFieldPlayerIdsAtMinute({ initialPlayers: starters, events: chain, minute: 75 }).includes('julio'), true);
assert.equal(getOnFieldPlayerIdsAtMinute({ initialPlayers: starters, events: chain, minute: 75 }).includes('josin'), false);

const timeline = buildSubstitutionTimelineEvents(chain);
assert.deepEqual(timeline.map((event) => [event.minute, event.outPlayer.playerName, event.inPlayer.playerName]), [
  [60, 'Borja', 'Josín'],
  [75, 'Josín', 'Julio Rodríguez'],
]);
assert.equal(timeline[1].reason, 'injury', 'G: lesión queda como motivo deportivo sin efecto clínico');

const sameMinute = projectSubstitutionMinutes({
  initialPlayers: starters,
  duration: 90,
  events: [
    { id: 'same-1', minute: 60, eventOrder: 1, outgoingPlayerId: 'starter-0', incomingPlayerId: 'sub-b' },
    { id: 'same-0', minute: 60, eventOrder: 0, outgoingPlayerId: 'borja', incomingPlayerId: 'sub-a' },
  ],
});
assert.equal(sameMinute.valid, true);
assert.deepEqual(sameMinute.events.map((event) => event.id), ['same-0', 'same-1'], 'minute + event_order es estable');

const outgoingOutside = projectSubstitutionMinutes({
  initialPlayers: starters,
  duration: 90,
  events: [{ id: 'bad-out', minute: 20, eventOrder: 0, outgoingPlayerId: 'bench', incomingPlayerId: 'sub-a' }],
});
assert.match(outgoingOutside.errors.join(','), /OUTGOING_PLAYER_NOT_ON_FIELD/);

const incomingInside = projectSubstitutionMinutes({
  initialPlayers: starters,
  duration: 90,
  events: [{ id: 'bad-in', minute: 20, eventOrder: 0, outgoingPlayerId: 'borja', incomingPlayerId: 'starter-0' }],
});
assert.match(incomingInside.errors.join(','), /INCOMING_PLAYER_ALREADY_ON_FIELD/);

const invalidMinute = projectSubstitutionMinutes({
  initialPlayers: starters,
  duration: 90,
  events: [{ id: 'bad-minute', minute: 91, eventOrder: 0, outgoingPlayerId: 'borja', incomingPlayerId: 'sub-a' }],
});
assert.match(invalidMinute.errors.join(','), /INVALID_EVENT_MINUTE/);

const duplicateOrder = projectSubstitutionMinutes({
  initialPlayers: starters,
  duration: 90,
  events: [
    { id: 'order-a', minute: 60, eventOrder: 0, outgoingPlayerId: 'borja', incomingPlayerId: 'sub-a' },
    { id: 'order-b', minute: 60, eventOrder: 0, outgoingPlayerId: 'starter-0', incomingPlayerId: 'sub-b' },
  ],
});
assert.match(duplicateOrder.errors.join(','), /INVALID_EVENT_ORDER/);

const playerStats = {
  Borja: { jugadorId: 'borja', role: 'Titular', minutes: 60, replacementName: 'Josín' },
  'Josín': { jugadorId: 'josin', role: 'Suplente', minutes: 30 },
};
const legacy = deriveLegacySubstitutionEvents({ playerStats, lineup: [player('borja', 'Borja')], duration: 90 });
assert.equal(legacy.valid, true);
assert.equal(legacy.events.length, 1);
assert.equal(legacy.events[0].source, 'legacy');

const canonicalPriority = getMatchSubstitutionEvents({ canonicalEvents: chain, playerStats, lineup: starters, duration: 90 });
assert.equal(canonicalPriority.source, 'canonical');
assert.equal(canonicalPriority.events.length, 2, 'no mezcla replacement_name cuando existen canónicos');

const ambiguousLegacy = deriveLegacySubstitutionEvents({
  playerStats: {
    Borja: { jugadorId: 'borja', role: 'Titular', minutes: 60, replacementName: 'Álex' },
    'Álex': { jugadorId: '', role: 'Suplente', minutes: 30 },
  },
  lineup: [player('borja', 'Borja')],
  duration: 90,
});
assert.equal(ambiguousLegacy.valid, false);
assert.match(ambiguousLegacy.errors.join(','), /LEGACY_INCOMING_IDENTITY_AMBIGUOUS/);

console.log('Canonical chained substitutions: OK');
