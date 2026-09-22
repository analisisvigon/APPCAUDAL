import assert from 'node:assert/strict';
import {
  buildKnownOnFieldPlayers,
  buildTacticalDispositionDraft,
  getTacticalSubstitutionsAtMinute,
  moveTacticalDispositionPlayer,
  saveTacticalDispositionWithReload,
  validateTacticalDisposition,
} from './tacticalDispositionEditor.js';

const matchId = 'match-ceares';
const system = '4-4-2';
const minute = 78;
const initialSlots = Array.from({ length: 11 }, (_, slot) => ({
  slot,
  playerId: slot === 5 ? 'carcaba' : `player-${slot}`,
  playerName: slot === 5 ? 'J. Cárcaba' : `Jugador ${slot}`,
}));
const playerStats = Object.fromEntries(initialSlots.map((player) => [player.playerName, {
  jugadorId: player.playerId,
  minutes: 90,
  replacementName: '',
}]));
playerStats['J. Cárcaba'] = { jugadorId: 'carcaba', minutes: 78, replacementName: 'Dani Palacio' };
playerStats['Dani Palacio'] = { jugadorId: 'dani', minutes: 12, replacementName: '' };

const postSubstitution = buildKnownOnFieldPlayers({ initialSlots, playerStats, atMinute: minute });
assert.equal(postSubstitution.valid, true, 'E) el XI del minuto 78 es reconstruible');
assert.equal(postSubstitution.players.some((player) => player.playerId === 'dani'), true, 'E) una sustitución <= 78 incluye al entrante');
assert.equal(postSubstitution.players.some((player) => player.playerId === 'carcaba'), false, 'E) una sustitución <= 78 excluye al saliente');

const draft = buildTacticalDispositionDraft({
  interval: { fromMinute: 78, toMinute: 90, system, isComplete: false, slots: initialSlots },
  previousInterval: { fromMinute: 65, toMinute: 78, system, isComplete: true, slots: initialSlots },
  knownPlayers: postSubstitution.players,
  substitutions: getTacticalSubstitutionsAtMinute({ playerStats, minute }),
});
assert.equal(draft.lineup.some((player) => player?.playerId === 'dani'), true, 'A) el borrador incompleto sustituye Cárcaba por Dani');
assert.equal(draft.lineup.some((player) => player?.playerId === 'carcaba'), false, 'A) no conserva al saliente del snapshot obsoleto');

const completeSlots = validateTacticalDisposition({
  lineup: draft.lineup,
  knownPlayers: postSubstitution.players,
}).slots;
assert.equal(completeSlots.length, 11);

let snapshots = [{
  id: 'snapshot-78-existing',
  partido_id: matchId,
  minute,
  system,
  is_complete: false,
  slots: initialSlots.map((slot) => ({ slot: slot.slot, jugador_id: slot.playerId, player_name_snapshot: slot.playerName })),
}];

const persistUpsert = async (slots) => {
  const existing = snapshots.find((snapshot) => snapshot.partido_id === matchId && snapshot.minute === minute);
  const persisted = {
    ...(existing || { id: 'snapshot-new', partido_id: matchId, minute }),
    system,
    is_complete: true,
    slots: slots.map((slot) => ({
      slot: slot.slot,
      jugador_id: slot.playerId,
      player_name_snapshot: slot.playerName,
    })),
  };
  snapshots = existing
    ? snapshots.map((snapshot) => snapshot === existing ? persisted : snapshot)
    : [...snapshots, persisted];
  return persisted.id;
};
const reload = async () => ({ tacticalSnapshots: structuredClone(snapshots) });

const firstSave = await saveTacticalDispositionWithReload({
  save: () => persistUpsert(completeSlots),
  reload,
  matchId,
  minute,
  system,
  slots: completeSlots,
  validateReloadedSnapshot: ({ snapshot }) => (
    snapshot.slots.length === 11
    && snapshot.slots.some((slot) => slot.jugador_id === 'dani')
    && !snapshot.slots.some((slot) => slot.jugador_id === 'carcaba')
  ),
});
assert.equal(firstSave.snapshot.id, 'snapshot-78-existing', 'C) completar el minuto existente reutiliza su snapshot ID');
assert.equal(snapshots.length, 1, 'C) el upsert no crea un segundo snapshot para el mismo partido/minuto');
assert.equal(firstSave.snapshot.slots.length, 11, 'A) la recarga contiene los 11 slots');
assert.equal(new Set(firstSave.snapshot.slots.map((slot) => slot.slot)).size, 11, 'A) los 11 slots son únicos');

const editedLineup = Array.from({ length: 11 }, () => null);
completeSlots.forEach((slot) => { editedLineup[slot.slot] = { playerId: slot.playerId, playerName: slot.playerName }; });
const movedLineup = moveTacticalDispositionPlayer({ lineup: editedLineup, player: editedLineup[5], targetSlot: 8 });
const movedSlots = validateTacticalDisposition({ lineup: movedLineup, knownPlayers: postSubstitution.players }).slots;
await saveTacticalDispositionWithReload({
  save: () => persistUpsert(movedSlots),
  reload,
  matchId,
  minute,
  system,
  slots: movedSlots,
});
assert.equal(snapshots[0].slots.find((slot) => slot.jugador_id === 'dani').slot, 8, 'B) editar, guardar y recargar conserva el slot nuevo exacto');

let successVisible = false;
const beforeFailure = structuredClone(snapshots);
await assert.rejects(saveTacticalDispositionWithReload({
  save: async () => { throw new Error('fallo persistiendo slots'); },
  reload,
  matchId,
  minute,
  system,
  slots: movedSlots,
}).then(() => { successVisible = true; }), /fallo persistiendo slots/);
assert.equal(successVisible, false, 'D) un fallo de slots nunca permite mostrar éxito');
assert.deepEqual(snapshots, beforeFailure, 'D) el fallo simulado conserva el estado persistido anterior');

await assert.rejects(saveTacticalDispositionWithReload({
  save: async () => 'snapshot-78-existing',
  reload: async () => ({ tacticalSnapshots: [{ ...snapshots[0], slots: snapshots[0].slots.slice(0, 10) }] }),
  matchId,
  minute,
  system,
  slots: movedSlots,
}), /relectura no confirmó/, 'D) una relectura parcial tampoco confirma el guardado');

await assert.rejects(saveTacticalDispositionWithReload({
  save: async () => 'snapshot-78-existing',
  reload,
  matchId,
  minute,
  system,
  slots: movedSlots,
  validateReloadedSnapshot: () => false,
}), /XI vigente/, 'A) once slots obsoletos no se aceptan como éxito táctico');

console.log('tactical disposition persistence tests passed');
