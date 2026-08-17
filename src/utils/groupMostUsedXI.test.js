import assert from 'node:assert/strict';
import {
  buildInitialSlotEvidence,
  buildMostUsedXiFromEvidence,
  compareSystemUsageRows,
  getMostUsedXiMetric,
  resolveStoredTacticalSlot,
} from './groupMostUsedXI.js';

const slots = [
  { id: 'POR', label: 'POR', x: 50, y: 89 },
  { id: 'LD', label: 'LD', x: 82, y: 73 },
  { id: 'DFC_D', label: 'DFC derecho', x: 61, y: 73 },
  { id: 'DFC_I', label: 'DFC izquierdo', x: 39, y: 73 },
  { id: 'LI', label: 'LI', x: 18, y: 73 },
  { id: 'MCD_D', label: 'Pivote derecho', x: 61, y: 52 },
  { id: 'MCD_I', label: 'Pivote izquierdo', x: 39, y: 52 },
  { id: 'MPD', label: 'MPD', x: 82, y: 32 },
  { id: 'MPC', label: 'MPC', x: 50, y: 32 },
  { id: 'MPI', label: 'MPI', x: 18, y: 32 },
  { id: 'DC', label: 'DC', x: 50, y: 14 },
];
const player = (id, name, genericPosition = '') => ({ id, name, position: genericPosition });
const evidence = ({ matchId, slotId, item, minutes, starts = 1, system = '4-2-3-1' }) => ({
  matchId,
  system,
  slot: slots.find((slot) => slot.id === slotId),
  player: item,
  playerId: item.id,
  playerName: item.name,
  playerKey: `id:${item.id}`,
  minutes,
  minutesKnown: minutes !== null,
  starts,
});

const midfielderUsedAtRightBack = player('a', 'Jugador A', 'Mediocentro');
assert.equal(resolveStoredTacticalSlot({
  storedSlot: { x: 39, y: 52 },
  targetSlots: slots,
  normalizedId: 'MCD_D',
  slotIndex: 5,
}).id, 'MCD_I', 'el slot persistido izquierdo prevalece sobre el índice genérico derecho');
const rightBackEvidence = ['m1', 'm2', 'm3'].map((matchId) => evidence({ matchId, slotId: 'LD', item: midfielderUsedAtRightBack, minutes: 90 }));
assert.equal(
  buildMostUsedXiFromEvidence({ system: '4-2-3-1', slots, evidence: rightBackEvidence }).assignments.find((row) => row.slot.id === 'LD').row.player.id,
  'a',
  'A: manda el slot real y no la posición genérica de Plantilla',
);

const centralOne = player('c1', 'Central Uno');
const centralTwo = player('c2', 'Central Dos');
const centralXi = buildMostUsedXiFromEvidence({
  system: '4-2-3-1',
  slots,
  evidence: [
    evidence({ matchId: 'm1', slotId: 'DFC_D', item: centralOne, minutes: 70 }),
    evidence({ matchId: 'm2', slotId: 'DFC_D', item: centralOne, minutes: 70 }),
    evidence({ matchId: 'm1', slotId: 'DFC_D', item: centralTwo, minutes: 90 }),
  ],
});
assert.equal(centralXi.assignments.find((row) => row.slot.id === 'DFC_D').row.player.id, 'c1', 'B: gana quien acumula más minutos reales en el slot');

const versatile = player('poly', 'Polivalente');
const nextAttackingMidfielder = player('mco-next', 'Siguiente MCO');
const versatileXi = buildMostUsedXiFromEvidence({
  system: '4-2-3-1',
  slots,
  evidence: [
    evidence({ matchId: 'm1', slotId: 'MCD_D', item: versatile, minutes: 60 }),
    evidence({ matchId: 'm2', slotId: 'MPC', item: versatile, minutes: 20 }),
    evidence({ matchId: 'm2', slotId: 'MPC', item: nextAttackingMidfielder, minutes: 10 }),
  ],
});
assert.equal(versatileXi.assignments.find((row) => row.slot.id === 'MCD_D').row.minutes, 60, 'C: conserva minutos separados por slot');
assert.equal(versatileXi.assignments.find((row) => row.slot.id === 'MPC').row.player.id, 'mco-next', 'D: un jugador no ocupa dos slots y se recalcula el siguiente candidato');

