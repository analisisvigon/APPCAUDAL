import assert from 'node:assert/strict';
import {
  buildPlayerHomePerformance,
  formatPlayerHomeDate,
  getPlayerHomeFirstName,
  selectPlayerHomeMatches,
} from './playerHomePresentation.js';
import { getPlayerMatchScorePresentation } from './playerMatchesPresentation.js';

assert.equal(getPlayerHomeFirstName({ name: 'Borja Rodríguez', shirt_name: 'BORJA' }), 'Borja');
assert.equal(getPlayerHomeFirstName({ shirt_name: 'PALACIO' }), 'PALACIO');
assert.equal(getPlayerHomeFirstName({}), 'Jugador');
assert.equal(formatPlayerHomeDate('2026-09-06'), '06 SEP');
assert.equal(formatPlayerHomeDate('fecha-inválida'), 'Fecha por confirmar');

const matches = [
  { partidoId: 'future-late', matchDate: '2026-09-12', homeScore: null, awayScore: null },
  { partidoId: 'past-old', matchDate: '2026-08-20', homeScore: '1', awayScore: '0' },
  { partidoId: 'future-next', matchDate: '2026-09-06', homeScore: null, awayScore: null },
  { partidoId: 'past-latest', matchDate: '2026-08-31', homeScore: '2', awayScore: '0' },
  { partidoId: 'invalid', matchDate: null, homeScore: null, awayScore: null },
];
const selection = selectPlayerHomeMatches(matches, '2026-09-01');
assert.equal(selection.latest.partidoId, 'past-latest');
assert.equal(selection.next.partidoId, 'future-next');
assert.deepEqual(selectPlayerHomeMatches([], '2026-09-01'), { latest: null, next: null });
assert.deepEqual(selectPlayerHomeMatches(matches, 'fecha-inválida'), { latest: null, next: null });

const sameDay = selectPlayerHomeMatches([
  { partidoId: 'today-finished', matchDate: '2026-09-01', homeScore: '1', awayScore: '1' },
  { partidoId: 'today-pending', matchDate: '2026-09-01', homeScore: null, awayScore: null },
], '2026-09-01');
assert.equal(sameDay.latest.partidoId, 'today-finished');
assert.equal(sameDay.next.partidoId, 'today-pending');
assert.deepEqual(
  getPlayerMatchScorePresentation(selection.next),
  { isPending: true, score: 'Pendiente', status: 'Pendiente' },
  'Un marcador nulo nunca se presenta como 0–0.',
);

const performance = buildPlayerHomePerformance({
  wellness: [{ id: 'w1', entry_date: '2026-09-01', health_ratio: 7.75, discomfort: 'Espalda' }],
  rpe: [{ id: 'r1', entry_date: '2026-08-31', rpe: 1 }],
}, '2026-09-01');
assert.equal(performance.latestWellness.health_ratio, 7.75);
assert.equal(performance.latestRpe.rpe, 1);
assert.equal(performance.wellnessAnsweredToday, true);
assert.equal(performance.rpeAnsweredToday, false);
assert.deepEqual(buildPlayerHomePerformance({}, '2026-09-01'), {
  latestWellness: null,
  latestRpe: null,
  wellnessAnsweredToday: false,
  rpeAnsweredToday: false,
});

console.log('playerHomePresentation: bienvenida, partidos, pendientes y rendimiento resumido validados.');
