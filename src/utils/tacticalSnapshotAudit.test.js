import assert from 'node:assert/strict';
import { getPlayerPositionUsage } from './playerPositionUsage.js';
import {
  auditTacticalMatchSnapshots,
  auditTacticalSeasonSnapshots,
  buildTacticalMatchHistory,
  getHistoricalSubstitutionMinutes,
} from './tacticalSnapshots.js';

const player = (slot, playerId = `p${slot}`, playerName = `Jugador ${slot}`) => ({ slot, playerId, playerName });
const initialSlots = Array.from({ length: 11 }, (_, slot) => player(slot));
const stats = Object.fromEntries(initialSlots.map((row) => [row.playerName, {
  jugadorId: row.playerId, role: 'Titular', minutes: 90, replacementName: '',
}]));
stats['Jugador 9'] = { jugadorId: 'p9', role: 'Titular', minutes: 78, replacementName: 'Daniel Palacio' };
stats['Daniel Palacio'] = { jugadorId: 'dani-current', role: 'Suplente', minutes: 12, replacementName: '' };
const identities = [{ id: 'dani-current', aliasIds: ['dani-legacy'], name: 'Daniel Palacio' }];
const at65 = initialSlots.map((row) => {
  if (row.slot === 5) return player(5, 'p9', 'Jugador 9');
  if (row.slot === 9) return player(9, 'p5', 'Jugador 5');
  return { ...row };
});
const correctAt78 = at65.map((row) => row.playerId === 'p9' ? player(row.slot, 'dani-current', 'Daniel Palacio') : { ...row });
const snapshot = (id, minute, slots, system = '4-4-2') => ({ id, minute, system, isComplete: true, source: 'persisted', slots });
const baseAudit = (snapshots, extra = {}) => auditTacticalMatchSnapshots({
  matchId: 'ceares', initialSystem: '4-2-3-1', initialSlots, snapshots,
  systemEvents: [{ id: 'system-65', minute: 65, toSystem: '4-4-2' }],
  substitutionMinutes: [78], playerStats: stats, playerIdentities: identities, ...extra,
});

// A) ID legacy explícitamente relacionado: el snapshot correcto es coherente sin reparación.
const legacyAt78 = correctAt78.map((row) => row.playerId === 'dani-current' ? { ...row, playerId: 'dani-legacy' } : row);
const legacyAudit = baseAudit([snapshot('legacy-78', 78, legacyAt78)]);
assert.equal(legacyAudit.details[0].temporallyConsistent, true);
assert.equal(legacyAudit.details[0].repairedInMemory, undefined);

// B) Nombre correcto con ID contradictorio: no se equipara automáticamente.
const conflictingAt78 = correctAt78.map((row) => row.playerId === 'dani-current' ? { ...row, playerId: 'other-dani' } : row);
const conflictAudit = baseAudit([snapshot('conflict-78', 78, conflictingAt78)]);
assert.equal(conflictAudit.details[0].temporallyConsistent, false);
assert.equal(conflictAudit.identityConflicts.length, 1);
assert.equal(conflictAudit.snapshots[0].isComplete, false);

// C) Snapshot histórico conserva al saliente: reparación derivada A→B en el mismo slot.
const staleAudit = baseAudit([snapshot('stale-78', 78, at65)]);
assert.equal(staleAudit.repairedSnapshots, 1);
assert.equal(staleAudit.details[0].temporallyConsistent, true);
assert.equal(staleAudit.snapshots[0].derivedTemporalRepair, true);
assert.equal(staleAudit.snapshots[0].slots.find((row) => row.slot === 5).playerId, 'dani-current');

// D) Snapshot correcto: Dani está y Cárcaba ya no está.
const correctAudit = baseAudit([snapshot('correct-78', 78, correctAt78)]);
assert.equal(correctAudit.temporallyConsistentSnapshots, 1);
assert.equal(correctAudit.repairedSnapshots, 0);

// Fixture equivalente a Dani: la vista corregida en memoria llega a playerPositionUsage.
const history = buildTacticalMatchHistory({
  matchId: 'ceares', duration: 90, initialSystem: '4-2-3-1', initialSlots,
  snapshots: [snapshot('system-65', 65, at65), snapshot('stale-78', 78, at65)],
  systemEvents: [{ id: 'system-65', minute: 65, toSystem: '4-4-2' }],
  substitutionMinutes: getHistoricalSubstitutionMinutes(stats), playerStats: stats, playerIdentities: identities,
});
const daniUsage = getPlayerPositionUsage({
  playerId: 'dani-current', playerName: 'Daniel Palacio', playerIdentity: identities[0], playerIdentities: identities,
  matchRows: [{
    matchId: 'ceares', minutes: 12, role: 'Suplente', duration: 90, initialSystem: '4-2-3-1', initialSlots,
    intervals: history.intervals, playerStats: stats,
  }],
});
assert.deepEqual(daniUsage.positions.map(({ position, minutes }) => [position, minutes]), [['Extremo derecho', 12]]);
assert.equal(daniUsage.unknownMinutes, 0);

