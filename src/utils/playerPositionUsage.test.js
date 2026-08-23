import assert from 'node:assert/strict';
import { buildPlayerPositionUsage, getPlayerPositionUsage } from './playerPositionUsage.js';

const identity = { playerId: 'p1', playerName: 'Jugador Uno' };
const slot = (slotIndex, extra = {}) => ({ slot: slotIndex, playerId: 'p1', playerName: 'Jugador Uno', ...extra });
const interval = (fromMinute, toMinute, system, slotIndex, extra = {}) => ({
  fromMinute,
  toMinute,
  minutes: toMinute - fromMinute,
  system,
  isComplete: true,
  slots: [slot(slotIndex, extra)],
});
const match = ({ minutes = 90, role = 'Titular', system = '4-2-3-1', initialSlot = 10, intervals = [], playerStats = {} } = {}) => ({
  minutes,
  role,
  duration: 90,
  initialSystem: system,
  initialSlots: initialSlot === null ? [] : [slot(initialSlot)],
  intervals,
  playerStats,
});

const onePosition = buildPlayerPositionUsage({ ...identity, matchRows: [match()] });
assert.deepEqual(onePosition.positions.map(({ position, minutes, percentage }) => ({ position, minutes, percentage })), [{ position: 'Delantero centro', minutes: 90, percentage: 100 }], 'A: una posición ocupa el 100%');

const polyvalent = buildPlayerPositionUsage({ ...identity, matchRows: [match({ intervals: [interval(0, 63, '4-2-3-1', 1), interval(63, 90, '4-3-3', 8)] })] });
assert.deepEqual(polyvalent.positions.map(({ position, minutes, percentage }) => ({ position, minutes, percentage })), [
  { position: 'Lateral derecho', minutes: 63, percentage: 70 },
  { position: 'Extremo derecho', minutes: 27, percentage: 30 },
], 'B-D: cambio de posición y sistema distribuye 70/30 sin duplicar minutos');

const changedInMatch = buildPlayerPositionUsage({ ...identity, matchRows: [match({ intervals: [interval(0, 60, '4-2-3-1', 9), interval(60, 90, '4-2-3-1', 10)] })] });
assert.deepEqual(changedInMatch.positions.map((row) => [row.position, row.minutes]), [['Extremo izquierdo', 60], ['Delantero centro', 30]], 'C: un cambio durante el partido corta los tramos reales');

const substituted = buildPlayerPositionUsage({ ...identity, matchRows: [match({ minutes: 60, intervals: [interval(0, 60, '4-2-3-1', 10), interval(60, 90, '4-2-3-1', 10)] })] });
assert.equal(substituted.totalMinutes, 60, 'E: el sustituido no recibe minutos posteriores a su salida');
assert.equal(substituted.positions[0].minutes, 60);

const benchStats = { Titular: { minutes: 60, replacementName: 'Jugador Uno' }, 'Jugador Uno': { role: 'Suplente', minutes: 30, jugadorId: 'p1' } };
const fromBench = buildPlayerPositionUsage({ ...identity, matchRows: [match({ minutes: 30, role: 'Suplente', initialSlot: null, playerStats: benchStats, intervals: [interval(0, 60, '4-2-3-1', 10, { playerId: 'starter', playerName: 'Titular' }), interval(60, 90, '4-2-3-1', 10)] })] });
assert.deepEqual(fromBench.positions.map((row) => [row.position, row.minutes]), [['Delantero centro', 30]], 'F: el suplente comienza a sumar al entrar');

const unknown = buildPlayerPositionUsage({ ...identity, profilePosition: 'Defensa', matchRows: [match({ initialSlot: null, intervals: [] })] });
assert.equal(unknown.unknownMinutes, 90, 'G: los minutos sin posición fiable no se redistribuyen');
assert.deepEqual(unknown.positions, []);
assert.equal(unknown.sources.profile, undefined, 'G: la posición general del perfil nunca se usa como fallback');

const filteredLeague = buildPlayerPositionUsage({ ...identity, matchRows: [match({ minutes: 70, initialSlot: 1 })] });
const filteredCup = buildPlayerPositionUsage({ ...identity, matchRows: [match({ minutes: 30, initialSlot: 7 })] });
assert.equal(filteredLeague.positions[0].position, 'Lateral derecho', 'H: el cálculo acepta exclusivamente los partidos ya filtrados por competición');
assert.equal(filteredCup.positions[0].position, 'Extremo derecho');

const localOnly = buildPlayerPositionUsage({ ...identity, matchRows: [match({ minutes: 55, initialSlot: 9 })] });
const awayOnly = buildPlayerPositionUsage({ ...identity, matchRows: [match({ minutes: 35, initialSlot: 10 })] });
assert.equal(localOnly.totalMinutes, 55, 'I: local utiliza solo sus minutos filtrados');
assert.equal(awayOnly.totalMinutes, 35, 'I: visitante utiliza solo sus minutos filtrados');

const overlapping = buildPlayerPositionUsage({ ...identity, matchRows: [match({ intervals: [interval(0, 70, '4-2-3-1', 9), interval(60, 90, '4-2-3-1', 10)] })] });
assert.equal(overlapping.determinedMinutes, 90, 'los tramos solapados no duplican minutos');
assert.equal(overlapping.valid, true);

const partial = buildPlayerPositionUsage({ ...identity, matchRows: [match({ intervals: [interval(0, 60, '4-2-3-1', 9), { ...interval(60, 90, '4-2-3-1', 10), isComplete: false }] })] });
assert.deepEqual(partial.positions.map((row) => [row.position, row.minutes, row.percentage]), [['Extremo izquierdo', 60, 100]], 'un tramo fiable conserva sus minutos exactos y calcula el porcentaje solo sobre minutos identificados');
assert.equal(partial.unknownMinutes, 30, 'los huecos posteriores no se rellenan con la posición inicial ni con la ficha');

const partialPolyvalent = buildPlayerPositionUsage({ ...identity, matchRows: [match({ intervals: [interval(0, 45, '4-2-3-1', 1), interval(45, 75, '4-3-3', 8), { ...interval(75, 90, '4-3-3', 8), isComplete: false }] })] });
assert.deepEqual(partialPolyvalent.positions.map((row) => [row.position, row.minutes, row.percentage]), [
  ['Lateral derecho', 45, 60],
  ['Extremo derecho', 30, 40],
], 'los porcentajes de varias posiciones excluyen los minutos sin snapshot fiable');
assert.equal(partialPolyvalent.unknownMinutes, 15);

const codedExplicitPosition = buildPlayerPositionUsage({ ...identity, matchRows: [match({ intervals: [interval(0, 90, '4-2-3-1', 10, { position: 'DC' })] })] });
assert.equal(codedExplicitPosition.positions[0].position, 'Delantero centro', 'los códigos posicionales estructurados se traducen al catálogo específico');

assert.equal(getPlayerPositionUsage, buildPlayerPositionUsage, 'APP y PDF comparten exactamente el mismo selector canónico');

console.log('playerPositionUsage tests passed');
