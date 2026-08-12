import assert from 'node:assert/strict';
import {
  applyMatchSquadSnapshotModel,
  buildMatchSquadSnapshot,
  getActiveStatsCalledPlayerNames,
  getStatsSquadIdentity,
  validateMatchSquadSnapshot,
} from './statsSquadSnapshot.js';

const uuid = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const matchId = uuid(999);
const roster = Array.from({ length: 23 }, (_, index) => ({ id: uuid(index + 1), name: `Jugador ${index + 1}` }));
const called = roster.slice(0, 18);
const lineup = roster.slice(0, 11).map((player) => player.name);
const emptyState = { system: '4-4-2', slots: [], callups: [], stats: [] };

const snapshot = buildMatchSquadSnapshot({
  matchId,
  system: '4-3-3',
  lineup,
  rosterPlayers: roster,
  calledPlayers: called,
});
validateMatchSquadSnapshot(snapshot);
assert.equal(snapshot.p_squad.filter((player) => player.role === 'Titular').length, 11, 'QA 11+7+5: once titulares');
assert.equal(snapshot.p_squad.filter((player) => player.role === 'Suplente').length, 7, 'QA 11+7+5: siete suplentes');
assert.equal(snapshot.p_squad.filter((player) => player.role === 'Fuera').length, 5, 'QA 11+7+5: cinco fuera');
assert.equal(snapshot.p_slots.length, 11, 'QA 11+7+5: once slots');
assert.equal(new Set(snapshot.p_slots.map((slot) => slot.slot)).size, 11, 'los slots son únicos');

const tooMany = structuredClone(snapshot);
tooMany.p_slots.push({ slot: 11, jugador_id: uuid(12), player_name: 'Jugador 12' });
assert.throws(() => validateMatchSquadSnapshot(tooMany), /more than 11/);

const duplicatedSlot = structuredClone(snapshot);
duplicatedSlot.p_slots[1].slot = duplicatedSlot.p_slots[0].slot;
assert.throws(() => validateMatchSquadSnapshot(duplicatedSlot), /Duplicated lineup slot/);

const duplicatedPlayer = structuredClone(snapshot);
duplicatedPlayer.p_squad.push({ ...duplicatedPlayer.p_squad[0] });
assert.throws(() => validateMatchSquadSnapshot(duplicatedPlayer), /Duplicated squad player/);

const inconsistent = structuredClone(snapshot);
inconsistent.p_squad[0].role = 'Suplente';
assert.throws(() => validateMatchSquadSnapshot(inconsistent), /do not match/);

['injured', 'suspended', 'unavailable'].forEach((status) => {
  assert.throws(
    () => validateMatchSquadSnapshot(snapshot, { [roster[0].id]: status }),
    /unavailable player/,
    `${status} no puede ser titular`,
  );
});

const initial = applyMatchSquadSnapshotModel(emptyState, snapshot);
const swapLineup = [...lineup];
swapLineup[0] = roster[11].name;
const swapSnapshot = buildMatchSquadSnapshot({
  matchId,
  system: '4-3-3',
  lineup: swapLineup,
  rosterPlayers: roster,
  calledPlayers: called,
});
const swapped = applyMatchSquadSnapshotModel(initial, swapSnapshot);
assert.equal(swapped.slots[0].jugador_id, roster[11].id, 'swap: B ocupa exactamente el slot de A');
assert.equal(swapped.stats.find((row) => row.jugador_id === roster[11].id).role, 'Titular');
assert.equal(swapped.stats.find((row) => row.jugador_id === roster[0].id).role, 'Suplente');
assert.ok(swapped.callups.some((row) => row.jugador_id === roster[0].id), 'swap: A continúa convocado');

const movedLineup = [...lineup];
[movedLineup[2], movedLineup[7]] = [movedLineup[7], movedLineup[2]];
const movedSnapshot = buildMatchSquadSnapshot({ matchId, system: '4-3-3', lineup: movedLineup, rosterPlayers: roster, calledPlayers: called });
const moved = applyMatchSquadSnapshotModel(initial, movedSnapshot);
assert.equal(moved.slots.filter((slot) => slot.jugador_id === roster[2].id).length, 1, 'cambio de posición conserva un solo slot');

const beforeFailure = structuredClone(initial);
assert.throws(() => applyMatchSquadSnapshotModel(initial, duplicatedSlot), /Duplicated lineup slot/);
assert.deepEqual(initial, beforeFailure, 'un payload inválido no modifica sistema, slots, convocatoria ni estadísticas');

