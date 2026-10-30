import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildRealSeasonMemory } from './realModel.js';
import { createRealSeasonMemoryPdf } from './realPdf.js';
import { seasonMemoryDownloadName } from './downloadName.js';
import { buildRealGroupMemory } from './realPerformanceModel.js';
import { fieldZone, goalZone, goalBucket } from './realGroupDetails.js';
import { groupSectionCount, renderRealGroup } from './realPerformancePdf.js';
import { jsPDF } from 'jspdf';

const id = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const clubId = id(1), teamId = id(2), ctsId = id(3), leagueId = id(4), cupId = id(5);
const context = { id: ctsId, clubId, teamId, seasonId: id(6), teamName: 'Al-Madina SC',
  displayName: 'Al-Madina SC Sub-23', seasonLabel: '2026-27',
  startsOn: '2026-07-01', endsOn: '2027-06-30' };
const catalog = [{ id: leagueId, club_id: clubId, key: 'league', name: 'Liga Sub-23' },
  { id: cupId, club_id: clubId, key: 'cup', name: 'Copa Sub-23' }];
const players = Array.from({ length: 34 }, (_, i) => ({ id: id(100 + i),
  name: `Jugador de prueba con apellido extenso ${i + 1}`, number: i + 1,
  membership_id: id(200 + i), global_player_id: id(300 + i),
  stage: { id: id(200 + i), team_id: teamId, player_id: id(300 + i),
    start_date: '2026-07-01', end_date: i === 33 ? '2026-12-31' : null } }));
const dates = Array.from({ length: 36 }, (_, i) => {
  const day = new Date(Date.UTC(2026, 8, 1 + i * 5));
  return day.toISOString().slice(0, 10);
});
const matches = dates.map((date, i) => {
  const cup = i % 5 === 0, against = i % 4 === 0;
  return { id: id(1000 + i), club_team_season_id: ctsId, date, time: '18:30',
    status: 'Finalizado', competition_id: cup ? cupId : leagueId,
    competition_key: cup ? 'cup' : 'league', type: cup ? 'Copa' : 'Liga',
    round: `Jornada ${i + 1}`, opponent: i === 0
      ? 'Olympique Sporting Club of Tripoli With a Very Long Full Official Name' : `Rival ${i + 1}`,
    is_home: true, home_team: 'Al-Madina SC', away_team: `Rival ${i + 1}`,
    home_score: '1', away_score: against ? '1' : '0', goals_for: '1',
    goals_against: against ? '1' : '0', stats_system: i === 0 ? '4-3-3' : '4-4-2',
    possession: i % 3 ? '55' : null, shots: i % 3 ? '11' : null,
    shots_on_target: '5', corners: '4', yellow_cards: '2', red_cards: '0',
    post_video_link: i === 0 ? 'https://videos.example.org/match/1.mp4' : null };
});
const goals = matches.flatMap((match, i) => {
  const own = { id: id(2000 + i * 2), partido_id: match.id, type: 'Gol a favor',
    minute: i === 0 ? '90+2' : 8 + (i * 7) % 83,
    scorer_id: players[i % players.length].id, assistant_id: players[(i + 1) % players.length].id,
    phase: i % 5 === 0 ? 'ABP' : 'Juego combinativo',
    subphase: i % 5 === 0 ? 'Córner' : null,
    shot_zone: i % 3 ? 'finalizacion_centro' : null,
    assist_zone: i % 3 ? 'creacion_izquierda' : null,
    goal_zone: i % 3 ? 'alta_derecha' : null,
    video_url: i <= 1 ? `https://videos.example.org/goal/${i + 1}.mp4`
      : i === 2 ? 'https://videos.example.org/goal/3.mp4?token=temporal' : null };
  return i % 4 ? [own] : [own, { id: id(2001 + i * 2), partido_id: match.id,
    type: 'Gol en contra', minute: 70, phase: 'ABP', subphase: 'Falta directa',
    shot_zone: 'finalizacion_derecha', goal_zone: 'baja_izquierda' }];
});
const stats = players.map((player, i) => ({ id: id(3000 + i), partido_id: matches[0].id,
  jugador_id: player.id, role: i < 11 ? 'Titular' : 'Suplente', minutes: i < 11 ? 90 : 20 }));
const slots = players.slice(0, 11).map((player, i) => ({ id: id(3100 + i),
  partido_id: matches[0].id, scope: 'stats', slot: i, jugador_id: player.id }));
const individual = { players, stats, slots, goals: [...goals, { ...goals[0] }],
  substitutions: [{ id: id(3300), partido_id: matches[0].id, minute: 70,
    outgoing_jugador_id: players[0].id, incoming_jugador_id: players[11].id }],
  quickEvents: Array.from({ length: 121 }, (_, i) => ({ id: id(3400 + i),
    partido_id: matches[0].id, jugador_id: players[0].id,
    equipo: 'caudal', tipo_evento: 'recuperacion', minuto: i + 1, reviewed: true })),
  postEvents: [{ id: id(3600), partido_id: matches[0].id, jugador_id: players[0].id,
    type: 'Recuperación', video_seconds: 120 }] };
