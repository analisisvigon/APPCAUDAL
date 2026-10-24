import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { SEASON_MEMORY_DEMO } from './demoData.js';
import { createSeasonMemoryPdf } from './pdf.js';
import { buildSeasonMemoryPresentation } from './presentation.js';
import { createRealSeasonMemoryPdf } from './realPdf.js';
import { loadRealSeasonMemoryContexts, loadRealSeasonMemorySnapshot } from './realData.js';
import { buildRealSeasonMemory, resolveSeasonMemoryCompetition,
  resolveSeasonMemoryContexts } from './realModel.js';

const clubId = 'club-1';
const teamId = 'team-1';
const seasonId = 'season-1';
const ctsId = 'cts-1';
const membership = { club_id: clubId, role: 'staff', is_active: true };
const links = [{ id: ctsId, club_id: clubId, team_id: teamId, season_id: seasonId }];
const seasons = [{ id: seasonId, club_id: clubId, label: '2026/27',
  starts_on: '2026-07-01', ends_on: '2027-06-30', is_active: true, status: 'open' }];
const teams = [{ id: teamId, club_id: clubId, code: 'OWN' }];
const ownTeams = [{ id: teamId, name: 'Almadina SC', team_kind: 'own',
  crest: '/branding/almadina-sc-crest.png' }];
const context = resolveSeasonMemoryContexts({ membership, links, seasons, teams, ownTeams })[0];
const calls = [];
const client = { from(table) {
  const query = { select(columns, options) { calls.push([table, 'select', columns]); this.options = options; return this; },
    eq(column, value) { calls.push([table, 'eq', column, value]); return this; },
    or(value) { calls.push([table, 'or', value]); return this; },
    order(column) { calls.push([table, 'order', column]); return this; },
    range() { return Promise.resolve({ data: ({ club_team_seasons: links,
      club_seasons: seasons, club_teams: teams, equipos_rivales: ownTeams,
      partidos: [match('mock')], competitions: catalog })[table], error: null }); },
    is(column, value) { calls.push([table, 'is', column, value]);
      return Promise.resolve({ count: 2, error: null }); },
  };
  return query;
} };
const catalog = [
  { id: 'liga-1', club_id: clubId, key: 'league', name: 'Liga Sub-23', competition_type: 'official' },
  { id: 'copa-1', club_id: clubId, key: 'copa_rfef', name: 'Copa A', competition_type: 'official' },
  { id: 'copa-2', club_id: clubId, key: 'copa_b', name: 'Copa B', competition_type: 'official' },
];
const match = (id, patch = {}) => ({ id, club_team_season_id: ctsId,
  date: '2026-10-01', time: '18:00', type: 'Liga', round: 'J1',
  opponent: 'Rival', is_home: true, home_team: 'Almadina SC', away_team: 'Rival',
  status: 'Finalizado', home_score: '2', away_score: '1', goals_for: '2', goals_against: '1',
  competition_id: 'liga-1', competition_key: 'league',
  shots: '0', possession: '', ...patch });
const build = (matches, options = {}) => buildRealSeasonMemory({ context, matches, catalog,
  now: new Date('2026-11-01T12:00:00Z'), ...options });

const loadedContexts = await loadRealSeasonMemoryContexts(client, membership);
assert.equal(loadedContexts.length, 1);
const loadedSnapshot = await loadRealSeasonMemorySnapshot(client, context);
assert.equal(loadedSnapshot.unlinkedCount, 2);
const partialSnapshot = await loadRealSeasonMemorySnapshot(client, context, { includeIndividual: true });
assert.equal(partialSnapshot.matches.length, 1);
assert.equal(partialSnapshot.individualError, 'No se pudieron verificar los datos individuales.');
assert.ok(calls.some((item) => item[0] === 'partidos' && item[1] === 'eq'
  && item[2] === 'club_team_season_id' && item[3] === ctsId));
assert.ok(calls.some((item) => item[0] === 'partidos' && item[1] === 'is'
  && item[2] === 'club_team_season_id' && item[3] === null));

// Contexto, autorización y atribución.
assert.equal(context.teamName, 'Almadina SC');
assert.equal(context.displayName, 'Almadina SC Sub-23');
assert.throws(() => resolveSeasonMemoryContexts({ membership, links, seasons: [], teams, ownTeams }), /temporada/);
assert.throws(() => resolveSeasonMemoryContexts({ membership, links, seasons, teams, ownTeams: [...ownTeams, { ...ownTeams[0], id: 'other' }] }), /único/);
assert.throws(() => resolveSeasonMemoryContexts({ membership: { ...membership, role: 'player' }, links, seasons, teams, ownTeams }), /acceso/);
assert.equal(build([match('other', { club_team_season_id: 'other-cts' })]).excluded.otherContext, 1);
assert.equal(build([match('caudal', { home_team: 'C.D. Caudal' })]).excluded.teamContradiction, 1);
assert.equal(build([match('unlinked', { club_team_season_id: null })], { unlinkedCount: 1 }).excluded.unlinked, 1);
assert.equal(build([match('outside', { date: '2027-07-01' })]).excluded.invalidDate, 1);