const repeated = applyMatchSquadSnapshotModel(initial, snapshot);
assert.deepEqual(applyMatchSquadSnapshotModel(repeated, snapshot), repeated, 'guardar dos veces es idempotente y conserva IDs');

const historicalState = applyMatchSquadSnapshotModel(emptyState, snapshot);
const historicalIndex = historicalState.stats.findIndex((row) => row.jugador_id === roster[0].id);
historicalState.stats[historicalIndex] = {
  ...historicalState.stats[historicalIndex],
  minutes: '63',
  yellow: true,
  yellow_count: 1,
  red: false,
  injured: true,
  rating: '8',
  replacement_name: roster[11].name,
};
const withoutHistoricalPlayer = buildMatchSquadSnapshot({
  matchId,
  system: '4-2-3-1',
  lineup: lineup.slice(1),
  rosterPlayers: roster,
  calledPlayers: called.slice(1),
});
const preserved = applyMatchSquadSnapshotModel(historicalState, withoutHistoricalPlayer);
const historicalRow = preserved.stats.find((row) => row.jugador_id === roster[0].id);
assert.equal(preserved.callups.some((row) => row.jugador_id === roster[0].id), false, 'Fuera desaparece de convocatoria');
assert.deepEqual(
  {
    minutes: historicalRow.minutes,
    yellow: historicalRow.yellow,
    yellow_count: historicalRow.yellow_count,
    injured: historicalRow.injured,
    rating: historicalRow.rating,
    replacement_name: historicalRow.replacement_name,
  },
  { minutes: '63', yellow: true, yellow_count: 1, injured: true, rating: '8', replacement_name: roster[11].name },
  'Fuera con histórico conserva minutos, tarjetas, lesión, valoración y sustitución',
);

const realMinutesState = structuredClone(historicalState);
const samePlayerStillCalled = applyMatchSquadSnapshotModel(realMinutesState, snapshot);
assert.equal(samePlayerStillCalled.stats.find((row) => row.jugador_id === roster[0].id).minutes, '63', '63 minutos reales nunca vuelven a 90');

const placeholderState = applyMatchSquadSnapshotModel(emptyState, snapshot);
const placeholderPreserved = applyMatchSquadSnapshotModel(placeholderState, withoutHistoricalPlayer);
assert.ok(placeholderPreserved.stats.some((row) => row.jugador_id === roster[0].id), 'Fuera placeholder también se conserva de forma no destructiva');

const legacySnapshot = buildMatchSquadSnapshot({
  matchId,
  system: '4-4-2',
  lineup: ['  Jugador   Legacy  '],
  rosterPlayers: [],
  calledPlayers: [{ name: 'Jugador Legacy' }],
});
assert.equal(getStatsSquadIdentity(legacySnapshot.p_squad[0]), 'legacy:jugador legacy');
assert.equal(legacySnapshot.p_squad[0].jugador_id, null, 'legacy sin UUID no recibe una identidad inventada');

assert.deepEqual(
  getActiveStatsCalledPlayerNames({
    calledPlayerNames: ['Convocado Real'],
    lineupNames: ['Titular sin convocatoria', 'Convocado Real'],
    statsPlayerData: { 'Historico fuera': { minutes: '63' } },
  }),
  ['Convocado Real', 'Titular sin convocatoria'],
  'las estadisticas historicas no vuelven a convertir un Fuera en convocado',
);

const renamedId = uuid(700);
const renamedSnapshot = buildMatchSquadSnapshot({
  matchId,
  system: '4-4-2',
  rosterPlayers: [{ id: renamedId, name: 'Nombre Actual' }],
  calledPlayers: [{ name: 'Nombre Anterior' }],
  calledPlayerIds: { 'Nombre Anterior': renamedId },
});
assert.deepEqual(
  renamedSnapshot.p_squad,
  [{ jugador_id: renamedId, player_name: 'Nombre Actual', role: 'Suplente' }],
  'el UUID conserva identidad y el nombre actual de plantilla prevalece sobre el legacy',
);

const sameNameSnapshot = buildMatchSquadSnapshot({
  matchId,
  system: '4-4-2',
  rosterPlayers: [
    { id: uuid(701), name: 'Nombre Repetido' },
    { id: uuid(702), name: 'Nombre Repetido' },
  ],
  calledPlayers: [
    { id: uuid(701), name: 'Nombre Repetido' },
    { id: uuid(702), name: 'Nombre Repetido' },
  ],
});
assert.equal(sameNameSnapshot.p_squad.length, 2, 'dos nombres iguales conservan dos identidades UUID distintas');
assert.equal(new Set(sameNameSnapshot.p_squad.map(getStatsSquadIdentity)).size, 2);

console.log('statsSquadSnapshot tests passed');
