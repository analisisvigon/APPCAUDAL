import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildRealSeasonMemory } from './realModel.js';
import { buildRealPerformanceMemory, buildRealGroupMemory, MIN_PRIVATE_GROUP } from './realPerformanceModel.js';
import { summarizeRpeEntries } from '../utils/performanceRpe.js';
import { buildGroupGoalTypeRows } from '../utils/groupAnalysisStats.js';
import { createRealSeasonMemoryPdf } from './realPdf.js';

const id = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const clubId = id(1), teamId = id(2), ctsId = id(3), seasonId = id(4);
const leagueId = id(5), cupId = id(6);
const context = { id: ctsId, clubId, teamId, seasonId, teamName: 'Almadina SC',
  displayName: 'Almadina SC Sub-23', seasonLabel: '2026/27',
  startsOn: '2026-07-01', endsOn: '2027-06-30' };
const players = Array.from({ length: 6 }, (_, i) => ({ id: id(100 + i),
  name: `Jugador ${i + 1}`, number: i + 1, membership_id: id(200 + i),
  global_player_id: id(300 + i), stage: { id: id(200 + i),
    team_id: teamId, player_id: id(300 + i), start_date: '2026-07-01', end_date: null } }));
const wellness = players.flatMap((player, i) => [
  { id: id(400 + i), jugador_id: player.id, entry_date: '2026-09-10',
    health_ratio: i === 0 ? 0 : 8, sleep_hours: 7, fatigue: i + 1,
    stress: 4, muscle_soreness: 3, sleep_quality: 7, mood: 8,
    comment: 'PRIVADO', discomfort: 'PRIVADO' },
  { id: id(420 + i), jugador_id: player.id, entry_date: '2026-10-10',
    health_ratio: 7, sleep_hours: null, fatigue: 4 },
]);
const rpe = players.flatMap((player, i) => [
  { id: id(500 + i), jugador_id: player.id, session_id: id(700),
    entry_date: '2026-09-10', rpe: i + 2, duration_minutes: 70, load: (i + 2) * 70 },
  { id: id(520 + i), jugador_id: player.id, session_id: id(701),
    entry_date: '2026-10-10', rpe: 6, duration_minutes: 0, load: 0 },
]);
const performance = { players, wellness, rpe, sessions: [
  { id: id(700), session_date: '2026-09-10' },
  { id: id(701), session_date: '2026-10-10' },
], trainingLoads: [{ scope: 'team', load_units: 120, session_date: '2026-09-10',
  record_kind: 'daily_team_load' }] };
const buildPhysical = (source = performance, ctx = context) => buildRealPerformanceMemory({ context: ctx, source });
const physical = buildPhysical();

// 1–4: completas, parciales, RPE completo y ausente.
assert.equal(physical.wellness.find((row) => row.key === 'health_ratio').responses, 12);
assert.equal(physical.wellness.find((row) => row.key === 'sleep_hours').responses, 6);
assert.equal(physical.rpe.responses, 12);
assert.equal(buildPhysical({ ...performance, rpe: [] }).rpe, null);
// 5–8: meses, cambio de temporada, otro equipo y cero acreditado.
assert.deepEqual(physical.monthly.map((row) => row.period), ['2026-09', '2026-10']);
assert.equal(buildPhysical({ ...performance, rpe: [...rpe, { ...rpe[0], id: id(900),
  entry_date: '2027-07-01' }] }).rpe.responses, 12);
assert.equal(buildPhysical({ ...performance, sessions: [{ id: id(700), session_date: '2026-09-11' },
  { id: id(701), session_date: '2026-10-10' }] }).rpe.responses, 6);
const stranger = { ...players[0], id: id(901), membership_id: id(902),
  global_player_id: id(903), stage: { id: id(902), team_id: id(904), player_id: id(903) } };
assert.equal(buildPhysical({ ...performance, players: [...players, stranger],
  wellness: [...wellness, { ...wellness[0], id: id(905), jugador_id: stranger.id }] })
  .wellness.find((row) => row.key === 'health_ratio').responses, 12);
