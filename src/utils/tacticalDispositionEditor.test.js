import assert from 'node:assert/strict';
import {
  buildKnownOnFieldPlayers,
  buildTacticalDispositionDraft,
  moveTacticalDispositionPlayer,
  tacticalSnapshotMatchesDisposition,
  validateTacticalDisposition,
} from './tacticalDispositionEditor.js';

const initialSlots = Array.from({ length: 11 }, (_, slot) => ({ slot, playerId: `p${slot}`, playerName: `Jugador ${slot}` }));
const playerStats = {
  'Jugador 10': { jugadorId: 'p10', minutes: 63, replacementName: 'Dani' },
  Dani: { jugadorId: 'dani', minutes: 27, replacementName: '' },
  'Jugador 5': { jugadorId: 'p5', minutes: 63, replacementName: 'Kike' },
  Kike: { jugadorId: 'kike', minutes: 27, replacementName: '' },
  'Jugador 7': { jugadorId: 'p7', minutes: 71, replacementName: 'Isma Cerro' },
  'Isma Cerro': { jugadorId: 'isma', minutes: 19, replacementName: '' },
  'Jugador 2': { jugadorId: 'p2', minutes: 84, replacementName: 'Marcos' },
  Marcos: { jugadorId: 'marcos', minutes: 6, replacementName: '' },
};

const at63 = buildKnownOnFieldPlayers({ initialSlots, playerStats, atMinute: 63 });
assert.equal(at63.valid, true);
assert.equal(at63.players.some((player) => player.playerId === 'p7'), true);
assert.equal(at63.players.some((player) => player.playerId === 'p10'), false);
assert.equal(at63.players.some((player) => player.playerId === 'dani'), true);
assert.equal(at63.players.some((player) => player.playerId === 'p5'), false);
assert.equal(at63.players.some((player) => player.playerId === 'kike'), true, 'las dos sustituciones del 63 determinan los once del siguiente intervalo');

const at71 = buildKnownOnFieldPlayers({ initialSlots, playerStats, atMinute: 71 });
assert.equal(at71.valid, true);
assert.equal(at71.players.some((player) => player.playerId === 'p7'), false);
assert.equal(at71.players.some((player) => player.playerId === 'isma'), true, 'la sustitución determina quién está en campo, no su slot');

const at84 = buildKnownOnFieldPlayers({ initialSlots, playerStats, atMinute: 84 });
assert.equal(at84.valid, true);
assert.equal(at84.players.some((player) => player.playerId === 'p2'), false);
assert.equal(at84.players.some((player) => player.playerId === 'marcos'), true, 'la foto 84-90 usa el cuarto cambio conocido sin inferir su posición');

const at63Slots = initialSlots.map((row) => {
  if (row.playerId === 'p10') return { ...row, playerId: 'dani', playerName: 'Dani' };
  if (row.playerId === 'p5') return { ...row, playerId: 'kike', playerName: 'Kike' };
  return row;
});
const previousInterval = { system: '4-3-3', isComplete: true, slots: at63Slots };
const currentInterval = { system: '4-3-3', isComplete: false, slots: [] };
const propagated = buildTacticalDispositionDraft({ interval: currentInterval, previousInterval, knownPlayers: at71.players });
assert.equal(propagated.lineup.filter(Boolean).length, 10, 'conserva exactamente los diez jugadores que continúan en sus slots');
assert.deepEqual(propagated.pendingPlayers.map((player) => player.playerId), ['isma'], 'el entrante queda pendiente de colocar');

const systemChanged = buildTacticalDispositionDraft({ interval: { ...currentInterval, system: '4-2-3-1' }, previousInterval, knownPlayers: at71.players });
assert.equal(systemChanged.lineup.filter(Boolean).length, 0, 'un cambio de sistema no reutiliza slots de otra formación');
assert.equal(systemChanged.pendingPlayers.length, 11);

const placed = moveTacticalDispositionPlayer({ lineup: propagated.lineup, player: propagated.pendingPlayers[0], targetSlot: 6 });
assert.equal(placed[6].playerId, 'isma');
assert.equal(validateTacticalDisposition({ lineup: placed, knownPlayers: at71.players }).valid, false, 'desplazar un jugador desde pendientes deja al sustituido fuera, no duplica ni inventa un slot');
const completed = moveTacticalDispositionPlayer({ lineup: propagated.lineup, player: propagated.pendingPlayers[0], targetSlot: propagated.lineup.findIndex((row) => !row) });
assert.equal(validateTacticalDisposition({ lineup: completed, knownPlayers: at71.players }).valid, true);

const duplicate = completed.slice();
duplicate[0] = duplicate[1];
assert.equal(validateTacticalDisposition({ lineup: duplicate, knownPlayers: at71.players }).valid, false);

const persistedSlots = validateTacticalDisposition({ lineup: completed, knownPlayers: at71.players }).slots;
assert.equal(tacticalSnapshotMatchesDisposition({
  snapshot: { partido_id: 'match-1', minute: 71, system: '4-3-3', slots: persistedSlots.map((row) => ({ slot: row.slot, jugador_id: row.playerId, player_name_snapshot: row.playerName })) },
  matchId: 'match-1',
  minute: 71,
  system: '4-3-3',
  slots: persistedSlots,
}), true, 'la relectura confirma partido, minuto, sistema y los once slots exactos');
assert.equal(tacticalSnapshotMatchesDisposition({
  snapshot: { partido_id: 'another-match', minute: 71, system: '4-3-3', slots: persistedSlots },
  matchId: 'match-1',
  minute: 71,
  system: '4-3-3',
  slots: persistedSlots,
}), false, 'un snapshot de otro partido nunca valida el guardado');

console.log('tactical disposition editor tests passed');
