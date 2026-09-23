import assert from 'node:assert/strict';

import {
  UNKNOWN_POSITION_KEY,
  buildMatchPositionSystemLines,
  buildMatchPositionSummary,
  buildPositionTimelineEntries,
  formatPositionSegmentRange,
  getPositionTimelineMatches,
  mergeContiguousPositionSegments,
} from './playerPositionTimelinePresentation.js';

const segment = (fromMinute, toMinute, position, system, extra = {}) => ({
  matchId: 'm1', playerId: 'p1', fromMinute, toMinute, minutes: toMinute - fromMinute,
  position, system, identified: Boolean(position), ...extra,
});

const contiguous = [
  segment(63, 71, 'Extremo derecho', '4-2-3-1'),
  segment(71, 84, 'Extremo derecho', '4-2-3-1'),
  segment(84, 90, 'Extremo derecho', '4-2-3-1'),
];
const visuallyMerged = mergeContiguousPositionSegments(contiguous);
assert.deepEqual(visuallyMerged.map(({ fromMinute, toMinute, minutes }) => [fromMinute, toMinute, minutes]), [[63, 90, 27]], 'fusiona solo para presentación los segmentos idénticos contiguos');
assert.equal(visuallyMerged[0].canonicalSegments.length, 3);
assert.deepEqual(contiguous.map(({ fromMinute, toMinute }) => [fromMinute, toMinute]), [[63, 71], [71, 84], [84, 90]], 'no muta los segmentos canónicos');

assert.equal(mergeContiguousPositionSegments([
  segment(0, 45, 'Extremo derecho', '4-3-3'),
  segment(45, 65, 'Extremo derecho', '4-2-3-1'),
]).length, 2, 'no fusiona si cambia el sistema');
assert.equal(mergeContiguousPositionSegments([
  segment(0, 45, 'Extremo derecho', '4-2-3-1'),
  segment(45, 65, 'Mediapunta', '4-2-3-1'),
]).length, 2, 'no fusiona si cambia la posición');
assert.equal(mergeContiguousPositionSegments([
  segment(0, 30, 'Extremo derecho', '4-2-3-1'),
  segment(40, 60, 'Extremo derecho', '4-2-3-1'),
]).length, 2, 'no fusiona si existe un hueco');

const usage = {
  totalMinutes: 110,
  unknownMinutes: 20,
  positions: [
    { position: 'Mediapunta', minutes: 60 },
    { position: 'Extremo derecho', minutes: 30 },
  ],
  matches: [
    {
      matchId: 'm1', opponent: 'Rival con nombre especialmente largo', date: '2026-09-20', competition: 'Liga', venue: 'Local', result: '2-1',
      segments: [
        segment(0, 30, 'Mediapunta', '4-2-3-1'),
        segment(30, 60, 'Extremo derecho', '4-3-3'),
        segment(60, 90, 'Mediapunta', '4-2-3-1'),
      ],
    },
    {
      matchId: 'm2', opponent: 'Segundo rival', date: '2026-09-13', competition: 'Copa', venue: 'Visitante', result: '0-0',
      segments: [{ ...segment(70, 90, '', '4-4-2'), matchId: 'm2' }],
    },
  ],
};

const entries = buildPositionTimelineEntries(usage);
assert.deepEqual(entries.map(({ key, abbreviation, minutes }) => [key, abbreviation, minutes]), [
  ['Mediapunta', 'MP', 60],
  ['Extremo derecho', 'ED', 30],
  [UNKNOWN_POSITION_KEY, '—', 20],
]);
const attackingMidfielder = getPositionTimelineMatches(usage, 'Mediapunta');
assert.equal(attackingMidfielder.length, 1);
assert.equal(attackingMidfielder[0].segments.length, 2, 'dos tramos no contiguos de un partido siguen separados');
assert.equal(attackingMidfielder[0].minutes, 60);
const unknown = getPositionTimelineMatches(usage, UNKNOWN_POSITION_KEY);
assert.equal(unknown[0].segments[0].system, '4-4-2', 'desconocido con sistema conocido conserva el sistema');
assert.equal(mergeContiguousPositionSegments([segment(70, 82, '', '')])[0].system, '', 'desconocido con sistema desconocido no inventa sistema');

