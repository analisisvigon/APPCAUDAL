import assert from 'node:assert/strict';
import {
  buildInitialTacticalSnapshot,
  buildTacticalMatchHistory,
  buildTacticalCombinationsFromIntervals,
  buildTacticalSlotEvidenceFromIntervals,
  buildTacticalSnapshotIntervals,
  buildSeasonTacticalCoverageAudit,
  getTacticalTimelineInvariantReport,
  parseTacticalMinute,
} from './tacticalSnapshots.js';

assert.equal(parseTacticalMinute(63), 63, 'acepta minutos numéricos');
assert.equal(parseTacticalMinute('63'), 63, 'acepta minutos numéricos serializados');
assert.equal(parseTacticalMinute("63'"), 63, 'acepta el apóstrofo habitual de los eventos');
assert.equal(parseTacticalMinute('63+2'), 63, 'el historial táctico usa el minuto base del tiempo añadido');
assert.equal(parseTacticalMinute(null), null, 'un minuto nulo no crea una frontera táctica');
assert.equal(parseTacticalMinute(undefined), null, 'un minuto ausente no crea una frontera táctica');
assert.equal(parseTacticalMinute('Sin minuto'), 0, 'el contrato actual normaliza a cero un texto sin dígitos');

const systems = {
  '4-2-3-1': [
    ['POR', 'porteria'], ['LI', 'defensa'], ['DFC_I', 'defensa'], ['DFC_D', 'defensa'], ['LD', 'defensa'],
    ['MCD_I', 'medio'], ['MCD_D', 'medio'], ['MPI', 'mediapunta'], ['MPC', 'mediapunta'], ['MPD', 'mediapunta'], ['DC', 'ataque'],
  ].map(([id, line], slot) => ({ id, label: id, line, slot })),
  '4-3-3': [
    ['POR', 'porteria'], ['LI', 'defensa'], ['DFC_I', 'defensa'], ['DFC_D', 'defensa'], ['LD', 'defensa'],
    ['MCD', 'medio'], ['MC_I', 'medio'], ['MC_D', 'medio'], ['EI', 'ataque'], ['DC', 'ataque'], ['ED', 'ataque'],
  ].map(([id, line], slot) => ({ id, label: id, line, slot })),
};
const lineup = (prefix = 'p') => Array.from({ length: 11 }, (_, slot) => ({ slot, playerId: `${prefix}-${slot}`, playerName: `${prefix.toUpperCase()} ${slot}` }));
const initial = buildInitialTacticalSnapshot({ matchId: 'match-1', system: '4-2-3-1', slots: lineup('a') });
assert.equal(buildInitialTacticalSnapshot({ matchId: 'partial', system: '4-2-3-1', slots: lineup('a').slice(0, 10) }).isComplete, false, 'una alineación inicial parcial no se presenta como fotografía completa');

const initialIntervals = buildTacticalSnapshotIntervals({ duration: 90, initialSnapshot: initial, initialSystem: '4-2-3-1' });
assert.deepEqual(initialIntervals.map(({ fromMinute, toMinute, system, isComplete }) => ({ fromMinute, toMinute, system, isComplete })), [
  { fromMinute: 0, toMinute: 90, system: '4-2-3-1', isComplete: true },
], 'snapshot inicial vigente durante todo el partido');

const changed = buildTacticalSnapshotIntervals({
  duration: 90,
  initialSnapshot: initial,
  initialSystem: '4-2-3-1',
  systemEvents: [{ id: 'system-63', minute: 63, toSystem: '4-3-3' }],
  snapshots: [{ id: 'snap-63', partidoId: 'match-1', minute: 63, system: '4-3-3', isComplete: true, slots: lineup('b') }],
});
assert.deepEqual(changed.map(({ fromMinute, toMinute, system, minutes }) => [fromMinute, toMinute, system, minutes]), [
  [0, 63, '4-2-3-1', 63],
  [63, 90, '4-3-3', 27],
], 'cambio de sistema crea intervalos exactos sin solapamiento');

const linkedSystemInterval = buildTacticalSnapshotIntervals({
  duration: 90,
  initialSnapshot: initial,
  initialSystem: '4-2-3-1',
  systemEvents: [{ id: 'system-linked-63', minute: 63, period: '2ª parte', toSystem: '4-3-3' }],
}).find((interval) => interval.fromMinute === 63);
assert.equal(linkedSystemInterval.sourceSystemEventId, 'system-linked-63', 'el editor puede conservar el vínculo con el cambio de sistema');
assert.equal(linkedSystemInterval.period, '2ª parte');

