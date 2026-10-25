import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildRealSeasonMemory } from './realModel.js';
import { persistentVideoUrl } from './realMatchLinks.js';
import { createRealSeasonMemoryPdf } from './realPdf.js';

const id = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const clubId = id(1), teamId = id(2), ctsId = id(3), seasonId = id(4), ligaId = id(5), copaId = id(6);
const context = { id: ctsId, clubId, teamId, seasonId, teamName: 'Almadina SC',
  displayName: 'Almadina SC Sub-23', seasonLabel: '2026/27',
  startsOn: '2026-07-01', endsOn: '2027-06-30' };
const catalog = [{ id: ligaId, club_id: clubId, key: 'league', name: 'Liga Sub-23' },
  { id: copaId, club_id: clubId, key: 'cup', name: 'Copa Sub-23' }];
const players = Array.from({ length: 13 }, (_, i) => ({ id: id(100 + i),
  name: i === 0 ? 'Abdelrahman Mohammed Ben Salem Al-Zoubi' : `Jugador ${i + 1}`,
  number: i + 1, global_player_id: id(200 + i), membership_id: id(300 + i),
  active_in_squad: true, stage: { id: id(300 + i), player_id: id(200 + i), team_id: teamId } }));
const makeMatch = (n, competitionId, date, isHome, score, extra = {}) => ({
  id: id(n), club_team_season_id: ctsId, date, time: '18:30', type: competitionId === ligaId ? 'Liga' : 'Copa',
  round: `Jornada ${n - 9}`, opponent: n === 10 ? 'Olympique Sporting Club of Tripoli Extended Name' : 'Rival Copa',
  is_home: isHome, home_team: isHome ? 'Almadina SC' : 'Rival Copa',
  away_team: isHome ? 'Rival Copa' : 'Almadina SC',
  home_score: String(score[0]), away_score: String(score[1]),
  goals_for: String(isHome ? score[0] : score[1]), goals_against: String(isHome ? score[1] : score[0]),
  status: 'Finalizado', competition_id: competitionId,
  competition_key: competitionId === ligaId ? 'league' : 'cup', ...extra });
const matches = [
  makeMatch(10, ligaId, '2026-10-01', true, [2, 1], { stats_system: '4-3-3',
    possession: '57', shots: '11', shots_on_target: '5', corners: '4', yellow_cards: '1',
    post_video_link: 'https://videos.example.org/matches/10.mp4', post_notes: 'Buena presión tras pérdida.' }),
  makeMatch(11, ligaId, '2026-10-08', false, [0, 1], { stats_system: '', post_reality: 'Partido exigente.' }),
  makeMatch(12, copaId, '2026-10-15', true, [0, 0], { stats_system: '',
    post_video_link: 'http://localhost:3000/video.mp4' }),
];
const source = { players,
  slots: [
    ...players.slice(0, 11).map((p, i) => ({ id: id(400 + i), partido_id: id(10), scope: 'stats',
      slot: i, jugador_id: p.id })),
    ...players.slice(0, 7).map((p, i) => ({ id: id(420 + i), partido_id: id(11), scope: 'stats',
      slot: i, jugador_id: p.id })),
  ],
  stats: players.slice(0, 11).map((p, i) => ({ id: id(500 + i), partido_id: id(10),
    jugador_id: p.id, role: 'Titular', minutes: '90', yellow_count: i === 0 ? 1 : 0,
    red: false })),
  substitutions: [{ id: id(601), partido_id: id(11), minute: 70,
    outgoing_jugador_id: players[0].id, incoming_jugador_id: players[11].id }],
  goals: [
    { id: id(701), partido_id: id(10), type: 'Gol a favor', minute: 23,
      scorer_id: players[0].id, assistant_id: players[1].id,
      video_url: 'https://videos.example.org/goals/701.mp4' },
    { id: id(702), partido_id: id(10), type: 'Gol a favor', minute: null,
      scorer_id: players[2].id, assistant_id: null,
      video_url: 'https://videos.example.org/goals/702.mp4' },
    { id: id(703), partido_id: id(10), type: 'Gol en contra', minute: 76,
      scorer_id: null, assistant_id: null, video_url: 'https://videos.example.org/goals/703.mp4' },
    { id: id(704), partido_id: id(11), type: 'Gol a favor', minute: 80,
      scorer_id: players[11].id, assistant_id: null,
      video_url: 'https://videos.example.org/storage/v1/object/sign/704?token=temporary' },
  ],
  quickEvents: [{ id: id(801), partido_id: id(10), jugador_id: players[0].id,
    equipo: 'caudal', tipo_evento: 'falta_realizada', minuto: 31, reviewed: true }],
  postEvents: [{ id: id(811), partido_id: id(10), jugador_id: players[0].id,
    type: 'Presión alta', video_seconds: 135, minute: '2' },
    { id: id(812), partido_id: id(12), jugador_id: players[1].id,
      type: 'Centro', video_seconds: 450, minute: '7' }],
};
const build = (rows = matches, selection = 'all', data = source) => buildRealSeasonMemory({
  context, matches: rows, catalog, individual: data, competitionId: selection,
  now: new Date('2026-11-01T12:00:00Z') });
