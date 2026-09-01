import assert from 'node:assert/strict';
import {
  PLAYER_MATCHES_RPC,
  PlayerMatchesLoadError,
  isAllowedPlayerMatchVideo,
  loadMyPlayerMatches,
  normalizePlayerMatch,
  normalizePlayerMatchTimeline,
} from './playerMatchesStore.js';

const makeClient = (data = [], error = null) => {
  const calls = [];
  return {
    calls,
    rpc(...args) {
      calls.push(args);
      return Promise.resolve({ data, error });
    },
  };
};

const rawRows = [
  {
    partido_id: 'match-new',
    match_date: '2026-08-30',
    opponent: 'Rival A',
    opponent_crest: 'https://images.example/rival-a.png',
    is_home: false,
    home_team: 'Rival A',
    away_team: 'C.D. Caudal',
    home_score: '0',
    away_score: 2,
    stadium: 'Campo A',
    competition_key: 'copa_rfef',
    competition_name: 'Copa RFEF',
    competition_logo_url: 'https://images.example/copa.png',
    match_round: 'Jornada 2',
    timeline: [
      {
        event_type: 'Gol a favor',
        minute: 12,
        player_name: 'Jugador A',
        assistant_name: 'Jugador B',
        card_count: null,
        video_url: 'https://youtu.be/allowed',
      },
      {
        event_type: 'Amarilla',
        minute: null,
        player_name: 'Jugador C',
        assistant_name: null,
        card_count: '2',
        video_url: null,
      },
      { event_type: 'Cambio de sistema', player_name: 'Dato privado' },
    ],
  },
  {
    partido_id: 'match-old',
    match_date: '2026-08-23',
    is_home: true,
    home_score: null,
    away_score: '1',
    timeline: null,
  },
];

const client = makeClient(rawRows);
const matches = await loadMyPlayerMatches(client);
assert.equal(PLAYER_MATCHES_RPC, 'get_my_player_matches');
assert.deepEqual(client.calls, [['get_my_player_matches']], 'La RPC se invoca sin payload ni identidad externa.');
assert.deepEqual(matches.map((match) => match.partidoId), ['match-new', 'match-old'], 'El orden recibido se conserva.');
assert.equal(matches[0].isHome, false);
assert.equal(matches[0].homeScore, '0', 'Un cero real no se confunde con un marcador pendiente.');
assert.equal(matches[0].awayScore, '2');
assert.equal(matches[0].timeline.length, 2, 'Solo sobreviven los cuatro tipos públicos permitidos.');
assert.equal(matches[0].timeline[0].videoUrl, 'https://youtu.be/allowed');
assert.equal(matches[0].timeline[1].cardCount, 2);
assert.equal(matches[1].homeScore, null);
assert.equal(matches[1].timeline.length, 0);

const normalized = normalizePlayerMatch({
  match_date: '30/08/2026',
  is_home: 'unexpected',
  home_score: '-1',
  opponent_crest: 'javascript:alert(1)',
  competition_logo_url: 'http://mixed-content.example/logo.png',
});
assert.equal(normalized.matchDate, null);
assert.equal(normalized.isHome, null);
assert.equal(normalized.homeScore, null);
assert.equal(normalized.opponentCrest, null);
assert.equal(normalized.competitionLogoUrl, null);

assert.deepEqual(normalizePlayerMatchTimeline(null), []);
assert.deepEqual(normalizePlayerMatchTimeline({}), []);
assert.equal(normalizePlayerMatchTimeline([
  { event_type: 'Roja', minute: -2, player_name: ' A ', card_count: 1 },
])[0].minute, null);

for (const url of [
  'https://youtu.be/video',
  'https://youtube.com/watch?v=video',
  'https://www.youtube.com/watch?v=video',
  'https://m.youtube.com/watch?v=video',
]) assert.equal(isAllowedPlayerMatchVideo(url), true, `${url} debe estar permitido.`);
for (const url of [
  'http://youtu.be/video',
  'https://youtube.com.evil.example/video',
  'https://vimeo.com/video',
  'javascript:alert(1)',
  '',
]) assert.equal(isAllowedPlayerMatchVideo(url), false, `${url || 'vacío'} debe rechazarse.`);

assert.deepEqual(await loadMyPlayerMatches(makeClient(null)), [], 'Una respuesta nula se normaliza como vacía.');
await assert.rejects(
  () => loadMyPlayerMatches(makeClient({}, null)),
  (error) => error instanceof PlayerMatchesLoadError && error.kind === 'invalid_response',
);
await assert.rejects(
  () => loadMyPlayerMatches(makeClient([], { message: 'offline' })),
  (error) => error instanceof PlayerMatchesLoadError && error.kind === 'network',
);
await assert.rejects(
  () => loadMyPlayerMatches(makeClient([], { status: 401, message: 'JWT expired' })),
  (error) => error instanceof PlayerMatchesLoadError && error.kind === 'invalid_session',
);
await assert.rejects(
  () => loadMyPlayerMatches(null),
  (error) => error instanceof PlayerMatchesLoadError && error.kind === 'invalid_session',
);

console.log('playerMatchesStore: RPC única, orden, nulls, timeline y vídeos validados.');
