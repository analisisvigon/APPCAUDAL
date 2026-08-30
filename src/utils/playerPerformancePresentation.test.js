import assert from 'node:assert/strict';
import {
  buildPlayerMetricSeries,
  getLatestPlayerUpdateDate,
  getPlayerChartEntries,
  getPlayerMetricValue,
  splitAvailablePlayerSeries,
} from './playerPerformancePresentation.js';

const entries = [
  { id: 'new', entry_date: '2026-08-30', mood: 8 },
  { id: 'missing', entry_date: '2026-08-28', mood: null },
  { id: 'old', entry_date: '2026-08-25', mood: 5 },
];

assert.deepEqual(
  getPlayerChartEntries(entries, 2).map((entry) => entry.id),
  ['missing', 'new'],
  'La vista conserva el orden cronológico sin fabricar días intermedios.',
);
assert.deepEqual(
  buildPlayerMetricSeries(entries, 'mood', 3),
  [
    { id: 'old', date: '2026-08-25', value: 5 },
    { id: 'missing', date: '2026-08-28', value: null },
    { id: 'new', date: '2026-08-30', value: 8 },
  ],
  'Cada punto procede de su respuesta concreta y un valor ausente sigue siendo null.',
);
assert.deepEqual(
  splitAvailablePlayerSeries(buildPlayerMetricSeries(entries, 'mood', 3)).map((segment) => segment.map((point) => point.id)),
  [['old'], ['new']],
  'Un valor ausente corta la línea; no se imputa ni se une como si existiera.',
);
assert.equal(getPlayerMetricValue(0), null);
assert.equal(getPlayerMetricValue(11), null);
assert.equal(getPlayerMetricValue('7'), 7);
assert.equal(getLatestPlayerUpdateDate(entries, [{ entry_date: '2026-08-29' }]), '2026-08-30');

console.log('playerPerformancePresentation: series propias, escala y ausencias validadas.');
