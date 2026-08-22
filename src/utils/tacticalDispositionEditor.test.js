import assert from 'node:assert/strict';
import {
  buildAutomaticSubstitutionSnapshot,
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
const minute71Substitutions = at71.substitutions.filter((substitution) => substitution.minute === 71);
const propagated = buildTacticalDispositionDraft({ interval: currentInterval, previousInterval, knownPlayers: at71.players, substitutions: minute71Substitutions });
assert.equal(propagated.lineup.filter(Boolean).length, 11, 'conserva los diez jugadores y propone el entrante en el slot directo');
assert.deepEqual(propagated.pendingPlayers, [], 'el entrante queda precolocado, pero la propuesta sigue siendo editable');

const systemChanged = buildTacticalDispositionDraft({ interval: { ...currentInterval, system: '4-2-3-1' }, previousInterval, knownPlayers: at71.players });
assert.equal(systemChanged.lineup.filter(Boolean).length, 0, 'un cambio de sistema no reutiliza slots de otra formación');
assert.equal(systemChanged.pendingPlayers.length, 11);

const originalIsmaSlot = propagated.lineup.findIndex((row) => row?.playerId === 'isma');
const placed = moveTacticalDispositionPlayer({ lineup: propagated.lineup, player: propagated.lineup[originalIsmaSlot], targetSlot: 6 });
assert.equal(placed[6].playerId, 'isma');
assert.equal(validateTacticalDisposition({ lineup: placed, knownPlayers: at71.players }).valid, true, 'mover la propuesta intercambia slots sin duplicar jugadores');
const completed = propagated.lineup;
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

const simpleStats = {
  ...Object.fromEntries(initialSlots.map((row) => [row.playerName, { jugadorId: row.playerId, minutes: 90, replacementName: '' }])),
  'Jugador 7': { jugadorId: 'p7', minutes: 60, replacementName: 'Entrante' },
  Entrante: { jugadorId: 'sub', minutes: 30, replacementName: '' },
};
const initialInterval = { fromMinute: 0, toMinute: 90, system: '4-3-3', isComplete: true, slots: initialSlots };
const simpleAutomatic = buildAutomaticSubstitutionSnapshot({
  minute: 60,
  system: '4-3-3',
  intervals: [initialInterval],
  initialSlots,
  playerStats: simpleStats,
});
assert.equal(simpleAutomatic.status, 'complete', 'A) una sustitución simple genera snapshot completo');
assert.equal(simpleAutomatic.slots.find((row) => row.slot === 7).playerId, 'sub', 'A) el entrante hereda como propuesta el slot del saliente');
assert.equal(simpleAutomatic.slots.find((row) => row.playerId === 'p4').slot, 4, 'E) un jugador que no participa en el cambio conserva exactamente su slot');

const changedSystemBase = { ...initialInterval, fromMinute: 60, system: '4-2-3-1', sourceSystemEventId: 'system-60' };
const mergedSystemChange = buildAutomaticSubstitutionSnapshot({
  minute: 60,
  system: '4-2-3-1',
  intervals: [initialInterval, changedSystemBase],
  initialSlots,
  playerStats: simpleStats,
});
assert.equal(mergedSystemChange.status, 'complete', 'B) un snapshot del cambio de sistema se fusiona con la sustitución del mismo minuto');
assert.equal(mergedSystemChange.sourceSystemEventId, 'system-60');
assert.equal(mergedSystemChange.slots.length, 11, 'B) el plan produce una sola disposición final de 11 slots');

const multipleStats = {
  ...simpleStats,
  'Jugador 5': { jugadorId: 'p5', minutes: 60, replacementName: 'Segundo entrante' },
  'Segundo entrante': { jugadorId: 'sub-2', minutes: 30, replacementName: '' },
};
const multipleAutomatic = buildAutomaticSubstitutionSnapshot({ minute: 60, system: '4-3-3', intervals: [initialInterval], initialSlots, playerStats: multipleStats });
assert.equal(multipleAutomatic.status, 'complete', 'G) varias sustituciones en el mismo minuto se resuelven juntas');
assert.equal(multipleAutomatic.slots.find((row) => row.slot === 5).playerId, 'sub-2');
assert.equal(multipleAutomatic.slots.find((row) => row.slot === 7).playerId, 'sub');

const editableKnown = buildKnownOnFieldPlayers({ initialSlots, playerStats: simpleStats, atMinute: 60 }).players;
const editableLineup = Array.from({ length: 11 }, () => null);
simpleAutomatic.slots.forEach((row) => { editableLineup[row.slot] = row; });
const editedOnce = moveTacticalDispositionPlayer({ lineup: editableLineup, player: editableLineup[7], targetSlot: 8 });
assert.equal(validateTacticalDisposition({ lineup: editedOnce, knownPlayers: editableKnown }).valid, true, 'D) el snapshot automático sigue siendo editable sin alterar los once');

const originalBase = JSON.stringify(initialInterval);
buildTacticalDispositionDraft({ interval: { ...initialInterval, isComplete: false }, previousInterval: initialInterval, knownPlayers: editableKnown });
assert.equal(JSON.stringify(initialInterval), originalBase, 'E) cancelar/descartar un borrador no muta el snapshot guardado');

const idempotentInterval = { ...initialInterval, fromMinute: 60, slots: simpleAutomatic.slots };
const idempotent = buildAutomaticSubstitutionSnapshot({ minute: 60, system: '4-3-3', intervals: [initialInterval, idempotentInterval], initialSlots, playerStats: simpleStats });
assert.equal(idempotent.status, 'complete', 'F) repetir el mismo minuto reutiliza la foto existente');
assert.deepEqual(idempotent.slots, simpleAutomatic.slots, 'F) no duplica ni altera los slots ya aplicados');

const invalidBase = buildAutomaticSubstitutionSnapshot({ minute: 60, system: '4-3-3', intervals: [{ ...initialInterval, slots: initialSlots.slice(0, 10) }], initialSlots, playerStats: simpleStats });
assert.equal(invalidBase.status, 'needs_confirmation', 'la validación nunca guarda como completo un snapshot de 10 jugadores');

const unconfirmedSystemChange = buildAutomaticSubstitutionSnapshot({ minute: 60, system: '4-2-3-1', intervals: [initialInterval], initialSlots, playerStats: simpleStats });
assert.equal(unconfirmedSystemChange.reason, 'system_change_requires_confirmation', 'H) un cambio de sistema sin disposición del nuevo sistema exige confirmación');

console.log('tactical disposition editor tests passed');