const wellness = players.slice(0, 6).map((player, i) => ({ id: id(3700 + i),
  jugador_id: player.id, entry_date: '2026-09-10', health_ratio: 7 + i / 10 }));
const rpe = players.slice(0, 6).map((player, i) => ({ id: id(3800 + i),
  jugador_id: player.id, session_id: id(3900), entry_date: '2026-09-10', rpe: 5 + i }));
const performance = { players, wellness, rpe, sessions: [{ id: id(3900), session_date: '2026-09-10' }] };
const build = (competitionId = 'all', extra = {}) => buildRealSeasonMemory({ context,
  matches, catalog, individual, performance, competitionId,
  now: new Date('2027-05-15T12:00:00Z'), ...extra });
const season = build();
const league = build(`catalog:${leagueId}`);
const crest = readFileSync(new URL('../../public/branding/almadina-sc-crest.png', import.meta.url));
const crestDataUrl = `data:image/png;base64,${crest.toString('base64')}`;
const checks = [];
const check = (label, fn) => { fn(); checks.push(label); };

check('1 temporada única', () => assert.equal(build(`catalog:${leagueId}`).competitions.length, 1));
check('2 varias competiciones', () => assert.equal(season.competitions.length, 2));
check('3 Liga y Copa', () => assert.deepEqual(new Set(season.competitions.map((c) => c.kind)), new Set(['league', 'cup'])));
check('4 cobertura colectiva', () => assert.ok(season.metrics.some((m) => m.covered < m.eligible)));
check('5 once completo', () => assert.equal(season.matchCards[0].lineupCoverage, 11));
check('6 sistema predeterminado excluido', () => assert.equal(season.groupAnalysis.details.systemCoverage.verified, 1));
check('7 sustitución', () => assert.equal(season.matchCards[0].substitutions.length, 1));
check('8 goles y asistencias', () => assert.ok(season.individual.totals.attributedGoals > 0 && season.individual.totals.attributedAssists > 0));
check('9 tramos acreditados', () => assert.equal(season.groupAnalysis.details.withMinute, goals.length));
check('10 tipos de gol', () => assert.ok(season.groupAnalysis.rows.some((r) => r.context === 'ABP' && r.forCount > 0)));
check('11 origen de asistencia', () => assert.ok(season.groupAnalysis.details.assist.for.withZone > 0));
check('12 zonas de finalización', () => assert.equal(fieldZone('F.Finalización centro'), 'finalizacion_centro'));
check('13 portería 3x3', () => assert.equal(goalZone('high_right'), 'alta_derecha'));
check('14 ABP por lado', () => assert.ok(season.groupAnalysis.details.setPieces.every((r) => r.total > 0)));
check('15 sistemas con resultado', () => assert.equal(season.groupAnalysis.details.systems[0].played, 1));
check('16 rankings por competición', () => assert.ok(league.individual.byCompetition.length === 1));
check('17 duplicado de gol ignorado', () => assert.equal(season.groupAnalysis.coverage.total, goals.length));
check('18 eventos frecuentes agregados', () => assert.equal(season.matchCards[0].quickTotals[0].count, 121));
check('19 vídeos múltiples', () => assert.ok(season.matchCards[0].videos.length >= 3));
check('20 enlace HTTPS', () => assert.ok(season.matchCards[0].videos.every((v) => v.url.startsWith('https://'))));
check('21 URL temporal rechazada', () => assert.ok(season.matchCards[2].rejectedVideos > 0
  && !season.matchCards[2].videos.some((v) => /token=/.test(v.url))));
check('22 RPE suficiente', () => assert.equal(season.physical.rpe.people, 6));
check('23 RPE insuficiente', () => assert.equal(build('all', { performance: { ...performance, rpe: rpe.slice(0, 4) } }).physical.rpe, null));
check('24 Wellness suficiente', () => assert.equal(season.physical.wellness[0].people, 6));
check('25 Wellness insuficiente', () => assert.equal(build('all', { performance: { ...performance, wellness: wellness.slice(0, 4) } }).physical.wellness.length, 0));
check('26 jugador de baja', () => assert.ok(players[33].stage.end_date));
check('27 otra temporada excluida', () => assert.equal(build('all', { matches: [...matches, { ...matches[0], id: id(9999), date: '2028-01-01' }] }).excluded.invalidDate, 1));
check('28 otro equipo excluido', () => assert.equal(build('all', { matches: [...matches, { ...matches[0], id: id(9998), club_team_season_id: id(9997) }] }).excluded.otherContext, 1));
check('29 nombres largos', () => assert.ok(matches[0].opponent.length > 50 && players[0].name.length > 30));
check('30 muestra extensa', () => assert.ok(season.matches.length > 30 && season.individual.rows.length > 30));
check('31 selección parcial', () => assert.ok(league.matches.length < season.matches.length && league.physical === null));
check('32 intervalos originales', () => assert.equal(goalBucket('90+2'), '75-90'));
check('33 sin datos inventados', () => assert.equal(buildRealGroupMemory({ matches: season.matches, source: { goals: [] } }), null));
check('34 suma por competición', () => assert.equal(season.totals.played,
  season.competitions.reduce((sum, c) => sum + c.totals.played, 0)));