assert.equal(physical.wellness.find((row) => row.key === 'health_ratio').value, 82 / 12);
// 9–10: sin cobertura y supresión de grupos pequeños, también por mes.
assert.equal(buildPhysical({ players: players.slice(0, 4), wellness: wellness.slice(0, 4),
  rpe: rpe.slice(0, 4) }), null);
assert.equal(MIN_PRIVATE_GROUP, 5);
assert.equal(buildPhysical({ ...performance, wellness: wellness.filter((row) =>
  row.entry_date === '2026-09-10' || row.jugador_id === players[0].id) }).monthly
  .find((row) => row.period === '2026-10').wellness, null);
// 11–13: carga colectiva sin vínculo omitida; duración ausente; duplicado contradictorio.
assert.ok(physical.limitations.some((line) => line.includes('training_sessions')));
assert.equal(performance.trainingLoads[0].load_units, 120); // Sin CTS, se omite.
assert.equal(physical.rpe.responses, 12); // duration=0 no fabrica carga ni elimina RPE válido.
const conflicting = { ...rpe[0], id: id(906), rpe: 10 };
assert.equal(buildPhysical({ ...performance, rpe: [...rpe, conflicting] }).rpe.responses, 11);
// 14: misma media que la utilidad de Rendimiento.
assert.equal(physical.rpe.value, summarizeRpeEntries(rpe).average);

const match = (n, competitionId, day, homeScore, awayScore) => ({ id: id(n),
  club_team_season_id: ctsId, date: day, time: '18:30', status: 'Finalizado',
  competition_id: competitionId, competition_key: competitionId === leagueId ? 'league' : 'cup',
  type: competitionId === leagueId ? 'Liga' : 'Copa', round: `Jornada ${n}`,
  opponent: n === 10 ? 'Olympique Sporting Club of Tripoli Extended Name' : 'Rival Copa',
  is_home: true, home_team: 'Almadina SC', away_team: 'Rival Copa',
  home_score: String(homeScore), away_score: String(awayScore),
  goals_for: String(homeScore), goals_against: String(awayScore),
  stats_system: '4-3-3', post_video_link: 'https://videos.example.org/match/10.mp4' });
const matches = [match(10, leagueId, '2026-09-17', 2, 1),
  match(11, cupId, '2026-10-17', 0, 0)];
const catalog = [{ id: leagueId, club_id: clubId, key: 'league', name: 'Liga Sub-23' },
  { id: cupId, club_id: clubId, key: 'cup', name: 'Copa Sub-23' }];
const goals = [
  { id: id(1001), partido_id: id(10), type: 'Gol a favor', minute: 20,
    scorer_id: players[0].id, assistant_id: players[1].id, phase: 'ABP', subphase: 'Córner',
    video_url: 'https://videos.example.org/goal/1.mp4' },
  { id: id(1002), partido_id: id(10), type: 'Gol a favor', minute: 45,
    scorer_id: players[2].id, phase: 'Transición' },
  { id: id(1003), partido_id: id(10), type: 'Gol en contra', minute: 70,
    phase: 'Juego directo' },
];
const individual = { players, stats: players.map((player, i) => ({ id: id(1100 + i),
  partido_id: id(10), jugador_id: player.id, role: 'Titular', minutes: 90,
  yellow_count: i === 0 ? 1 : 0, red: false })),
  slots: players.map((player, i) => ({ id: id(1200 + i), partido_id: id(10),
    scope: 'stats', slot: i, jugador_id: player.id })),
  substitutions: [], goals,
  quickEvents: Array.from({ length: 121 }, (_, i) => ({ id: id(1300 + i),
    partido_id: id(10), jugador_id: players[0].id, equipo: 'caudal',
    tipo_evento: 'recuperacion', minuto: i + 1, reviewed: true })),
  postEvents: [{ id: id(1500), partido_id: id(10), jugador_id: players[0].id,
    type: 'Recuperación', video_seconds: 135 }] };
