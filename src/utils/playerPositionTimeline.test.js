import assert from 'node:assert/strict';

import { getPlayerPositionUsage } from './playerPositionUsage.js';
import { buildTacticalMatchHistory } from './tacticalSnapshots.js';

const PLAYER = { playerId: 'player-target', playerName: 'Jugador Objetivo' };
const lineup = ({ targetId = PLAYER.playerId, targetName = PLAYER.playerName, targetSlot = 7, position = '' } = {}) => Array.from({ length: 11 }, (_, slot) => ({
  slot,
  playerId: slot === targetSlot ? targetId : `player-${slot}`,
  playerName: slot === targetSlot ? targetName : `Jugador ${slot}`,
  ...(slot === targetSlot && position ? { position } : {}),
}));
const withReplacement = (source, { outId = PLAYER.playerId, inId = 'player-in', inName = 'Jugador Entrante' } = {}) => source.map((slot) => (
  slot.playerId === outId ? { ...slot, playerId: inId, playerName: inName } : { ...slot }
));
const moveTarget = (source, targetSlot, extra = {}) => {
  const next = source.map((slot) => ({ ...slot }));
  const oldTargetSlot = next.findIndex((slot) => slot.playerId === PLAYER.playerId);
  const displaced = next[targetSlot];
  next[targetSlot] = { slot: targetSlot, playerId: PLAYER.playerId, playerName: PLAYER.playerName, ...extra };
  next[oldTargetSlot] = { ...displaced, slot: oldTargetSlot };
  return next;
};
const replacementStats = (minute) => ({
  TitularSaliente: { role: 'Titular', minutes: minute, replacementName: PLAYER.playerName, jugadorId: 'player-out' },
  [PLAYER.playerName]: { role: 'Suplente', minutes: 90 - minute, replacementName: '', jugadorId: PLAYER.playerId },
});
const matchRow = ({
  minutes = 90,
  role = 'Titular',
  duration = 90,
  initialSystem = '4-2-3-1',
  initialSlots = lineup(),
  snapshots = [],
  systemEvents = [],
  substitutionMinutes = [],
  playerStats = {},
  matchId = 'match-1',
} = {}) => {
  const history = buildTacticalMatchHistory({ matchId, duration, initialSystem, initialSlots, snapshots, systemEvents, substitutionMinutes, playerStats });
  return {
    matchId,
    minutes,
    role,
    duration,
    initialSystem,
    initialSlots,
    intervals: history.intervals,
    playerStats,
    matchMetadata: { opponent: 'Rival de prueba', date: '2026-09-20', competition: 'Liga', venue: 'Local', result: '2-1' },
  };
};
const usage = (row, identity = PLAYER) => getPlayerPositionUsage({ ...identity, matchRows: [row] });
const compact = (result) => result.matches[0].segments.map(({ fromMinute, toMinute, system, position, identified }) => [fromMinute, toMinute, system, position, identified]);

// A) Posición inicial inequívoca sin boundaries: conserva los 90 minutos.
const initialOnly = usage({ ...matchRow(), intervals: [] });
assert.deepEqual(initialOnly.positions.map(({ position, minutes }) => [position, minutes]), [['Extremo derecho', 90]]);
assert.equal(initialOnly.unknownMinutes, 0);

// B/K) El primer cambio cierra la evidencia inicial aunque la nueva posición sea desconocida.
const missingAfterChange = usage(matchRow({
  initialSlots: lineup().slice(0, 8),
  systemEvents: [{ id: 'system-70', minute: 70, toSystem: '4-4-2' }],
}));
assert.deepEqual(compact(missingAfterChange), [
  [0, 70, '4-2-3-1', 'Extremo derecho', true],
  [70, 90, '4-4-2', '', false],
]);
assert.equal(missingAfterChange.unknownMinutes, 20);

// C) Cambio de sistema con snapshot completo: dos posiciones y dos sistemas exactos.
const reliableChange = usage(matchRow({
  systemEvents: [{ id: 'system-70', minute: 70, toSystem: '4-4-2' }],
  snapshots: [{ id: 'snapshot-70', minute: 70, system: '4-4-2', isComplete: true, slots: moveTarget(lineup(), 6) }],
}));
assert.deepEqual(compact(reliableChange), [
  [0, 70, '4-2-3-1', 'Extremo derecho', true],
  [70, 90, '4-4-2', 'Interior derecho', true],
]);