check('35 goles concordantes', () => assert.equal(season.groupAnalysis.coverage.forGoals, season.totals.goalsFor));
check('36 goles rivales concordantes', () => assert.equal(season.groupAnalysis.coverage.againstGoals, season.totals.goalsAgainst));
check('37 nombre Windows', () => assert.equal(seasonMemoryDownloadName(season),
  'NEXO_CLUB_Al_Madina_SC_Sub_23_2026_27_Memoria_Temporada.pdf'));
check('38 nombre parcial', () => assert.notEqual(seasonMemoryDownloadName(season), seasonMemoryDownloadName(league)));

const manySystems = { ...season.groupAnalysis, details: { ...season.groupAnalysis.details,
  systems: Array.from({ length: 18 }, (_, i) => ({ system: `SISTEMA_${i + 1}`,
    played: 1, wins: 1, draws: 0, losses: 0 })) } };
const systemsPdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
const systemSections = [];
renderRealGroup(systemsPdf, manySystems, systemSections);
check('39 todos los sistemas se paginan', () => {
  assert.equal(systemSections.length, groupSectionCount(manySystems, systemsPdf));
  const content = systemsPdf.internal.pages.flat().join(' ');
  for (let i = 1; i <= 18; i++) assert.ok(content.includes(`SISTEMA_${i}`));
});

const longSetPieces = { ...season.groupAnalysis, details: { ...season.groupAnalysis.details,
  setPieces: ['for', 'against'].map((side) => ({ side, total: 26,
    rows: Array.from({ length: 26 }, (_, i) => ({ label: `SUBTIPO_${side}_${i + 1} con descripción acreditada`, count: 1 })) })) } };
const setPiecePdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
const setPieceSections = [];
renderRealGroup(setPiecePdf, longSetPieces, setPieceSections);
check('40 ABP ofensiva y defensiva sin recortes', () => {
  assert.equal(setPieceSections.length, groupSectionCount(longSetPieces, setPiecePdf));
  const content = setPiecePdf.internal.pages.flat().join(' ');
  assert.ok(content.includes('SUBTIPO_for_26') && content.includes('SUBTIPO_against_26'));
});

const trendsOnly = { ...season.groupAnalysis, details: { ...season.groupAnalysis.details,
  systems: [], mouth: { for: { withZone: 0 }, against: { withZone: 0 } } } };
const trendsPdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
renderRealGroup(trendsPdf, trendsOnly, []);
check('41 tendencias independientes del sistema', () => assert.ok(
  trendsPdf.internal.pages.flat().join(' ').includes('TRAMOS CON')));

const qaDir = new URL('../../local-exports/season-memory-qa/', import.meta.url);
mkdirSync(qaDir, { recursive: true });
writeFileSync(new URL('group-systems-overflow-fixture.pdf', qaDir),
  Buffer.from(systemsPdf.output('arraybuffer')));
writeFileSync(new URL('group-abp-overflow-fixture.pdf', qaDir),
  Buffer.from(setPiecePdf.output('arraybuffer')));
for (const [name, model] of [['phase-2b5-season', season], ['phase-2b5-competition', league]]) {
  const pdf = createRealSeasonMemoryPdf({ model, crestDataUrl, syntheticQa: true });
  const data = Buffer.from(pdf.output('arraybuffer'));
  writeFileSync(new URL(`${name}.pdf`, qaDir), data);
  check(`${name}: paginación`, () => assert.ok(pdf.getNumberOfPages() > 25));
  check(`${name}: enlace interno`, () => assert.match(data.toString('latin1'), /\/Dest\s*\[/));
  check(`${name}: vídeo clicable`, () => assert.match(data.toString('latin1'), /\/URI\s*\(/));
  check(`${name}: destinos internos existentes`, () => {
    const pageObjects = new Set(Array.from({ length: pdf.getNumberOfPages() }, (_, i) =>
      pdf.internal.getPageInfo(i + 1).objId));
    const destinations = [...data.toString('latin1').matchAll(/\/Dest\s*\[\s*(\d+)\s+0\s+R/g)]
      .map((match) => Number(match[1]));
    assert.ok(destinations.length > 0);
    assert.ok(destinations.every((objectId) => pageObjects.has(objectId)));
  });
  check(`${name}: destinos externos seguros`, () => {
    const urls = [...data.toString('latin1').matchAll(/\/URI\s*\(([^)]*)\)/g)]
      .map((match) => match[1]);
    assert.ok(urls.length > 0);
    assert.ok(urls.every((url) => url.startsWith('https://')
      && !/localhost|token=|expires=|signature=/i.test(url)));
  });
  check(`${name}: cobertura por competición completa`, () => assert.ok(
    pdf.internal.pages.flat().join(' ').toLowerCase().includes('cobertura por competici')));
  console.log(`${name}: ${pdf.getNumberOfPages()} páginas`);
}
console.log(`Memoria 2B.5: ${checks.length} escenarios locales OK`);
