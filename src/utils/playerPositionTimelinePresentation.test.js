import assert from 'node:assert/strict';

import {
  UNKNOWN_POSITION_KEY,
  buildMatchPositionSummary,
  buildPositionTimelineEntries,
  formatPositionSegmentRange,
  getPositionTimelineMatches,
} from './playerPositionTimelinePresentation.js';

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
        { fromMinute: 0, toMinute: 30, minutes: 30, position: 'Mediapunta', system: '4-2-3-1', identified: true },
        { fromMinute: 30, toMinute: 60, minutes: 30, position: 'Extremo derecho', system: '4-3-3', identified: true },
        { fromMinute: 60, toMinute: 90, minutes: 30, position: 'Mediapunta', system: '4-2-3-1', identified: true },
      ],
    },
    {
      matchId: 'm2', opponent: 'Segundo rival', date: '2026-09-13', competition: 'Copa', venue: 'Visitante', result: '0-0',
      segments: [{ fromMinute: 70, toMinute: 90, minutes: 20, position: '', system: '4-4-2', identified: false }],
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
assert.equal(unknown[0].segments[0].system, '4-4-2', 'sistema conocido y posición desconocida se conserva');
assert.deepEqual(buildMatchPositionSummary(usage.matches[0]), {
  label: '3 tramos',
  systemLabel: '2 sistemas',
  segments: usage.matches[0].segments,
  hasDetails: true,
});
assert.equal(buildMatchPositionSummary(usage.matches[1]).label, '—');
assert.equal(formatPositionSegmentRange(usage.matches[0].segments[0]), "0'–30'");
assert.equal(buildMatchPositionSummary({}).hasDetails, false);

const tenMatches = {
  ...usage,
  matches: Array.from({ length: 10 }, (_, index) => ({
    matchId: `many-${index}`,
    opponent: `Rival ${index + 1}`,
    segments: [{ fromMinute: 0, toMinute: 90, minutes: 90, position: 'Mediapunta', system: '4-2-3-1', identified: true }],
  })),
};
assert.equal(getPositionTimelineMatches(tenMatches, 'Mediapunta').length, 10, 'el detalle admite diez partidos sin truncarlos');

console.log('player position timeline presentation tests passed');
