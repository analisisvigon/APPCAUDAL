import assert from 'node:assert/strict';
import { buildTeamCalendarEvents, calendarDateKey, calendarMatchKind, calendarMonthDays, calendarTime } from './teamCalendar.js';

assert.equal(calendarDateKey('2026-02-28'), '2026-02-28');
assert.equal(calendarDateKey('2026-02-29'), '');
assert.equal(calendarTime('19:30:00'), '19:30');
assert.equal(calendarTime('25:00'), '');

const sessions = [
  { id: 's1', club_team_season_id: 'cts-old', session_date: '2025-12-31', starts_at: null,
    planning_state: 'confirmed', session_number: 12 },
  { id: 's1', club_team_season_id: 'cts-old', session_date: '2025-12-31',
    planning_state: 'confirmed', session_number: 12 },
  { id: 's2', club_team_season_id: 'cts-new', session_date: '2026-01-02', starts_at: '10:15:00',
    planning_state: 'draft', session_number: null, morphology_pattern: 'MD-3' },
];
const matches = [
  { id: 'm1', date: '2026-01-01', time: '', opponent: 'Rival A', competitionKey: 'league',
    equipoRivalId: 'r1', isHome: true },
  { id: 'm2', date: '2026-01-02', time: '18:30', opponent: 'Rival B', type: 'Copa RFEF' },
  { id: 'm3', date: '2026-01-02', time: '20:00', opponent: 'Rival C', type: 'Amistoso' },
  { id: 'm4', date: '2026-01-03', time: '', opponent: 'Rival D', type: 'Play Off' },
];
const events = buildTeamCalendarEvents(sessions, matches, [{ id: 'r1', crest: '/rival-a.png' }]);
assert.equal(events.length, 6);
assert.deepEqual(events.map((row) => row.id), ['s1', 'm1', 's2', 'm2', 'm3', 'm4']);
assert.equal(events[0].title, 'Sesión nº 12');
assert.equal(events[0].time, '');
assert.equal(events[0].contextId, 'cts-old');
assert.equal(events[1].crest, '/rival-a.png');
assert.equal(events[1].time, '');
assert.equal(events[2].title, 'Borrador de sesión');
assert.equal(events[2].microcycle, 'MD-3');
assert.equal(buildTeamCalendarEvents([{ ...sessions[0], morphology_pattern: 'MD+1' }])[0].microcycle,
  'MD+1', 'la insignia MD queda separada del número de sesión');
assert.equal(buildTeamCalendarEvents([{ ...sessions[0], morphology_pattern: 'Texto libre antiguo' }])[0].title,
  'Sesión nº 12', 'el calendario no interpreta un valor histórico como MD');
assert.equal(buildTeamCalendarEvents([{ ...sessions[0], morphology_pattern: 'Texto libre antiguo' }])[0].microcycle,
  '', 'el valor libre antiguo no genera insignia');
assert.equal(buildTeamCalendarEvents([{ ...sessions[0], morphology_pattern: 'MD' }])[0].microcycle,
  'MD', 'una lectura nueva refleja el MD guardado');
assert.equal(events[2].time, '10:15');
assert.deepEqual(['league', 'cup', 'friendly', 'other'], matches.map(calendarMatchKind));
assert.equal(events[1].match, matches[0]);
assert.equal(events[0].microcycle, '', 'sin MD no se muestra insignia');
const sameDay = buildTeamCalendarEvents([
  { ...sessions[0], id: 'same-1', session_date: '2026-01-02', morphology_pattern: 'MD-3' },
  { ...sessions[0], id: 'same-2', session_date: '2026-01-02', morphology_pattern: 'MD+1' },
], matches);
assert.equal(sameDay.filter((row) => row.date === '2026-01-02').length, 4,
  'dos entrenamientos y dos partidos del mismo día mantienen IDs independientes');
assert.deepEqual(sameDay.filter((row) => row.kind === 'training').map((row) => row.id), ['same-1', 'same-2']);
const refreshed = buildTeamCalendarEvents([{ ...sessions[1], id: 'changed', morphology_pattern: 'MD-2' }]);
assert.equal(refreshed[0].microcycle, 'MD-2', 'la siguiente lectura sustituye el MD anterior');
const played = (id, extra) => ({ id, date: '2025-10-20', opponent: 'Rival de nombre muy largo para una celda mensual',
  competitionKey: 'league', status: 'Finalizado', ...extra });
const matchCases = buildTeamCalendarEvents([], [
  played('win-home', { isHome: true, homeScore: 2, awayScore: 1 }),
  played('win-away', { isHome: false, homeScore: 1, awayScore: 2 }),
  played('draw', { isHome: true, homeScore: 0, awayScore: 0 }),
  played('loss-away', { isHome: false, homeScore: 3, awayScore: 1 }),
  played('unknown-venue', { homeScore: 2, awayScore: 1 }),
  played('no-result', { isHome: true }),
  played('partial-goal-event', { isHome: true, status: 'Previa', statsGoalEvents: [{ type: 'Gol a favor' }] }),
  { id: 'future', date: '2099-10-20', opponent: 'Rival futuro', isHome: true,
    competitionKey: 'copa_rfef', homeScore: 2, awayScore: 0 },
], [{ id: 'crest-team', crest: '/real-crest.png' }]);
const byId = (id) => matchCases.find((row) => row.id === id);
assert.deepEqual([byId('win-home').score, byId('win-home').outcome], ['2–1', 'win']);
assert.deepEqual([byId('win-away').score, byId('win-away').outcome], ['1–2', 'win'],
  'el marcador de visitante conserva orden local-visitante');
assert.deepEqual([byId('draw').score, byId('draw').outcome], ['0–0', 'draw']);
assert.deepEqual([byId('loss-away').score, byId('loss-away').outcome], ['3–1', 'loss']);
assert.equal(byId('unknown-venue').outcome, null, 'sin localía no se atribuye el resultado al club');
assert.equal(byId('no-result').score, '', 'un partido finalizado sin marcador no inventa 0–0');
assert.equal(byId('partial-goal-event').score, '', 'un gol aislado no se presenta como resultado final');
assert.equal(byId('future').score, '', 'un marcador prematuro no se presenta como resultado final');
assert.equal(byId('future').kind, 'cup');
assert.equal(byId('win-home').title, 'Rival de nombre muy largo para una celda mensual');
assert.equal(byId('win-home').crest, '');
assert.equal(buildTeamCalendarEvents([], [{ ...matches[0], date: '2025-10-20', equipoRivalId: 'crest-team' }],
  [{ id: 'crest-team', crest: '/real-crest.png' }])[0].crest, '/real-crest.png');
assert.equal(calendarMonthDays(2026, 0)[0], null); // January 1 was Thursday.
assert.equal(calendarMonthDays(2026, 0)[3], '2026-01-01');
assert.equal(calendarMonthDays(2026, 0).at(-1), '2026-01-31');
console.log('teamCalendar: OK');
