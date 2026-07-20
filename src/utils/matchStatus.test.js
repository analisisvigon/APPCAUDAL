import assert from 'node:assert/strict';
import { MATCH_STATUS_COLORS, getMatchOutcome, getMatchScore, getMatchStatus, getMatchStatusPresentation, parseLocalMatchDate } from './matchStatus.js';

const now = new Date(2026, 6, 20, 12, 0, 0);
const base = { date: '2026-07-20', isHome: true, status: 'Previa', homeScore: '', awayScore: '', goalsFor: '', goalsAgainst: '', statsGoalEvents: [] };

assert.equal(getMatchStatus({ ...base, date: '2026-07-27' }, now), 'scheduled');
assert.equal(getMatchStatus({ ...base, date: '2026-07-27', homeScore: 2, awayScore: 0 }, now), 'scheduled', 'una fecha futura no se da por jugada por un marcador prematuro');
assert.equal(getMatchStatus({ ...base, date: '2026-07-19' }, now), 'pending_result');
assert.equal(getMatchStatus(base, now), 'scheduled');
assert.equal(getMatchStatus({ ...base, date: '2026-07-19', status: 'Aplazado' }, now), 'postponed');
assert.equal(getMatchStatus({ ...base, date: '2026-07-19', status: 'Suspendido' }, now), 'suspended');
assert.equal(getMatchStatus({ ...base, date: '2026-07-19', status: 'Cancelado' }, now), 'cancelled');

assert.equal(getMatchOutcome({ ...base, date: '2026-07-19', homeScore: 2, awayScore: 0 }, now), 'win');
assert.equal(getMatchOutcome({ ...base, date: '2026-07-19', isHome: false, homeScore: 0, awayScore: 1 }, now), 'win');
assert.equal(getMatchOutcome({ ...base, date: '2026-07-19', homeScore: 0, awayScore: 1 }, now), 'loss');
assert.equal(getMatchOutcome({ ...base, date: '2026-07-19', isHome: false, homeScore: 2, awayScore: 1 }, now), 'loss');
assert.equal(getMatchOutcome({ ...base, status: 'Finalizado', homeScore: 0, awayScore: 0 }, now), 'draw');
assert.equal(getMatchStatusPresentation({ ...base, status: 'Finalizado', homeScore: 0, awayScore: 0 }, now).color, MATCH_STATUS_COLORS.draw);
assert.equal(getMatchStatusPresentation({ ...base, date: '2026-07-19' }, now).color, MATCH_STATUS_COLORS.pending_result);
assert.equal(getMatchOutcome({ ...base, date: '2026-07-19' }, now), null);
assert.equal(getMatchScore({ ...base, statsGoalEvents: [{ type: 'Gol a favor' }] }).caudal, 1);
assert.equal(getMatchStatus({ ...base, date: '2026-07-19', played: false, statsGoalEvents: [{ type: 'Gol a favor' }] }, now), 'played');
assert.equal(getMatchStatus({ ...base, date: '2026-07-19', played: true }, now), 'played');
assert.equal(getMatchStatus({ ...base, date: '2026-07-19', status: 'Cerrado' }, now), 'played');
assert.equal(getMatchOutcome({ ...base, date: '2026-07-19', played: true }, now), null, 'compatibilidad legacy no inventa un 0-0');

const localDate = parseLocalMatchDate('2026-08-16');
assert.equal(localDate.getFullYear(), 2026);
assert.equal(localDate.getMonth(), 7);
assert.equal(localDate.getDate(), 16);
assert.equal(parseLocalMatchDate('2026-02-30'), null);

console.log('matchStatus tests passed');