// D) El saliente termina en el 60 y nunca consume el sistema del minuto 70.
const initialD = lineup();
const at60D = withReplacement(initialD);
const outgoingStats = {
  [PLAYER.playerName]: { role: 'Titular', minutes: 60, replacementName: 'Jugador Entrante', jugadorId: PLAYER.playerId },
  'Jugador Entrante': { role: 'Suplente', minutes: 30, replacementName: '', jugadorId: 'player-in' },
};
const outgoing = usage(matchRow({
  minutes: 60,
  initialSlots: initialD,
  playerStats: outgoingStats,
  substitutionMinutes: [60],
  systemEvents: [{ id: 'system-70', minute: 70, toSystem: '4-4-2' }],
  snapshots: [
    { id: 'snapshot-60', minute: 60, system: '4-2-3-1', isComplete: true, slots: at60D },
    { id: 'snapshot-70', minute: 70, system: '4-4-2', isComplete: true, slots: at60D },
  ],
}));
assert.deepEqual(compact(outgoing), [[0, 60, '4-2-3-1', 'Extremo derecho', true]]);

// E) El entrante suma exclusivamente 60-70 y 70-final.
const initialE = lineup({ targetId: 'player-out', targetName: 'TitularSaliente' });
const at60E = withReplacement(initialE, { outId: 'player-out', inId: PLAYER.playerId, inName: PLAYER.playerName });
const at70E = moveTarget(at60E, 6);
const incoming = usage(matchRow({
  minutes: 30,
  role: 'Suplente',
  initialSlots: initialE,
  playerStats: replacementStats(60),
  substitutionMinutes: [60],
  systemEvents: [{ id: 'system-70', minute: 70, toSystem: '4-4-2' }],
  snapshots: [
    { id: 'snapshot-60', minute: 60, system: '4-2-3-1', isComplete: true, slots: at60E },
    { id: 'snapshot-70', minute: 70, system: '4-4-2', isComplete: true, slots: at70E },
  ],
}));
assert.deepEqual(compact(incoming), [
  [60, 70, '4-2-3-1', 'Extremo derecho', true],
  [70, 90, '4-4-2', 'Interior derecho', true],
]);

// F) Sustitución + sistema en el mismo minuto: el saliente no está y el entrante sí.
const initialF = lineup({ targetId: 'player-out', targetName: 'TitularSaliente' });
const finalF = moveTarget(withReplacement(initialF, { outId: 'player-out', inId: PLAYER.playerId, inName: PLAYER.playerName }), 6);
const incomingSameMinute = usage(matchRow({
  minutes: 20,
  role: 'Suplente',
  initialSlots: initialF,
  playerStats: replacementStats(70),
  substitutionMinutes: [70],
  systemEvents: [{ id: 'system-70', minute: 70, toSystem: '4-4-2' }],
  snapshots: [{ id: 'snapshot-70', minute: 70, system: '4-4-2', isComplete: true, slots: finalF }],
}));
assert.deepEqual(compact(incomingSameMinute), [[70, 90, '4-4-2', 'Interior derecho', true]]);
const outgoingSameMinute = usage(matchRow({
  minutes: 70,
  initialSlots: initialF,
  playerStats: replacementStats(70),
  substitutionMinutes: [70],
  systemEvents: [{ id: 'system-70', minute: 70, toSystem: '4-4-2' }],
  snapshots: [{ id: 'snapshot-70', minute: 70, system: '4-4-2', isComplete: true, slots: finalF }],
}), { playerId: 'player-out', playerName: 'TitularSaliente' });
assert.equal(outgoingSameMinute.segments.some((segment) => segment.fromMinute >= 70), false);

// G) Cuatro sistemas producen cuatro tramos independientes.
const systemChanges = [
  { minute: 55, system: '4-3-3', slot: 8 },
  { minute: 72, system: '4-4-2', slot: 6 },
  { minute: 84, system: '4-2-3-1', slot: 8 },
];
const multiple = usage(matchRow({
  initialSlots: lineup({ targetSlot: 8 }),
  systemEvents: systemChanges.map(({ minute, system }, index) => ({ id: `system-${index}`, minute, toSystem: system })),
  snapshots: systemChanges.map(({ minute, system, slot }, index) => ({ id: `snapshot-${index}`, minute, system, isComplete: true, slots: moveTarget(lineup({ targetSlot: 8 }), slot) })),
}));
assert.deepEqual(multiple.matches[0].segments.map(({ fromMinute, toMinute, system }) => [fromMinute, toMinute, system]), [
  [0, 55, '4-2-3-1'], [55, 72, '4-3-3'], [72, 84, '4-4-2'], [84, 90, '4-2-3-1'],
]);