// Resultados: estados, marcador completo, futuro y doble conteo.
assert.equal(build([match('scheduled', { status: 'Previa' })]).totals.played, 0);
assert.equal(build([match('future', { date: '2027-05-01' })]).totals.played, 0);
assert.equal(build([match('incomplete', { home_score: '', away_score: '', goals_for: '', goals_against: '' })]).totals.played, 0);
assert.equal(build([match('win')]).totals.wins, 1);
assert.equal(build([match('draw', { home_score: '0', away_score: '0', goals_for: '0', goals_against: '0' })]).totals.draws, 1);
assert.equal(build([match('loss', { home_score: '0', away_score: '2', goals_for: '0', goals_against: '2' })]).totals.losses, 1);
assert.equal(build([match('conflicting-score', { goals_for: '9' })]).totals.played, 0);
assert.equal(build([match('duplicate'), match('duplicate')]).totals.played, 1);

// Catálogo: identidad individual, discrepancias y categoría desconocida.
const competitionModel = build([match('a', { competition_id: 'copa-1', competition_key: 'copa_rfef' }),
  match('b', { competition_id: 'copa-2', competition_key: 'copa_b' })]);
assert.equal(competitionModel.competitions.length, 2);
assert.equal(competitionModel.competitions[0].kind, 'cup');
assert.equal(build([match('bad-key', { competition_key: 'friendly' })]).excluded.competitionConflict, 1);
assert.equal(build([match('bad-season', { competition_id: 'old-cup', competition_key: 'copa_rfef' })],
  { catalog: [...catalog, { id: 'old-cup', club_id: clubId, key: 'copa_rfef',
    name: 'Copa antigua', season: '2025/26' }] }).excluded.competitionConflict, 1);
assert.equal(resolveSeasonMemoryCompetition(match('unknown', { competition_id: null,
  competition_key: null, type: 'Torneo no clasificado' }), catalog, clubId).id, 'unknown');
assert.equal(resolveSeasonMemoryCompetition(match('legacy', { competition_id: null,
  competition_key: null, type: 'Amistoso' }), catalog, clubId).kind, 'friendly');
assert.equal(resolveSeasonMemoryCompetition(match('generic-cup', { competition_id: null,
  competition_key: null, type: 'Copa' }), catalog, clubId).conflict,
  'Tipo legacy no unívoco en el catálogo');
assert.equal(resolveSeasonMemoryCompetition(match('single-cup', { competition_id: null,
  competition_key: null, type: 'Copa' }), [catalog[1]], clubId).id, 'catalog:copa-1');

// Cobertura: cero medido frente a ausencia, media parcial y sumas por competición.
const full = build([match('a', { shots: '0', possession: '' }),
  match('b', { competition_id: 'copa-1', competition_key: 'copa_rfef',
    home_score: '1', away_score: '2', goals_for: '1', goals_against: '2', shots: '10', possession: '60%' })]);
assert.equal(full.metrics.find((item) => item.key === 'shots').covered, 2);
assert.equal(full.metrics.find((item) => item.key === 'shots').average, 5);
assert.equal(full.metrics.find((item) => item.key === 'possession').covered, 1);
assert.equal(full.metrics.find((item) => item.key === 'possession').average, 60);
assert.equal(full.totals.played, full.competitions.reduce((n, item) => n + item.totals.played, 0));
assert.equal(full.totals.goalsFor, full.competitions.reduce((n, item) => n + item.totals.goalsFor, 0));
assert.deepEqual(full.matches.map((item) => item.id), ['a', 'b']);
const onlyCup = build(full.matches.map((item) => item.raw), { competitionId: 'catalog:copa-1' });
assert.equal(onlyCup.selection, 'competition');
assert.equal(onlyCup.totals.played, 1);
assert.equal(onlyCup.competitions.length, 1);

const crest = readFileSync(new URL('../../public/branding/almadina-sc-crest.png', import.meta.url));
const crestDataUrl = `data:image/png;base64,${crest.toString('base64')}`;
const pdf = createRealSeasonMemoryPdf({ model: full, crestDataUrl });
assert.ok(pdf.getNumberOfPages() >= 9);
assert.ok(pdf.output().startsWith('%PDF-'));
const pageText = pdf.internal.pages.flat().join(' ');
assert.ok(!pageText.includes('DEMOSTRACIÓN') && !pageText.includes('DATOS FICTICIOS'));
assert.ok(pageText.includes('Liga Sub-23') && pageText.includes('Copa A'));
const long = build(Array.from({ length: 50 }, (_, i) => match(`long-${i}`, {
  date: `2026-10-${String(i % 28 + 1).padStart(2, '0')}`,
})));
const longPdf = createRealSeasonMemoryPdf({ model: long, crestDataUrl });
assert.ok(longPdf.getNumberOfPages() > pdf.getNumberOfPages());
if (process.env.SEASON_MEMORY_FIXTURE_PDF) {
  writeFileSync(process.env.SEASON_MEMORY_FIXTURE_PDF, Buffer.from(longPdf.output('arraybuffer')));
}
const demo = createSeasonMemoryPdf({ data: buildSeasonMemoryPresentation(SEASON_MEMORY_DEMO), crestDataUrl });
assert.equal(demo.getNumberOfPages(), 3);
console.log('Memoria de Temporada 2B.1: contexto, partidos, competiciones, cobertura y PDF OK');