const tenPlayers = slots.slice(0, 10).map((slot, index) => evidence({ matchId: `known-${index}`, slotId: slot.id, item: player(`p${index}`, `Jugador ${index}`), minutes: 90 }));
const incompleteXi = buildMostUsedXiFromEvidence({ system: '4-2-3-1', slots, evidence: tenPlayers });
assert.equal(incompleteXi.assignments.filter((row) => row.row).length, 10);
assert.equal(incompleteXi.assignments.find((row) => row.slot.id === 'DC').row, null, 'E: sin evidencia el slot queda vacío');

const realSlots = [
  { playerName: 'Titular', playerId: 'starter', tacticalSlot: slots[5] },
];
const intervalEvidence = buildInitialSlotEvidence({
  matchId: 'system-change',
  system: '4-2-3-1',
  duration: 90,
  slots: realSlots,
  playerStats: {
    Titular: { minutes: 60, replacementName: 'Suplente' },
    Suplente: { jugadorId: 'sub' },
  },
  resolvePlayer: ({ playerName, playerId }) => player(playerId, playerName),
});
assert.deepEqual(intervalEvidence.map((row) => [row.playerName, row.minutes]), [['Titular', 60], ['Suplente', 30]], 'F: una sustitución reparte minutos una vez y no los duplica por cambios de sistema');

const allMatches = [
  evidence({ matchId: 'league-1', slotId: 'LD', item: midfielderUsedAtRightBack, minutes: 90 }),
  evidence({ matchId: 'cup-1', slotId: 'LD', item: centralTwo, minutes: 90 }),
];
assert.equal(buildMostUsedXiFromEvidence({ system: '4-2-3-1', slots, evidence: allMatches.filter((row) => row.matchId.startsWith('league')) }).assignments.find((row) => row.slot.id === 'LD').row.player.id, 'a', 'G: una muestra filtrada produce su propio once');
assert.equal(buildMostUsedXiFromEvidence({ system: '4-2-3-1', slots, evidence: allMatches.filter((row) => row.matchId.startsWith('cup')) }).assignments.find((row) => row.slot.id === 'LD').row.player.id, 'c2');

const variedMinutes = [63, 50, 90].map((minutes, index) => evidence({ matchId: `minute-${index}`, slotId: slots[index].id, item: player(`minute-p${index}`, `Minuto ${index}`), minutes }));
const minuteXi = buildMostUsedXiFromEvidence({ system: '4-2-3-1', slots, evidence: variedMinutes });
assert.deepEqual(minuteXi.assignments.slice(0, 3).map(({ row }) => getMostUsedXiMetric(row).label), ["63'", "50'", "90'"], 'H: el badge usa el valor real de cada jugador, no un minuto común');

const withoutMinutes = buildMostUsedXiFromEvidence({ system: '4-2-3-1', slots, evidence: [evidence({ matchId: 'unknown', slotId: 'POR', item: player('unknown', 'Sin minutos'), minutes: null })] });
assert.equal(getMostUsedXiMetric(withoutMinutes.assignments[0].row).label, '1 PJ', 'sin minutos reales muestra apariciones, nunca 0 minutos');
const appearancesFallback = buildMostUsedXiFromEvidence({ system: '4-2-3-1', slots, evidence: [
  evidence({ matchId: 'a1', slotId: 'LI', item: player('one', 'Una aparición'), minutes: null }),
  evidence({ matchId: 'a1', slotId: 'LI', item: player('two', 'Dos apariciones'), minutes: null }),
  evidence({ matchId: 'a2', slotId: 'LI', item: player('two', 'Dos apariciones'), minutes: null }),
] });
assert.equal(appearancesFallback.assignments.find((row) => row.slot.id === 'LI').row.player.id, 'two', 'sin minutos gana quien tiene más apariciones reales');
const stablePlayerTie = buildMostUsedXiFromEvidence({ system: '4-2-3-1', slots, evidence: [
  evidence({ matchId: 'tie-1', slotId: 'DC', item: player('zeta', 'Zeta'), minutes: 45 }),
  evidence({ matchId: 'tie-2', slotId: 'DC', item: player('alfa', 'Alfa'), minutes: 45 }),
] });
assert.equal(stablePlayerTie.assignments.find((row) => row.slot.id === 'DC').row.player.id, 'alfa', 'el empate de jugador se resuelve por nombre de forma estable');

const systemTie = [
  { system: '4-3-3', minutes: 90, played: 1, initialStarts: 1 },
  { system: '4-2-3-1', minutes: 90, played: 1, initialStarts: 1 },
].sort(compareSystemUsageRows);
assert.equal(systemTie[0].system, '4-2-3-1', 'el empate de sistemas se resuelve alfabéticamente de forma determinista');

console.log('groupMostUsedXI tests passed');