// H) Volver a MP agrega 60 minutos, pero conserva los tres tramos.
const returnToPrevious = usage(matchRow({
  initialSlots: lineup({ targetSlot: 8 }),
  systemEvents: [
    { id: 'system-30', minute: 30, toSystem: '4-3-3' },
    { id: 'system-60', minute: 60, toSystem: '4-2-3-1' },
  ],
  snapshots: [
    { id: 'snapshot-30', minute: 30, system: '4-3-3', isComplete: true, slots: lineup({ targetSlot: 8 }) },
    { id: 'snapshot-60', minute: 60, system: '4-2-3-1', isComplete: true, slots: lineup({ targetSlot: 8 }) },
  ],
}));
assert.deepEqual(returnToPrevious.positions.map(({ position, minutes }) => [position, minutes]), [['Mediapunta', 60], ['Extremo derecho', 30]]);
assert.equal(returnToPrevious.matches[0].segments.length, 3);

// I) La misma posición bajo sistemas diferentes conserva dos tramos.
const samePositionTwoSystems = usage(matchRow({
  initialSlots: lineup({ targetSlot: 8, position: 'Mediapunta' }),
  systemEvents: [{ id: 'system-60', minute: 60, toSystem: '4-3-3' }],
  snapshots: [{ id: 'snapshot-60', minute: 60, system: '4-3-3', isComplete: true, slots: lineup({ targetSlot: 8, position: 'Mediapunta' }) }],
}));
assert.deepEqual(samePositionTwoSystems.positions.map(({ position, minutes }) => [position, minutes]), [['Mediapunta', 90]]);
assert.deepEqual(samePositionTwoSystems.matches[0].segments.map(({ system, minutes }) => [system, minutes]), [['4-2-3-1', 60], ['4-3-3', 30]]);

// J) Un snapshot incompleto nunca aporta una posición inventada.
const incomplete = usage(matchRow({
  systemEvents: [{ id: 'system-70', minute: 70, toSystem: '4-4-2' }],
  snapshots: [{ id: 'snapshot-70', minute: 70, system: '4-4-2', isComplete: false, slots: lineup().slice(0, 10) }],
}));
assert.equal(incomplete.matches[0].segments[1].identified, false);

// L) Una posición explícita puede conocerse aunque el sistema no esté disponible.
const knownPositionUnknownSystem = usage({
  ...matchRow({ initialSystem: '', initialSlots: lineup({ position: 'Mediapunta' }) }),
  intervals: [],
});
assert.deepEqual(compact(knownPositionUnknownSystem), [[0, 90, '', 'Mediapunta', true]]);

// N) Sustitución sin cambio de sistema: el entrante hereda únicamente el slot táctico inequívoco.
const initialN = lineup({ targetId: 'player-a', targetName: 'Jugador A', targetSlot: 7 });
const statsN = {
  'Jugador A': { role: 'Titular', minutes: 63, replacementName: PLAYER.playerName, jugadorId: 'player-a' },
  [PLAYER.playerName]: { role: 'Suplente', minutes: 27, replacementName: '', jugadorId: PLAYER.playerId },
};
const incomingN = usage(matchRow({
  minutes: 27, role: 'Suplente', initialSlots: initialN, playerStats: statsN, substitutionMinutes: [63],
}));
assert.deepEqual(compact(incomingN), [[63, 90, '4-2-3-1', 'Extremo derecho', true]]);
assert.equal(incomingN.matches[0].segments[0].intervalSource, 'inferred_substitution');
assert.deepEqual(incomingN.reconstructionAudit.map(({ fromMinute, toMinute, evidence }) => [fromMinute, toMinute, evidence]), [[63, 90, 'same_system_direct_replacement_slot']]);
const outgoingN = usage(matchRow({
  minutes: 63, initialSlots: initialN, playerStats: statsN, substitutionMinutes: [63],
}), { playerId: 'player-a', playerName: 'Jugador A' });
assert.deepEqual(compact(outgoingN), [[0, 63, '4-2-3-1', 'Extremo derecho', true]]);

