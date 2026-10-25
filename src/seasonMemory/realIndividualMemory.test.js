import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { buildRealSeasonMemory } from './realModel.js';
import { loadRealIndividualSnapshot } from './realIndividualData.js';
import { createRealSeasonMemoryPdf } from './realPdf.js';
import { rankIndividuals } from './realIndividualModel.js';

const id = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const clubId = id(100), teamId = id(101), ctsId = id(102), seasonId = id(103);
const ligaId = id(110), copaId = id(111);
const context = { id: ctsId, clubId, teamId, teamName: 'Almadina SC',
  displayName: 'Almadina SC Sub-23', seasonId, seasonLabel: '2026/27',
  startsOn: '2026-07-01', endsOn: '2027-06-30' };
const catalog = [
  { id: ligaId, club_id: clubId, key: 'league', name: 'Liga Sub-23' },
  { id: copaId, club_id: clubId, key: 'cup', name: 'Copa Sub-23' },
];
const match = (n, comp = ligaId, score = [0, 0], date = '2026-10-01') => ({
  id: id(n), club_team_season_id: ctsId, date, time: '18:00', type: comp === ligaId ? 'Liga' : 'Copa',
  opponent: 'Rival', is_home: true, home_team: 'Almadina SC', away_team: 'Rival',
  status: 'Finalizado', home_score: String(score[0]), away_score: String(score[1]),
  goals_for: String(score[0]), goals_against: String(score[1]), competition_id: comp,
  competition_key: comp === ligaId ? 'league' : 'cup',
});
const matches = [match(201, ligaId, [2, 0]), match(202, copaId, [1, 0], '2026-10-08'),
  match(203, ligaId, [0, 0], '2026-10-15')];
const pA = id(301), pB = id(302), pC = id(303), pD = id(304), pOther = id(305);
const player = (pid, name, number, retired = false, ownerTeam = teamId) => ({ id: pid, name,
  number, position: 'MC', global_player_id: id(parseInt(pid.slice(-12), 16) + 1000),
  membership_id: id(parseInt(pid.slice(-12), 16) + 2000), active_in_squad: !retired,
  stage: { id: id(parseInt(pid.slice(-12), 16) + 2000), team_id: ownerTeam,
    player_id: id(parseInt(pid.slice(-12), 16) + 1000) } });
const source = {
  players: [player(pA, 'Álex', 8), player(pB, 'Álex', 18), player(pC, 'Carlos', 9, true),
    player(pD, 'Convocado', 15), player(pOther, 'Otro equipo', 10, false, id(999))],
  stats: [
    { id: id(401), partido_id: id(201), jugador_id: pA, role: 'Titular', minutes: '90', yellow_count: 0, red: false },
    { id: id(402), partido_id: id(201), jugador_id: pB, role: 'Suplente', minutes: '20', yellow_count: 1, red: false },
    { id: id(403), partido_id: id(201), jugador_id: pD, role: 'Suplente', minutes: '', yellow_count: 0, red: false },
    { id: id(404), partido_id: id(202), jugador_id: pA, role: 'Titular', minutes: '70', yellow_count: 1, red: false },
    { id: id(405), partido_id: id(202), jugador_id: pB, role: 'Suplente', minutes: '', yellow_count: 0, red: false },
    { id: id(406), partido_id: id(202), jugador_id: pC, role: 'Titular', minutes: '90', yellow_count: 0, red: true },
    { id: id(407), partido_id: id(203), jugador_id: pA, role: 'Titular', minutes: '', yellow_count: null, red: null },
    { id: id(408), partido_id: id(201), jugador_id: pOther, role: 'Titular', minutes: '90' },
    { id: id(409), partido_id: id(999), jugador_id: pA, role: 'Titular', minutes: '90' },
  ],
  slots: [
    { id: id(501), partido_id: id(201), scope: 'stats', jugador_id: pA },
    { id: id(502), partido_id: id(202), scope: 'stats', jugador_id: pA },
    { id: id(503), partido_id: id(202), scope: 'stats', jugador_id: pC },
    { id: id(504), partido_id: id(203), scope: 'stats', jugador_id: pA },
    { id: id(505), partido_id: id(203), scope: 'stats', jugador_id: pA },
  ],
  substitutions: [
    { id: id(601), partido_id: id(202), minute: 70, outgoing_jugador_id: pA, incoming_jugador_id: pB },
    { id: id(602), partido_id: id(203), minute: 30, outgoing_jugador_id: pA, incoming_jugador_id: pD },
  ],
  goals: [
    { id: id(701), partido_id: id(201), type: 'Gol a favor', scorer_id: pA, assistant_id: pB, is_own_goal: false },
    { id: id(702), partido_id: id(201), type: 'Gol a favor', scorer_id: null, assistant_id: null, is_own_goal: true },
    { id: id(703), partido_id: id(202), type: 'Gol a favor', scorer_id: pA, assistant_id: pC, is_own_goal: false },
  ],
};
const build = (rows = matches, individual = source, competitionId = 'all') =>
  buildRealSeasonMemory({ context, matches: rows, catalog, individual, competitionId,
    now: new Date('2026-11-01T12:00:00Z') });