const onePositionTwoSystems = buildMatchPositionSummary({ segments: [
  segment(0, 45, 'Extremo derecho', '4-3-3'),
  segment(45, 90, 'Extremo derecho', '4-2-3-1'),
] });
assert.equal(onePositionTwoSystems.label, 'ED');
assert.equal(onePositionTwoSystems.systemLabel, '2 sistemas');

const twoPositionsOneSystem = buildMatchPositionSummary({ segments: [
  segment(0, 60, 'Mediapunta', '4-2-3-1'),
  segment(60, 90, 'Mediocentro', '4-2-3-1'),
] });
assert.equal(twoPositionsOneSystem.label, '2 posiciones');
assert.equal(twoPositionsOneSystem.systemLabel, '4-2-3-1');

const twoPositionsTwoSystems = buildMatchPositionSummary({ segments: [
  segment(0, 60, 'Mediapunta', '4-2-3-1'),
  segment(60, 90, 'Mediocentro', '4-4-2'),
] });
assert.equal(twoPositionsTwoSystems.label, '2 posiciones');
assert.equal(twoPositionsTwoSystems.systemLabel, '2 sistemas');

const internalBoundaries = buildMatchPositionSummary({ segments: contiguous });
assert.equal(internalBoundaries.visualSegmentCount, 1);
assert.equal(internalBoundaries.label, 'ED');
assert.equal(internalBoundaries.systemLabel, '4-2-3-1');
assert.equal(internalBoundaries.hasDetails, false, 'un único tramo visual no ofrece detalle redundante');
assert.equal(internalBoundaries.canonicalSegments.length, 3);

assert.deepEqual(buildMatchPositionSystemLines({ segments: contiguous }).lines.map((line) => line.label), ['ED · 4-2-3-1'], 'misma posición y sistema contiguos producen una sola línea PDF');
assert.deepEqual(buildMatchPositionSystemLines({ segments: onePositionTwoSystems.canonicalSegments }).lines.map((line) => line.label), ['ED · 4-3-3', 'ED · 4-2-3-1'], 'un cambio de sistema conserva dos líneas compactas');
assert.deepEqual(buildMatchPositionSystemLines({ segments: twoPositionsTwoSystems.canonicalSegments }).lines.map((line) => line.label), ['MP · 4-2-3-1', 'MC · 4-4-2'], 'un cambio de posición conserva ambas líneas');
assert.deepEqual(buildMatchPositionSystemLines({ segments: [segment(54, 90, 'Delantero centro', '3-4-1-2')] }).lines.map((line) => line.label), ['DC · 3-4-1-2'], 'el tramo de delantero centro del 3-4-1-2 usa la abreviatura canónica DC');
assert.deepEqual(buildMatchPositionSystemLines({ segments: [segment(0, 20, 'Extremo derecho', '')] }).lines.map((line) => line.label), ['ED · —']);
assert.deepEqual(buildMatchPositionSystemLines({ segments: [segment(0, 20, '', '4-2-3-1')] }).lines.map((line) => line.label), ['— · 4-2-3-1']);
assert.deepEqual(buildMatchPositionSystemLines({ segments: [segment(0, 20, '', '')] }).lines.map((line) => line.label), ['—']);
assert.deepEqual(buildMatchPositionSystemLines({}).lines.map((line) => line.label), ['—'], 'sin evidencia no se inventa posición ni sistema');

assert.equal(formatPositionSegmentRange(usage.matches[0].segments[0]), "0'–30'");
assert.equal(buildMatchPositionSummary({}).hasDetails, false);

const tenMatches = {
  ...usage,
  matches: Array.from({ length: 10 }, (_, index) => ({
    matchId: `many-${index}`,
    opponent: `Rival ${index + 1}`,
    segments: [{ ...segment(0, 90, 'Mediapunta', '4-2-3-1'), matchId: `many-${index}` }],
  })),
};
assert.equal(getPositionTimelineMatches(tenMatches, 'Mediapunta').length, 10, 'el detalle admite diez partidos sin truncarlos');

console.log('player position timeline presentation tests passed');