// O) Los otros diez jugadores conservan sus slots cuando la única evidencia es una sustitución directa.
const remainingO = usage(matchRow({
  initialSlots: initialN, playerStats: statsN, substitutionMinutes: [63],
}), { playerId: 'player-8', playerName: 'Jugador 8' });
assert.deepEqual(remainingO.positions.map(({ position, minutes }) => [position, minutes]), [['Mediapunta', 90]]);
assert.equal(remainingO.unknownMinutes, 0);

// P) Un snapshot explícito posterior manda sobre la continuidad automática.
const at63N = withReplacement(initialN, { outId: 'player-a', inId: PLAYER.playerId, inName: PLAYER.playerName });
const explicitP = usage(matchRow({
  minutes: 27,
  role: 'Suplente',
  initialSlots: initialN,
  playerStats: statsN,
  substitutionMinutes: [63],
  snapshots: [{ id: 'snapshot-63', minute: 63, system: '4-2-3-1', isComplete: true, slots: moveTarget(at63N, 8) }],
}));
assert.deepEqual(compact(explicitP), [[63, 90, '4-2-3-1', 'Mediapunta', true]]);

// Q) Si el saliente no ocupa un slot inequívoco en la foto previa, no se infiere.
const ambiguousQStats = {
  'Jugador ausente': { role: 'Titular', minutes: 63, replacementName: PLAYER.playerName, jugadorId: 'absent-player' },
  [PLAYER.playerName]: { role: 'Suplente', minutes: 27, replacementName: '', jugadorId: PLAYER.playerId },
};
const ambiguousQ = usage(matchRow({
  minutes: 27, role: 'Suplente', initialSlots: lineup({ targetId: 'someone-else', targetName: 'Otro jugador', targetSlot: 9 }), playerStats: ambiguousQStats, substitutionMinutes: [63],
}));
assert.deepEqual(compact(ambiguousQ), [[63, 90, '4-2-3-1', '', false]]);

// R) Sustitución y cambio de sistema en el mismo minuto: no hereda el slot antiguo.
const sameMinuteR = usage(matchRow({
  minutes: 27,
  role: 'Suplente',
  initialSlots: initialN,
  playerStats: statsN,
  substitutionMinutes: [63],
  systemEvents: [{ id: 'system-63', minute: 63, toSystem: '4-4-2' }],
}));
assert.deepEqual(compact(sameMinuteR), [[63, 90, '4-4-2', '', false]]);

// S) La continuidad segura termina en el cambio de sistema posterior.
const laterSystemS = usage(matchRow({
  minutes: 27,
  role: 'Suplente',
  initialSlots: initialN,
  playerStats: statsN,
  substitutionMinutes: [63],
  systemEvents: [{ id: 'system-70', minute: 70, toSystem: '4-4-2' }],
}));
assert.deepEqual(compact(laterSystemS), [
  [63, 70, '4-2-3-1', 'Extremo derecho', true],
  [70, 90, '4-4-2', '', false],
]);

// T) Dos sustituciones simultáneas solo se resuelven si ambos pares son directos y únicos.
const initialT = initialN.map((row) => row.slot === 10 ? { ...row, playerId: 'player-d', playerName: 'Jugador D' } : row);
const statsT = {
  ...statsN,
  'Jugador D': { role: 'Titular', minutes: 63, replacementName: 'Jugador C', jugadorId: 'player-d' },
  'Jugador C': { role: 'Suplente', minutes: 27, replacementName: '', jugadorId: 'player-c' },
};
const simultaneousT = usage(matchRow({
  minutes: 27, role: 'Suplente', initialSlots: initialT, playerStats: statsT, substitutionMinutes: [63],
}));
assert.deepEqual(compact(simultaneousT), [[63, 90, '4-2-3-1', 'Extremo derecho', true]]);

// M) La cobertura temporal y la suma oficial son invariantes públicas distintas.
for (const result of [initialOnly, missingAfterChange, reliableChange, outgoing, incoming, incomingSameMinute, multiple, returnToPrevious, samePositionTwoSystems, incomplete, knownPositionUnknownSystem, incomingN, outgoingN, remainingO, explicitP, ambiguousQ, sameMinuteR, laterSystemS, simultaneousT]) {
  assert.equal(result.identifiedMinutes + result.unidentifiedMinutes, result.totalMinutes);
  assert.equal(result.quality.arithmeticValid, true);
  assert.equal(result.quality.temporalCoverageValid, true);
  assert.equal(result.valid, true);
}

console.log('player position timeline tests passed');