const makeModel = (selection = 'all', data = individual) => buildRealSeasonMemory({
  context, matches, catalog, individual: data, performance, competitionId: selection,
  now: new Date('2026-11-01T12:00:00Z') });
const model = makeModel();
// 15–17: misma fórmula de Análisis Grupal, una o varias competiciones.
assert.deepEqual(model.groupAnalysis.rows, buildGroupGoalTypeRows([
  { teamSide: 'for', goalContext: 'ABP' }, { teamSide: 'for', goalContext: 'Transición' },
  { teamSide: 'against', goalContext: 'Juego directo' }]));
assert.equal(makeModel(`catalog:${leagueId}`).competitions.length, 1);
assert.equal(model.competitions.length, 2);
assert.equal(makeModel(`catalog:${leagueId}`).physical, null);
// 18–21: >100 eventos no inflan cronología; goles, tarjeta y enlaces sobreviven.
assert.equal(model.matchCards[0].timeline.length, 4);
assert.ok(model.matchCards[0].timeline.some((row) => row.kind === 'card'
  && row.card === 'yellow' && row.minute === null));
assert.equal(model.matchCards[0].quickTotals.find((row) => row.type === 'recuperacion').count, 121);
assert.equal(model.matchCards[0].goals.length, 3);
assert.equal(model.matchCards[0].stats.find((row) => row.player === players[0].name).yellow, 1);
assert.equal(model.matchCards[0].videos.length, 3);
assert.ok(model.matchCards[0].videos.some((item) => item.url.includes('#t=135')));
// Grupo incompleto queda fuera y no se presenta una distribución engañosa.
assert.equal(buildRealGroupMemory({ matches: model.matches,
  source: { goals: goals.slice(0, 2) } }), null);

const crest = readFileSync(new URL('../../public/branding/almadina-sc-crest.png', import.meta.url));
const crestDataUrl = `data:image/png;base64,${crest.toString('base64')}`;
const pdf = createRealSeasonMemoryPdf({ model, crestDataUrl, syntheticQa: true });
const official = createRealSeasonMemoryPdf({ model, crestDataUrl });
const pages = pdf.internal.pages.map((row) => row.join(' '));
const allText = pages.join(' ');
// 22–23: índice, paginación, plural y marca sólo en fixture.
assert.ok(pdf.getNumberOfPages() >= 13);
assert.ok(allText.includes('Rendimiento f'));
assert.ok(allText.includes('Análisis Grupal'));
assert.ok(allText.includes('DATOS FICTICIOS / PRUEBA'));
assert.ok(!official.internal.pages.flat().join(' ').includes('DATOS FICTICIOS / PRUEBA'));
assert.ok(allText.includes('1 PARTIDO ACREDITADO'));
const pluralModel = buildRealSeasonMemory({ context, matches: [matches[0], {
  ...matches[1], competition_id: leagueId, competition_key: 'league', type: 'Liga',
}], catalog, individual, performance, now: new Date('2026-11-01T12:00:00Z') });
assert.ok(createRealSeasonMemoryPdf({ model: pluralModel, crestDataUrl })
  .internal.pages.flat().join(' ').includes('2 PARTIDOS ACREDITADOS'));
assert.ok(Buffer.from(pdf.output('arraybuffer')).toString('latin1').includes('https://videos.example.org/goal/1.mp4'));
assert.ok(!allText.includes('PRIVADO'));
const output = new URL('../../local-exports/season-memory-qa/phase-2b4-fixture.pdf', import.meta.url);
mkdirSync(new URL('../../local-exports/season-memory-qa/', import.meta.url), { recursive: true });
writeFileSync(output, Buffer.from(pdf.output('arraybuffer')));
console.log(`Memoria 2B.4: 23 escenarios y PDF sintético OK (${pdf.getNumberOfPages()} páginas)`);
