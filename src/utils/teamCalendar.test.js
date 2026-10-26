import assert from 'node:assert/strict';
import { buildTeamCalendarEvents, calendarDateKey, calendarMatchKind, calendarMonthDays, calendarTime,
  calendarWeekDays, calendarWeekSummary, calendarWeeklyCountLabel, shiftCalendarWeek } from './teamCalendar.js';

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
assert.deepEqual(calendarWeekDays('2026-10-28'), [
  '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29',
  '2026-10-30', '2026-10-31', '2026-11-01',
], 'la semana empieza el lunes y cruza de mes sin UTC');
assert.deepEqual(calendarWeekDays('2026-12-31'), [
  '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31',
  '2027-01-01', '2027-01-02', '2027-01-03',
], 'el cruce de año conserva siete días locales');
assert.deepEqual(calendarWeekDays('2026-03-29'), [
  '2026-03-23', '2026-03-24', '2026-03-25', '2026-03-26',
  '2026-03-27', '2026-03-28', '2026-03-29',
], 'la semana del cambio horario no desplaza los eventos');
assert.equal(shiftCalendarWeek('2026-12-31', 1), '2027-01-07');
assert.equal(shiftCalendarWeek('2027-01-07', -1), '2026-12-31');
assert.deepEqual(calendarWeekDays('2026-02-30'), []);
const weekDays = calendarWeekDays('2026-10-28');
const weekEvents = buildTeamCalendarEvents([
  { id: 'wk-1', club_team_season_id: 'cts', session_date: '2026-10-26',
    planning_state: 'confirmed', session_number: 1, morphology_pattern: 'MD-3',
    durationKnown: true, total_minutes: 80, objectives: 'Defensa organizada' },
  { id: 'wk-2', club_team_season_id: 'cts', session_date: '2026-10-26',
    planning_state: 'confirmed', session_number: 2, morphology_pattern: '',
    durationKnown: false, total_minutes: 0 },
  { id: 'wk-3', club_team_season_id: 'cts', session_date: '2026-10-27',
    planning_state: 'draft', morphology_pattern: 'Texto legacy', durationKnown: true, total_minutes: 55 },
], [
  { id: 'wk-match-1', date: '2026-10-28', opponent: 'Liga', competitionKey: 'league' },
  { id: 'wk-match-2', date: '2026-11-01', opponent: 'Copa', competitionKey: 'copa_rfef' },
  { id: 'outside', date: '2026-11-02', opponent: 'Amistoso', competitionKey: 'friendly' },
]);
assert.deepEqual(calendarWeekSummary(weekEvents, weekDays), {
  sessions: 3, matches: 2, activeDays: 4, durationMinutes: 135, durationCoverage: 'partial',
});
assert.equal(weekEvents.find((event) => event.id === 'wk-1').objective, 'Defensa organizada');
assert.equal(buildTeamCalendarEvents([{ id: 'unknown-duration', session_date: '2026-10-26',
  durationKnown: true, total_minutes: null }])[0].durationKnown, false,
  'una señal de duración sin minutos válidos no acredita un total');
assert.equal(weekEvents.find((event) => event.id === 'wk-3').microcycle, '');
assert.equal(weekEvents.find((event) => event.id === 'wk-1').contextId, 'cts');
assert.deepEqual(calendarWeekSummary([weekEvents[0], weekEvents[0]], weekDays), {
  sessions: 1, matches: 0, activeDays: 1, durationMinutes: 80, durationCoverage: 'complete',
}, 'una sesión repetida no duplica los indicadores');
assert.equal(buildTeamCalendarEvents([], [matches[0], matches[0]]).length, 1,
  'el mismo partido no aparece dos veces si se repite en la lectura');
assert.deepEqual(calendarWeekSummary([], weekDays), {
  sessions: 0, matches: 0, activeDays: 0, durationMinutes: 0, durationCoverage: 'none',
});
const lifecycleEvents = buildTeamCalendarEvents([
  { id: 'retired', session_date: '2026-10-26', retired_at: '2026-10-27T09:00:00Z',
    durationKnown: true, total_minutes: 90 },
  { id: 'cancelled', session_date: '2026-10-26', cancelled_at: '2026-10-26T09:00:00Z',
    durationKnown: true, total_minutes: 80 },
  { id: 'active', session_date: '2026-10-27', durationKnown: true, total_minutes: 70 },
]);
assert.deepEqual(lifecycleEvents.map((event) => event.id), ['cancelled', 'active'],
  'una sesión retirada no alimenta Mes, Lista ni Microciclo');
assert.equal(lifecycleEvents[0].cancelled, true, 'la anulación permanece visible');
assert.deepEqual(calendarWeekSummary(lifecycleEvents, weekDays), {
  sessions: 1, matches: 0, activeDays: 1, durationMinutes: 70, durationCoverage: 'complete',
}, 'las sesiones anuladas no cuentan ni suman minutos activos');
assert.deepEqual(calendarWeekSummary(buildTeamCalendarEvents([
  { id: 'cancelled', session_date: '2026-10-26', cancelled_at: null,
    durationKnown: true, total_minutes: 80 },
]), weekDays), { sessions: 1, matches: 0, activeDays: 1, durationMinutes: 80,
  durationCoverage: 'complete' }, 'reactivar restaura los contadores sin duplicar');
assert.equal(calendarWeeklyCountLabel({ sessions: 1, matches: 0, activeDays: 1 }),
  '1 sesión · 0 partidos · 1 día con actividad');
assert.equal(calendarWeeklyCountLabel({ sessions: 2, matches: 1, activeDays: 3 }),
  '2 sesiones · 1 partido · 3 días con actividad');
console.log('teamCalendar: OK');