const model = build();
const indiv = model.individual;
const A = indiv.rows.find((row) => row.id === pA);
const B = indiv.rows.find((row) => row.id === pB);
const C = indiv.rows.find((row) => row.id === pC);
const D = indiv.rows.find((row) => row.id === pD);
// 1–5: una y varias competiciones, nombres iguales, otra temporada y baja histórica.
assert.equal(build([matches[0]]).individual.rows.find((row) => row.id === pA).goals.value, 1);
assert.equal(A.goals.value, 2);
assert.equal(indiv.rows.filter((row) => row.name === 'Álex').length, 2);
assert.equal(indiv.rows.some((row) => row.id === pOther), false);
assert.equal(C.retired, true);
// 6–9: convocatoria sin juego, titular/suplente, sustituciones y minutos ausentes.
assert.equal(D.played, 1); // Entró en el tercer partido; la convocatoria del primero no cuenta.
assert.equal(D.contributions.some((row) => row.matchId === id(201)), false);
assert.equal(A.starts.value, 3);
assert.equal(B.bench.value, 2);
assert.equal(A.minutes.value, 190);
assert.equal(B.minutes.value, 40);
assert.equal(D.minutes.value, 60);
const conflictingMinutes = build(matches, { ...source, stats: source.stats.map((row) =>
  row.id === id(404) ? { ...row, minutes: '80' } : row) });
assert.equal(conflictingMinutes.individual.rows.find((row) => row.id === pA).minutes.value, null);
assert.equal(conflictingMinutes.individual.coverage.minuteConflicts, 1);
const missing = build([matches[0]], { ...source,
  stats: source.stats.filter((row) => row.jugador_id !== pA),
  slots: source.slots.filter((row) => row.jugador_id !== pA) });
assert.equal(missing.individual.rows.find((row) => row.id === pA).minutes.value, null);
// 10–12: cero, goles/asistencias y tarjetas sin convertir ausencia en cero.
assert.equal(B.goals.value, 0);
assert.equal(A.goals.value, 2);
assert.equal(B.assists.value, 1);
assert.equal(C.red.value, 1);
assert.equal(A.yellow.value, null);
assert.equal(A.yellow.known, 1);
// 13–15: suma por competición, filtro exacto y empate en ranking.
const byCompA = indiv.byCompetition.map((comp) => comp.rows.find((row) => row.id === pA));
assert.equal(byCompA.reduce((sum, row) => sum + row.goals.value, 0), A.goals.value);
assert.equal(indiv.byCompetition.length, 2);
assert.equal(build(matches, source, `catalog:${copaId}`).individual.rows.find((row) => row.id === pA).goals.value, 1);
assert.deepEqual(rankIndividuals(indiv.rows, 'assists').map((row) => row.id), [pB, pC]);
assert.equal(indiv.coverage.invalidPlayers, 1);
assert.equal(indiv.coverage.unattributedStats, 1);
const incomplete = build(matches, { ...source, goals: source.goals.filter((row) => row.id !== id(703)) });
assert.equal(incomplete.individual.rows.find((row) => row.id === pA).goals.value, null);
assert.equal(incomplete.individual.coverage.incompleteGoalMatches, 1);
const nameOnlyAssist = build(matches, { ...source, goals: source.goals.map((row) =>
  row.id === id(703) ? { ...row, assistant_id: null, assistant: 'Carlos' } : row) });
assert.equal(nameOnlyAssist.individual.rows.find((row) => row.id === pC).assists.value, null);
assert.equal(nameOnlyAssist.individual.coverage.unattributedGoals, 1);
const nameOnlyScorer = build(matches, { ...source, goals: source.goals.map((row) =>
  row.id === id(703) ? { ...row, scorer_id: null, scorer: 'Álex' } : row) });
