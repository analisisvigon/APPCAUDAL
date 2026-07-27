import assert from 'node:assert/strict';
import {
  buildDelegatedPlayerOptions,
  buildDelegatedQuickEventDbPayload,
  delegatedEventMatchesPlayer,
  getDelegatedEventPlayerId,
  normalizeDelegatedQuickEvent,
  resolveDelegatedEventPlayer,
} from './delegatedEventIdentity.js';

const playerId = '11111111-1111-4111-8111-111111111111';
const secondPlayerId = '22222222-2222-4222-8222-222222222222';
const players = [
  { id: playerId, globalPlayerId: '44444444-4444-4444-8444-444444444444', name: 'Álex García', number: 8 },
  { id: secondPlayerId, name: 'Mario López', number: 11 },
];

const playerOptions = buildDelegatedPlayerOptions({
  players,
  calledPlayerNames: ['Alex Garcia'],
  calledPlayerIds: {},
  statsPlayerData: {},
  lineupNames: [],
});
assert.equal(playerOptions.length, 1, 'resuelve una convocatoria legacy por nombre normalizado');
assert.equal(playerOptions[0].id, playerId, 'el selector siempre expone jugadores.id, nunca el nombre');

const delegatedEventTypes = [
  'gol',
  'tiro',
  'tiro_puerta',
  'recuperacion',
  'robo',
  'perdida',
  'regate',
  'centro',
  'falta_realizada',
  'falta_recibida',
  'yellow_card',
  'red_card',
  'substitution',
];

delegatedEventTypes.forEach((eventType) => {
  const payload = buildDelegatedQuickEventDbPayload({
    partidoId: '33333333-3333-4333-8333-333333333333',
    playerReference: playerId,
    players,
    team: 'caudal',
    eventType,
    minute: 27,
  });
  assert.equal(payload.jugador_id, playerId, `${eventType} conserva jugador_id`);
  const reloaded = normalizeDelegatedQuickEvent({
    id: `event-${eventType}`,
    partido_id: payload.partido_id,
    jugador_id: payload.jugador_id,
    equipo: payload.equipo,
    tipo_evento: payload.tipo_evento,
    minuto: payload.minuto,
  }, players);
  assert.equal(reloaded.jugadorId, playerId, `${eventType} recupera el jugador al leer`);
  assert.equal(resolveDelegatedEventPlayer(reloaded, players).player?.id, playerId, `${eventType} renderiza el jugador correcto`);
  assert.equal(delegatedEventMatchesPlayer(reloaded, players[0], players), true, `${eventType} alimenta las estadísticas del jugador`);
});

const legacyEvent = normalizeDelegatedQuickEvent({
  id: 'legacy-event',
  partido_id: '33333333-3333-4333-8333-333333333333',
  player_name: 'Alex Garcia',
  equipo: 'caudal',
  tipo_evento: 'robo',
  minuto: 8,
}, players);
assert.equal(getDelegatedEventPlayerId(legacyEvent), playerId, 'un evento antiguo por nombre se resuelve en memoria');
assert.equal(legacyEvent.playerName, 'Álex García', 'el nombre mostrado procede del jugador real');

assert.throws(
  () => buildDelegatedQuickEventDbPayload({
    partidoId: '33333333-3333-4333-8333-333333333333',
    playerReference: 'Jugador inexistente',
    players,
    team: 'caudal',
    eventType: 'tiro',
    minute: 4,
  }),
  /jugador_id canónico/,
  'una selección inválida no se serializa silenciosamente como null',
);

const rivalPayload = buildDelegatedQuickEventDbPayload({
  partidoId: '33333333-3333-4333-8333-333333333333',
  playerReference: playerId,
  players,
  team: 'rival',
  eventType: 'tiro',
  minute: 12,
});
assert.equal(rivalPayload.jugador_id, null, 'los eventos rivales siguen sin vincularse a la plantilla propia');

console.log('delegatedEventIdentity tests passed');