const changedHistory = buildTacticalMatchHistory({
  matchId: 'match-1',
  duration: 90,
  initialSystem: '4-2-3-1',
  initialSlots: lineup('a'),
  systemEvents: [{ id: 'system-63', minute: 63, toSystem: '4-3-3' }],
  snapshots: [
    { id: 'snap-63', partidoId: 'match-1', minute: 63, system: '4-3-3', isComplete: true, slots: lineup('b') },
    { id: 'snap-71', partidoId: 'match-1', minute: 71, system: '4-3-3', isComplete: true, slots: lineup('c') },
    { id: 'snap-84', partidoId: 'match-1', minute: 84, system: '4-3-3', isComplete: true, slots: lineup('d') },
  ],
});
assert.deepEqual(changedHistory.systemSegments.map(({ fromMinute, toMinute, system, intervals }) => [fromMinute, toMinute, system, intervals.length]), [
  [0, 63, '4-2-3-1', 1],
  [63, 90, '4-3-3', 3],
], 'el selector principal agrupa sustituciones y recolocaciones bajo el mismo tramo de sistema');
assert.deepEqual(changedHistory.systemSegments[1].intervals.map(({ fromMinute, toMinute }) => [fromMinute, toMinute]), [[63, 71], [71, 84], [84, 90]], 'los snapshots internos siguen siendo navegables sin crear más tramos de sistema');
assert.deepEqual(changedHistory.systemSegments[1].intervals.map((interval) => interval.slots[0].playerName), ['B 0', 'C 0', 'D 0'], 'al navegar snapshots del mismo sistema cambian los jugadores y slots visibles');
assert.deepEqual(getTacticalTimelineInvariantReport({ intervals: changed, duration: 90 }), {
  overlap: false, coveredMinutes: 90, duration: 90, completeMinutes: 90, incompleteMinutes: 0, valid: true,
});

const substitutionLineup = lineup('a');
substitutionLineup[9] = { slot: 9, playerId: 'sub-9', playerName: 'SUPLENTE 9' };
const substituted = buildTacticalSnapshotIntervals({
  duration: 90,
  initialSnapshot: initial,
  snapshots: [{ id: 'sub-60', matchId: 'match-1', minute: 60, system: '4-2-3-1', isComplete: true, reason: 'Sustitución', slots: substitutionLineup }],
  substitutionMinutes: [60],
  initialSystem: '4-2-3-1',
});
const resolveSlot = (system, slot) => systems[system]?.[slot];
const evidence = buildTacticalSlotEvidenceFromIntervals({ intervals: substituted, resolveSlot });
assert.equal(evidence.filter((row) => row.playerId === 'a-9').reduce((sum, row) => sum + row.minutes, 0), 60);
assert.equal(evidence.filter((row) => row.playerId === 'sub-9').reduce((sum, row) => sum + row.minutes, 0), 30, 'sustitución no duplica minutos');
assert.equal(evidence.filter((row) => row.playerId === 'a-9').reduce((sum, row) => sum + row.minutes, 0) <= 60, true, 'I) los minutos posicionales del saliente no superan sus minutos oficiales');
assert.equal(evidence.filter((row) => row.playerId === 'sub-9').reduce((sum, row) => sum + row.minutes, 0) <= 30, true, 'I) los minutos posicionales del entrante no superan sus minutos oficiales');

const swapped = lineup('a');
[swapped[7], swapped[9]] = [{ ...swapped[9], slot: 7 }, { ...swapped[7], slot: 9 }];
const positionalChange = buildTacticalSnapshotIntervals({
  duration: 63,
  initialSnapshot: initial,
  snapshots: [{ id: 'swap-45', matchId: 'match-1', minute: 45, system: '4-2-3-1', isComplete: true, reason: 'Cambio posicional', slots: swapped }],
  initialSystem: '4-2-3-1',
});
const positionEvidence = buildTacticalSlotEvidenceFromIntervals({ intervals: positionalChange, resolveSlot });
assert.deepEqual(positionEvidence.filter((row) => row.playerId === 'a-7').map((row) => [row.slot.id, row.minutes]), [['MPI', 45], ['MPD', 18]], 'F) un jugador acumula minutos separados en dos slots');

const combinations = buildTacticalCombinationsFromIntervals({
  intervals: changed,
  resolveSlot,
  getSlotsForSystem: (system) => systems[system],
});
assert.equal(combinations.find((row) => row.system === '4-2-3-1' && row.groupName === 'Doble pivote').minutes, 63);
assert.equal(combinations.find((row) => row.system === '4-3-3' && row.groupName === 'Trío de centrocampistas').minutes, 27);
assert.equal(combinations.find((row) => row.system === '4-3-3' && row.groupName === 'Tridente ofensivo').minutes, 27, 'combinaciones usan los mismos intervalos y slots');

