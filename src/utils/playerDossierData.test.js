import assert from 'node:assert/strict';
import { filterMatchesByCompetition } from './competitionFilters.js';
import {
  buildPlayerDossierAggregate,
  buildPlayerDossierCompetitionBreakdown,
  calculatePlayerDossierPer90,
  deduplicatePlayerOfficialStatsRows,
  getPlayerDossierVenue,
  isPlayerDossierMatchEligible,
  normalizePlayerDossierRole,
  sortPlayerDossierMatchRows,
} from './playerDossierData.js';

const NOW = new Date(2026, 8, 23, 12, 0, 0);
const actions = (prefix, count) => Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index}` }));
const row = ({ id, date = '2026-09-10', minutes = 90, role = 'Titular', goalCount = 0, assistCount = 0, duration = 90, competitionKey = 'league', isHome = true, yellow = 0, red = false, injured = false } = {}) => ({
  match: { id, date, duration, competitionKey, competition_key: competitionKey, isHome },
  minutes,
  role,
  goals: actions('g', goalCount),
  assists: actions('a', assistCount),
  yellow,
  red,
  injured,
});

for (const stats of [{ role: 'Titular', minutes: null }, { role: 'Titular', minutes: 90 }]) {
  assert.equal(isPlayerDossierMatchEligible({ match: { date: '2026-09-24' }, stats, now: NOW }), false, 'una fecha futura nunca aporta PJ ni minutos');
}
assert.equal(isPlayerDossierMatchEligible({ match: { date: '2026-09-24' }, stats: {}, goalCount: 1, assistCount: 1, now: NOW }), false, 'la producción accidental tampoco convierte un futuro en histórico');
assert.equal(isPlayerDossierMatchEligible({ match: { date: '2026-09-23', time: '18:00' }, stats: { minutes: 90 }, now: NOW }), false, 'la hora fiable excluye un partido de hoy que aún no empezó');
assert.equal(isPlayerDossierMatchEligible({ match: { date: '2026-09-10' }, stats: { role: 'Titular', minutes: 90 }, now: NOW }), true, 'un partido pasado con estadística real no exige marcador');
assert.equal(isPlayerDossierMatchEligible({ match: { date: 'fecha-inválida' }, stats: { role: 'Titular' }, now: NOW }), false, 'una fecha inválida y un rol planificado no bastan');
assert.equal(isPlayerDossierMatchEligible({ match: {}, stats: { minutes: 35 }, now: NOW }), true, 'sin fecha sólo se admite evidencia oficial fuerte de participación');

const pastAggregate = buildPlayerDossierAggregate([row({ id: 'past' })]);
assert.deepEqual(
  { played: pastAggregate.played, starts: pastAggregate.starts, minutes: pastAggregate.minutes, possible: pastAggregate.possibleMinutes, participation: pastAggregate.participation },
  { played: 1, starts: 1, minutes: 90, possible: 90, participation: 100 },
);
const extraTimeAggregate = buildPlayerDossierAggregate([row({ id: 'extra', minutes: 120, duration: 120 })]);
assert.equal(extraTimeAggregate.possibleMinutes, 120);
assert.equal(extraTimeAggregate.participation, 100, '120/120 nunca se convierte en 133%');
const observedExtraTimeAggregate = buildPlayerDossierAggregate([row({ id: 'extra-observed', minutes: 120, duration: null })]);
assert.equal(observedExtraTimeAggregate.possibleMinutes, 120, 'los minutos oficiales superiores a 90 amplían la duración aunque falte el campo persistido');

assert.equal(calculatePlayerDossierPer90(0, 0), null);
assert.equal(calculatePlayerDossierPer90(0, null), null);
assert.equal(calculatePlayerDossierPer90(0, 90), '0.00');
assert.equal(calculatePlayerDossierPer90(1, 90), '1.00');

const unknownFieldsAggregate = buildPlayerDossierAggregate([row({ id: 'unknown', minutes: null, role: null, goalCount: 1, yellow: null, red: null, injured: null })]);
assert.equal(normalizePlayerDossierRole(null), null);
assert.equal(unknownFieldsAggregate.played, 1, 'una producción oficial confirma PJ aunque falten minutos y rol');
assert.equal(unknownFieldsAggregate.minutes, null);
assert.equal(unknownFieldsAggregate.participation, null);
assert.equal(unknownFieldsAggregate.benchEntries, null, 'rol ausente no se resta como suplencia');
assert.equal(unknownFieldsAggregate.yellow, null);
assert.equal(unknownFieldsAggregate.red, null);
assert.equal(unknownFieldsAggregate.injured, null);

assert.equal(getPlayerDossierVenue({ isHome: true }), 'Local');
assert.equal(getPlayerDossierVenue({ isHome: false }), 'Visitante');
assert.equal(getPlayerDossierVenue({ isHome: null }), null);
assert.equal(getPlayerDossierVenue({}), null);

const playerA = { id: 'player-a', globalPlayerId: 'global-a', membershipId: 'member-a', aliasIds: ['legacy-a'], aliasNames: ['Nombre antiguo'], name: 'Álex García' };
const playerB = { id: 'player-b', name: 'Álex García' };
const singleIdentityRows = [
  { id: 'stats-1', partido_id: 'm1', jugador_id: 'player-a', player_name: 'Álex García', minutes: 90 },
  { id: 'stats-2', partido_id: 'm1', jugador_id: 'legacy-a', player_name: 'Nombre antiguo', minutes: 90, role: 'Titular' },
  { id: 'stats-3', partido_id: 'm2', jugador_id: 'global-a', player_name: 'Álex García', minutes: 30 },
  { id: 'stats-4', partido_id: 'm3', membership_id: 'member-a', player_name: 'Álex García', minutes: 20 },
  { id: 'stats-5', partido_id: 'm4', player_name: 'Nombre antiguo', minutes: 10 },
];
const deduplicated = deduplicatePlayerOfficialStatsRows({ statsRows: singleIdentityRows, player: playerA, players: [playerA] });
assert.deepEqual(deduplicated.map((stats) => stats.partido_id).sort(), ['m1', 'm2', 'm3', 'm4']);
assert.equal(deduplicated.find((stats) => stats.partido_id === 'm1').id, 'stats-1', 'el ID canónico prevalece al deduplicar el mismo partido');

const homonymRows = [
  { id: 'a', partido_id: 'same', jugador_id: 'player-a', player_name: 'Álex García', minutes: 90 },
  { id: 'b', partido_id: 'same', jugador_id: 'player-b', player_name: 'Álex García', minutes: 45 },
  { id: 'legacy', partido_id: 'legacy', player_name: 'Álex García', minutes: 10 },
];
assert.deepEqual(deduplicatePlayerOfficialStatsRows({ statsRows: homonymRows, player: playerA, players: [playerA, playerB] }).map((stats) => stats.id), ['a'], 'dos homónimos con IDs diferentes no se fusionan y el legacy ambiguo queda sin resolver');
assert.deepEqual(deduplicatePlayerOfficialStatsRows({ statsRows: homonymRows, player: playerB, players: [playerA, playerB] }).map((stats) => stats.id), ['b']);

const catalog = [
  { key: 'league', competitionType: 'official', label: 'Liga' },
  { key: 'copa_rfef', competitionType: 'official', label: 'Copa RFEF' },
  { key: 'friendly', competitionType: 'friendly', label: 'Amistoso' },
];
const seasonMatches = [
  { id: 'old', date: '2026-05-30', competition_key: 'league', isHome: true },
  { id: 'league-home', date: '2026-09-01', competition_key: 'league', isHome: true },
  { id: 'league-away', date: '2026-09-08', competition_key: 'league', isHome: false },
  { id: 'cup', date: '2026-09-15', competition_key: 'copa_rfef', isHome: false },
  { id: 'friendly', date: '2026-09-20', competition_key: 'friendly', isHome: true },
  { id: 'unknown-season', competition_key: 'league', isHome: true },
];
assert.deepEqual(
  filterMatchesByCompetition(seasonMatches, 'Temporada', catalog, { activeSeason: '2026/2027' }).map((match) => match.id),
  ['league-home', 'league-away', 'cup'],
  'Temporada incluye Liga y Copa, local y visitante, pero no amistosos ni fechas de otra temporada o desconocidas',
);

const competitionRows = [
  row({ id: 'l1', minutes: 90, goalCount: 1, competitionKey: 'league' }),
  row({ id: 'l2', minutes: 30, assistCount: 1, competitionKey: 'league' }),
  row({ id: 'c1', minutes: 120, duration: 120, competitionKey: 'copa_rfef' }),
];
const total = buildPlayerDossierAggregate(competitionRows);
const breakdown = buildPlayerDossierCompetitionBreakdown({ matchRows: competitionRows, getCompetition: (match) => catalog.find((competition) => competition.key === match.competitionKey) });
assert.equal(breakdown.reduce((sum, competition) => sum + competition.played, 0), total.played);
assert.equal(breakdown.reduce((sum, competition) => sum + competition.starts, 0), total.starts);
assert.equal(breakdown.reduce((sum, competition) => sum + competition.minutes, 0), total.minutes);
assert.equal(breakdown.reduce((sum, competition) => sum + competition.goals, 0), total.goals);
assert.equal(breakdown.reduce((sum, competition) => sum + competition.assists, 0), total.assists);

const incompleteCompetitionRows = [
  row({ id: 'known', minutes: 60, competitionKey: 'league' }),
  row({ id: 'missing', minutes: null, role: null, goalCount: 1, competitionKey: 'copa_rfef' }),
];
const incompleteTotal = buildPlayerDossierAggregate(incompleteCompetitionRows);
const incompleteBreakdown = buildPlayerDossierCompetitionBreakdown({ matchRows: incompleteCompetitionRows, getCompetition: (match) => catalog.find((competition) => competition.key === match.competitionKey) });
assert.equal(incompleteTotal.minutes, null);
assert.equal(incompleteBreakdown.reduce((sum, competition) => sum + competition.knownMinutes, 0), incompleteTotal.knownMinutes, 'la suma de minutos conocidos por competición coincide aunque el total completo no esté disponible');

const sorted = sortPlayerDossierMatchRows([row({ id: 'b', date: '2026-09-10' }), row({ id: 'old', date: '2026-08-01' }), row({ id: 'a', date: '2026-09-10' })]);
assert.deepEqual(sorted.map((entry) => entry.match.id), ['a', 'b', 'old'], 'fecha descendente y matchId estable resuelven cualquier orden de Supabase');

console.log('player dossier data tests passed');