// Dos sustituciones simultáneas se reparan solo cuando ambos pares son directos.
const simultaneousStats = {
  ...stats,
  'Jugador 8': { jugadorId: 'p8', role: 'Titular', minutes: 78, replacementName: 'Entrante 8' },
  'Entrante 8': { jugadorId: 'sub8', role: 'Suplente', minutes: 12, replacementName: '' },
};
const simultaneous = auditTacticalMatchSnapshots({
  matchId: 'two-subs', initialSystem: '4-4-2', initialSlots, snapshots: [snapshot('two-78', 78, initialSlots)],
  substitutionMinutes: [78], playerStats: simultaneousStats,
});
assert.equal(simultaneous.repairedSnapshots, 1);
assert.equal(simultaneous.snapshots[0].slots.some((row) => row.playerId === 'dani-current'), true);
assert.equal(simultaneous.snapshots[0].slots.some((row) => row.playerId === 'sub8'), true);

// Si una sustitución simultánea ya estaba bien y otra quedó obsoleta, solo se repara la obsoleta.
const partiallyUpdated = initialSlots.map((row) => row.playerId === 'p8'
  ? { ...row, playerId: 'sub8', playerName: 'Entrante 8' }
  : row);
const partialSimultaneous = auditTacticalMatchSnapshots({
  matchId: 'partial-two-subs', initialSystem: '4-4-2', initialSlots,
  snapshots: [snapshot('partial-two-78', 78, partiallyUpdated)],
  substitutionMinutes: [78], playerStats: simultaneousStats,
});
assert.equal(partialSimultaneous.repairedSnapshots, 1);
assert.equal(partialSimultaneous.snapshots[0].slots.some((row) => row.playerId === 'dani-current'), true);
assert.equal(partialSimultaneous.snapshots[0].slots.some((row) => row.playerId === 'sub8'), true);

// Tres sustituciones en minutos distintos producen tres estados temporalmente coherentes.
const threeStats = {
  ...Object.fromEntries(initialSlots.map((row) => [row.playerName, { jugadorId: row.playerId, role: 'Titular', minutes: 90, replacementName: '' }])),
  'Jugador 7': { jugadorId: 'p7', role: 'Titular', minutes: 60, replacementName: 'Sub 7' },
  'Sub 7': { jugadorId: 'sub7', role: 'Suplente', minutes: 30, replacementName: '' },
  'Jugador 8': { jugadorId: 'p8', role: 'Titular', minutes: 70, replacementName: 'Sub 8' },
  'Sub 8': { jugadorId: 'sub8', role: 'Suplente', minutes: 20, replacementName: '' },
  'Jugador 9': { jugadorId: 'p9', role: 'Titular', minutes: 80, replacementName: 'Sub 9' },
  'Sub 9': { jugadorId: 'sub9', role: 'Suplente', minutes: 10, replacementName: '' },
};
const after60 = initialSlots.map((row) => row.playerId === 'p7' ? { ...row, playerId: 'sub7', playerName: 'Sub 7' } : row);
const after70 = after60.map((row) => row.playerId === 'p8' ? { ...row, playerId: 'sub8', playerName: 'Sub 8' } : row);
const threeAudit = auditTacticalMatchSnapshots({
  matchId: 'three-subs', initialSystem: '4-4-2', initialSlots, playerStats: threeStats, substitutionMinutes: [60, 70, 80],
  snapshots: [snapshot('s60', 60, initialSlots), snapshot('s70', 70, after60), snapshot('s80', 80, after70)],
});
assert.equal(threeAudit.repairedSnapshots, 3);
assert.equal(threeAudit.temporallyConsistentSnapshots, 3);