assert.equal(nameOnlyScorer.individual.rows.find((row) => row.id === pA).goals.value, null);
assert.equal(build([match(204, ligaId, [0, 0], '2027-02-01')]).individual.rows.length, 0);

// Lectura: únicamente IDs del CTS seleccionado; nunca une nombres ni lee usuarios.
const calls = [];
const mock = { from(table) {
  const query = { table, filters: [], select() { return this; }, in(key, values) {
    this.filters.push((row) => values.includes(row[key])); return this;
  }, eq(key, value) { this.filters.push((row) => row[key] === value); return this; },
  order() { return this; }, range(from, to) {
    calls.push([table, this.filters.length]);
    const fixtures = { player_team_memberships: source.players.map((row) => row.stage),
      jugadores: source.players, partido_estadisticas_jugador: source.stats,
      partido_alineacion_slots: source.slots, partido_eventos_sustitucion: source.substitutions,
      partido_eventos_gol: source.goals, match_quick_events: [], partido_eventos_post: [] };
    return Promise.resolve({ data: fixtures[table].filter((row) => this.filters.every((fn) => fn(row)))
      .slice(from, to + 1), error: null });
  } }; return query;
} };
const loaded = await loadRealIndividualSnapshot(mock, context,
  [...matches, { ...matches[0], id: id(999), club_team_season_id: id(900) }]);
assert.equal(loaded.stats.some((row) => row.partido_id === id(999)), false);
assert.equal(calls.some(([table]) => table === 'auth.users'), false);

const crest = readFileSync(new URL('../../public/branding/almadina-sc-crest.png', import.meta.url));
const crestDataUrl = `data:image/png;base64,${crest.toString('base64')}`;
const pdf = createRealSeasonMemoryPdf({ model, crestDataUrl });
assert.ok(pdf.getNumberOfPages() > 10);
const text = pdf.internal.pages.flat().join(' ');
assert.ok(text.includes('Plantilla completa') && text.includes('Copa Sub-23'));
assert.ok(!text.includes('DEMOSTRACIÓN') && !text.includes('DATOS FICTICIOS'));
// 16: 53 jugadores, tabla con varias páginas e índice suficiente.
const extra = Array.from({ length: 50 }, (_, index) => {
  const pid = id(4000 + index);
  return player(pid, `Jugador ${String(index + 1).padStart(2, '0')}`, index + 20);
});
const longSource = { ...source, players: [...source.players, ...extra],
  stats: [...source.stats, ...extra.map((row, index) => ({ id: id(5000 + index),
    partido_id: id(201), jugador_id: row.id, role: 'Suplente', minutes: '1',
    yellow_count: 0, red: false }))] };
const longPdf = createRealSeasonMemoryPdf({ model: build(matches, longSource), crestDataUrl,
  syntheticQa: true });
assert.ok(longPdf.getNumberOfPages() > pdf.getNumberOfPages() + 2);
const manyCatalog = Array.from({ length: 8 }, (_, index) => ({ id: id(6000 + index),
  club_id: clubId, key: 'cup', name: `Copa ${index + 1}` }));
const manyMatches = manyCatalog.map((comp, index) => match(7000 + index, comp.id, [0, 0],
  `2026-11-${String(index + 1).padStart(2, '0')}`));
const manySource = { players: [source.players[0]], stats: manyMatches.map((row, index) => ({
  id: id(8000 + index), partido_id: row.id, jugador_id: pA, role: 'Titular',
  minutes: '90', yellow_count: 0, red: false })), slots: [], substitutions: [], goals: [] };
const many = buildRealSeasonMemory({ context, matches: manyMatches, catalog: manyCatalog,
  individual: manySource, now: new Date('2026-12-01T12:00:00Z') });
const manyPdf = createRealSeasonMemoryPdf({ model: many, crestDataUrl });
assert.ok(manyPdf.getNumberOfPages() > 25);
assert.ok(manyPdf.internal.pages[4].join(' ').includes('ndice')); // Segunda página de índice.
// 17: sin partidos disputados se mantiene el gate oficial del PDF.
assert.throws(() => createRealSeasonMemoryPdf({ model: build([]), crestDataUrl }), /partidos acreditados/);
if (process.env.SEASON_MEMORY_INDIVIDUAL_FIXTURE_PDF) {
  writeFileSync(process.env.SEASON_MEMORY_INDIVIDUAL_FIXTURE_PDF,
    Buffer.from(longPdf.output('arraybuffer')));
}
console.log('Memoria 2B.2: 17 escenarios de identidad, cobertura, competiciones, paginación y PDF OK');