const incompleteHistory = buildTacticalSnapshotIntervals({
  duration: 90,
  initialSnapshot: initial,
  initialSystem: '4-2-3-1',
  systemEvents: [{ id: 'missing-63', minute: 63, toSystem: '4-3-3' }],
});
assert.deepEqual(incompleteHistory.map(({ minutes, isComplete, system }) => [minutes, isComplete, system]), [[63, true, '4-2-3-1'], [27, false, '4-3-3']], 'H) un cambio de sistema sin sustitución cierra el intervalo anterior y marca el nuevo como incompleto');
assert.equal(buildTacticalSlotEvidenceFromIntervals({ intervals: incompleteHistory, resolveSlot }).some((row) => row.system === '4-3-3'), false, 'el tramo incompleto no inventa jugadores');

const missingSubstitution = buildTacticalSnapshotIntervals({ duration: 90, initialSnapshot: initial, initialSystem: '4-2-3-1', substitutionMinutes: [63] });
assert.deepEqual(missingSubstitution.map(({ minutes, isComplete }) => [minutes, isComplete]), [[63, true], [27, false]], 'una sustitución histórica sin foto no contamina el tramo posterior');

const invalidMinuteHistory = buildTacticalSnapshotIntervals({
  duration: 90,
  initialSnapshot: initial,
  initialSystem: '4-2-3-1',
  systemEvents: [{ id: 'missing-minute', minute: null, toSystem: '4-3-3' }],
  substitutionMinutes: [undefined, 'Sin minuto'],
});
assert.deepEqual(invalidMinuteHistory.map(({ fromMinute, toMinute, system, isComplete }) => [fromMinute, toMinute, system, isComplete]), [
  [0, 90, '4-2-3-1', true],
], 'minutos nulos o inválidos no rompen ni alteran el historial completo');

const partialPersisted = buildTacticalSnapshotIntervals({
  duration: 90,
  initialSnapshot: initial,
  initialSystem: '4-2-3-1',
  snapshots: [{ id: 'partial-71', matchId: 'match-1', minute: 71, system: '4-2-3-1', isComplete: true, slots: lineup('partial').slice(0, 10) }],
});
assert.equal(partialPersisted[1].isComplete, false, 'G) una marca is_complete no oculta que faltan slots');

const historicalBeforeAudit = JSON.stringify(missingSubstitution);
const seasonCoverage = buildSeasonTacticalCoverageAudit([{
  matchId: 'match-1',
  label: 'Partido histórico',
  history: {
    intervals: missingSubstitution,
    invariant: getTacticalTimelineInvariantReport({ intervals: missingSubstitution, duration: 90 }),
  },
}]);
assert.equal(seasonCoverage.percentage, 70, 'I) la auditoría detecta 63 de 90 minutos completos sin rellenar el hueco');
assert.equal(seasonCoverage.pendingIntervals, 1);
assert.equal(seasonCoverage.matches[0].pendingIntervals[0].issueType, 'substitution_without_snapshot');
assert.equal(JSON.stringify(missingSubstitution), historicalBeforeAudit, 'I) auditar un partido histórico no modifica sus snapshots');

const borjaLikeIncomplete = buildTacticalMatchHistory({
  matchId: 'historical-71',
  duration: 90,
  initialSystem: '4-3-3',
  initialSlots: lineup('a'),
  substitutionMinutes: [71],
  snapshots: [{ id: 'snap-84', matchId: 'historical-71', minute: 84, system: '4-3-3', isComplete: true, slots: lineup('c') }],
});
assert.equal(borjaLikeIncomplete.invariant.incompleteMinutes, 13, 'C) una sustitución sin confirmar deja visible exactamente el tramo incompleto');
const borjaLikeCompleted = buildTacticalMatchHistory({
  matchId: 'historical-71',
  duration: 90,
  initialSystem: '4-3-3',
  initialSlots: lineup('a'),
  substitutionMinutes: [71],
  snapshots: [
    { id: 'snap-71', matchId: 'historical-71', minute: 71, system: '4-3-3', isComplete: true, slots: lineup('b') },
    { id: 'snap-84', matchId: 'historical-71', minute: 84, system: '4-3-3', isComplete: true, slots: lineup('c') },
  ],
});
assert.equal(borjaLikeCompleted.invariant.incompleteMinutes, 0, 'D) completar la disposición histórica elimina los minutos desconocidos desde el origen');

console.log('tacticalSnapshots tests passed');