// Cambio de sistema sin sustitución conserva el mismo XI; con sustitución simultánea no repara slots antiguos.
const systemOnly = auditTacticalMatchSnapshots({
  matchId: 'system-only', initialSystem: '4-2-3-1', initialSlots, playerStats: {}, substitutionMinutes: [],
  systemEvents: [{ minute: 65, toSystem: '4-4-2' }], snapshots: [snapshot('system', 65, initialSlots)],
});
assert.equal(systemOnly.temporallyConsistentSnapshots, 1);
const sameMinuteChange = baseAudit([snapshot('same-minute', 78, at65)], {
  initialSystem: '4-4-2', systemEvents: [{ minute: 78, toSystem: '4-3-3' }],
});
assert.equal(sameMinuteChange.repairedSnapshots, 0);
assert.equal(sameMinuteChange.snapshots[0].isComplete, false);
const explicitSameMinuteChange = baseAudit([snapshot('same-minute-explicit', 78, correctAt78, '4-3-3')], {
  initialSystem: '4-4-2', systemEvents: [{ minute: 78, toSystem: '4-3-3' }],
});
assert.equal(explicitSameMinuteChange.repairedSnapshots, 0);
assert.equal(explicitSameMinuteChange.snapshots[0].isComplete, true, 'la disposición explícita correcta del nuevo sistema tiene prioridad');

// La completitud estructural exige once slots distintos y once jugadores distintos.
const duplicateSlotRows = initialSlots.map((row) => ({ ...row }));
duplicateSlotRows[10].slot = 9;
const duplicateSlotAudit = auditTacticalMatchSnapshots({
  initialSystem: '4-4-2', initialSlots, snapshots: [snapshot('duplicate-slot', 0, duplicateSlotRows)], playerStats: {},
});
assert.equal(duplicateSlotAudit.details[0].structuralComplete, false);
assert.deepEqual(duplicateSlotAudit.details[0].duplicateSlots, [9]);

const duplicatePlayerRows = initialSlots.map((row) => ({ ...row }));
duplicatePlayerRows[10] = { ...duplicatePlayerRows[10], playerId: 'p9', playerName: 'Jugador 9' };
const duplicatePlayerAudit = auditTacticalMatchSnapshots({
  initialSystem: '4-4-2', initialSlots, snapshots: [snapshot('duplicate-player', 0, duplicatePlayerRows)], playerStats: {},
});
assert.equal(duplicatePlayerAudit.details[0].structuralComplete, false);
assert.equal(duplicatePlayerAudit.details[0].duplicatePlayers.length, 1);

// Once registros estructurales pueden seguir siendo el XI equivocado y no se reparan sin sustitución demostrable.
const wrongXi = initialSlots.map((row) => row.playerId === 'p9' ? { ...row, playerId: 'outsider', playerName: 'Ajeno' } : row);
const wrongXiAudit = auditTacticalMatchSnapshots({
  matchId: 'wrong-xi', initialSystem: '4-4-2', initialSlots, snapshots: [snapshot('wrong', 30, wrongXi)], playerStats: {},
});
assert.equal(wrongXiAudit.details[0].structuralComplete, true);
assert.equal(wrongXiAudit.details[0].temporallyConsistent, false);
assert.equal(wrongXiAudit.repairedSnapshots, 0);
assert.equal(wrongXiAudit.missingExpectedPlayers.length, 1);
assert.equal(wrongXiAudit.unexpectedPlayers.length, 1);

// La utilidad de temporada agrega diagnósticos conservando el partido de origen.
const seasonAudit = auditTacticalSeasonSnapshots([
  {
    matchId: 'correct-match', initialSystem: '4-4-2', initialSlots,
    snapshots: [snapshot('correct-season', 0, initialSlots)], playerStats: {},
  },
  {
    matchId: 'wrong-match', initialSystem: '4-4-2', initialSlots,
    tacticalSnapshots: [snapshot('wrong-season', 30, wrongXi)], statsPlayerData: {},
  },
]);
assert.equal(seasonAudit.totalMatches, 2);
assert.equal(seasonAudit.totalSnapshots, 2);
assert.equal(seasonAudit.temporallyConsistentSnapshots, 1);
assert.equal(seasonAudit.temporallyInconsistentSnapshots, 1);
assert.equal(seasonAudit.missingExpectedPlayers[0].matchId, 'wrong-match');

// La foto inicial tampoco puede declararse completa con once filas y solo diez slots únicos.
const historyWithDuplicateInitialSlot = buildTacticalMatchHistory({
  matchId: 'invalid-initial', duration: 90, initialSystem: '4-4-2', initialSlots: duplicateSlotRows,
});
assert.equal(historyWithDuplicateInitialSlot.initialSnapshot.isComplete, false);
assert.equal(historyWithDuplicateInitialSlot.intervals[0].isComplete, false);

console.log('tactical snapshot audit tests passed');