const model = build();
const [first, second, third] = model.matchCards;
// 1-4: campo sólo con once + sistema; faltas de sistema, once y alineación.
assert.equal(first.positions.length, 11);
assert.equal(first.formation, '4-3-3');
assert.equal(build([{ ...matches[0], stats_system: '4-4-2' }]).matchCards[0].positions.length, 0);
assert.equal(second.positions.length, 0);
assert.equal(second.lineupCoverage, 7);
assert.equal(third.lineupCoverage, 0);
// 5-10: cambios exactos, ausencia de cambios, goles/asistencias, minuto ausente y gol rival.
assert.equal(second.substitutions[0].incoming, players[11].name);
assert.equal(first.substitutions.length, 0);
assert.equal(first.goals[0].scorer, players[0].name);
assert.equal(first.goals[0].assistant, players[1].name);
assert.equal(first.timeline.at(-1).minute, null);
assert.equal(first.goals.find((row) => row.team === 'rival').scorer, null);
// 11-14: tarjetas, métricas propias, competiciones, filtro de una competición.
assert.equal(first.stats.find((row) => row.player === players[0].name).yellow, 1);
assert.equal(first.metrics.find((row) => row.label === 'Posesión').value, '57%');
assert.equal(first.metrics.some((row) => row.rival), false);
assert.equal(model.competitions.length, 2);
assert.deepEqual(build(matches, `catalog:${copaId}`).matchCards.map((card) => card.id), [id(12)]);
// 15-19: vídeo real, varios, rechazo de URL temporal, localhost y protocolo inseguro.
assert.equal(first.videos.length, 5);
assert.ok(first.videos.some((item) => item.label.includes('2:15') && item.url.endsWith('#t=135')));
assert.equal(second.videos.length, 0);
assert.equal(second.rejectedVideos, 1);
assert.equal(third.rejectedVideos, 1);
assert.equal(persistentVideoUrl('https://localhost/video'), null);
assert.equal(persistentVideoUrl('http://videos.example.org/clip'), null);
assert.equal(persistentVideoUrl('https://videos.example.org/clip'), 'https://videos.example.org/clip');
// 20-23: muchos eventos, nombres largos, sin duplicados, coherencia con 2B.2.
const busy = { ...source, quickEvents: [...source.quickEvents,
  ...Array.from({ length: 120 }, (_, i) => ({ id: id(900 + i), partido_id: id(10),
    jugador_id: players[0].id, equipo: 'caudal', tipo_evento: 'recuperacion',
    minuto: i + 1, reviewed: true }))] };
assert.equal(build(matches, 'all', busy).matchCards[0].timeline.length, 4);
assert.ok(build(matches, 'all', busy).matchCards[0].quickTotals.some((row) =>
  row.type === 'recuperacion' && row.count === 120));
assert.ok(first.match.opponent.length > 30 && players[0].name.length > 30);
assert.equal(build([matches[0], matches[0]]).matchCards.length, 1);
assert.equal(first.stats.find((row) => row.player === players[0].name).knownGoals,
  model.individual.rows.find((row) => row.id === players[0].id).contributions[0].knownGoals);
const crest = readFileSync(new URL('../../public/branding/almadina-sc-crest.png', import.meta.url));
const crestDataUrl = `data:image/png;base64,${crest.toString('base64')}`;
const pdf = createRealSeasonMemoryPdf({ model: build(matches, 'all', busy), crestDataUrl,
  syntheticQa: true });
const longNotes = matches.map((row, i) => i === 0 ? { ...row,
  post_notes: 'Observación deportiva extensa registrada para comprobar paginación. '.repeat(90) } : row);
const longPdf = createRealSeasonMemoryPdf({ model: build(longNotes, 'all', busy), crestDataUrl });
assert.ok(longPdf.getNumberOfPages() > pdf.getNumberOfPages());
assert.ok(longPdf.internal.pages.some((row) => row.join(' ').includes('CONTINUACI')));
const pages = pdf.internal.pages.map((row) => row.join(' '));
const pdfBytes = Buffer.from(pdf.output('arraybuffer'));
assert.ok(pdf.getNumberOfPages() > 10);
assert.ok(pages.join(' ').includes('DATOS FICTICIOS / PRUEBA'));
assert.ok(pages.filter((row) => row.includes('CONTINUACI')).length <= 1);
assert.ok(pages.join(' ').includes('Ficha'));
assert.ok(pages.join(' ').includes('Ver v'));
assert.ok(pdfBytes.toString('latin1').includes('https://videos.example.org/goals/701.mp4'));
assert.ok(!pdfBytes.toString('latin1').includes('token=temporary'));
assert.ok(!pdfBytes.toString('latin1').includes('localhost'));
const output = new URL('../../local-exports/season-memory-qa/match-cards-fixture.pdf', import.meta.url);
mkdirSync(new URL('../../local-exports/season-memory-qa/', import.meta.url), { recursive: true });
writeFileSync(output, pdfBytes);
writeFileSync(new URL('../../local-exports/season-memory-qa/match-cards-continuation-fixture.pdf', import.meta.url),
  Buffer.from(longPdf.output('arraybuffer')));
console.log(`Memoria 2B.3: 23 escenarios, paginación y PDF sintético OK (${pdf.getNumberOfPages()} páginas)`);
