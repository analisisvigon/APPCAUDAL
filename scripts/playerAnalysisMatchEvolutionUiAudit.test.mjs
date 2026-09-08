import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const panel = read('src/components/player/PlayerAnalysisPanel.jsx');
const evolution = read('src/components/player/PlayerAnalysisMatchEvolution.jsx');
const store = read('src/data/playerAnalysisStore.js');
const presentation = read('src/utils/playerAnalysisPresentation.js');
const frontend = [panel, evolution, store, presentation].join('\n');

assert.match(store, /matchStats: 'get_my_player_analysis_match_stats'/);
assert.match(store, /export async function getMyPlayerAnalysisMatchStats/);
assert.match(store, /client\.rpc\(rpcName, payload\)/);
assert.match(store, /p_competition_scope: normalized\.competitionScope/);
assert.match(store, /p_venue: normalized\.venue/);
assert.match(store, /p_window: normalized\.liveWindow/);
assert.doesNotMatch(store, /\.from\s*\(/, 'La evolución solo usa la RPC PLAYER.');
assert.doesNotMatch(store, /p_(?:jugador|player|user|membership)_id/i, 'El frontend no admite identidades ajenas.');

for (const field of [
  'match_id', 'match_date', 'opponent', 'opponent_crest', 'competition_key',
  'competition_name', 'is_home', 'minutes', 'event_count', 'goals', 'shots',
  'shots_on_target', 'shot_accuracy_percentage', 'crosses', 'turnovers', 'steals',
  'fouls_committed', 'fouls_received',
]) assert.ok(store.includes(`row.${field}`), `El adaptador pierde ${field}.`);

assert.equal((panel.match(/getMyPlayerAnalysisMatchStats\(client/g) || []).length, 1, 'Una sola carga alimenta gráfica, máximos y comparador.');
assert.match(panel, /\{ competitionScope, venue, liveWindow \}/);
assert.match(panel, /\[client, competitionScope, venue, liveWindow\]/);
assert.match(panel, /<LiveSection[\s\S]*<PlayerAnalysisMatchEvolution/, 'Las medias permanecen antes de la evolución.');

for (const label of [
  'Evolución partido a partido', 'Consulta cómo cambian tus registros de un partido a otro.',
  'Goles', 'Tiros', 'A puerta', 'Precisión', 'Centros', 'Pérdidas', 'Robos',
  'Faltas realizadas', 'Faltas recibidas', 'Máximos de la temporada', 'Comparar partidos',
]) assert.ok(frontend.includes(label), `Falta ${label}.`);

assert.match(presentation, /PLAYER_ANALYSIS_DEFAULT_MATCH_METRIC = 'shots'/);
assert.match(presentation, /sequenceLabel: `J\$\{index \+ 1\}`/);
assert.match(presentation, /posición cronológica dentro del resultado ya ordenado por la RPC/);
assert.match(evolution, /data-player-match-chart="bars"/);
assert.match(evolution, /aria-pressed=\{selected\}/);
assert.match(evolution, /onSelect\(match\.matchId\)/);
assert.match(evolution, /match\.opponentCrest/);
assert.match(evolution, /<OpponentCrest/);
assert.match(evolution, /getPlayerAnalysisCrestFallback/);
assert.match(evolution, /formatPlayerAnalysisDate\(match\.matchDate\)/);
assert.match(evolution, /getPlayerAnalysisCompetitionLabel\(match\)/);
assert.match(evolution, /match\.isHome === true \? 'Casa'/);
assert.match(evolution, /match\.minutes !== null/);
assert.doesNotMatch(evolution, />\s*\{match\.matchId\}\s*</, 'match_id no se muestra al jugador.');

assert.match(presentation, /buildPlayerAnalysisSeasonMaximums/);
assert.match(presentation, /value === current\.value && isMoreRecentMatch/);
assert.match(presentation, /localeCompare\(clean\(current\.matchId\)\)/);
assert.match(presentation, /value === null \|\| value <= 0/);
assert.match(evolution, /grid grid-cols-2 gap-2 lg:grid-cols-4/);
assert.doesNotMatch(evolution, /(?:emerald|red)-(?:100|200|300|400|500)/, 'Máximos y comparación son neutrales.');

assert.match(presentation, /buildPlayerAnalysisMatchComparison/);
assert.match(presentation, /\{ key: 'minutes', label: 'Minutos'/);
assert.match(evolution, /grid-cols-\[minmax\(52px,1fr\)_minmax\(104px,1\.5fr\)_minmax\(52px,1fr\)\]/);
assert.match(evolution, /Necesitas al menos dos partidos para comparar\./);
assert.doesNotMatch(evolution, /<table|<select/, 'El comparador móvil no usa tabla ni dropdown.');

for (const state of ["state.status === 'loading'", "state.status === 'error'", "state.status === 'ready'"]) {
  assert.ok(evolution.includes(state), `Falta estado UI ${state}.`);
}
assert.match(evolution, /No hay datos partido a partido para este filtro\./);
assert.match(evolution, /onRetry=\{onRetry\}/);
assert.match(evolution, /overflow-hidden p-3\.5 sm:p-4/);
assert.match(evolution, /overflow-x-auto/, 'Los carruseles táctiles contienen su propio overflow.');
assert.match(evolution, /min-h-\[44px\]/);

for (const forbidden of [
  '.from(', 'supabase_', 'club_id', 'membership_id', 'user_id', 'jugador_id',
  'PlayerPerformance', 'PlayerFines', 'FinesManagement', 'STAFF',
]) assert.equal(frontend.includes(forbidden), false, `La rama nueva no debe contener ${forbidden}.`);

for (const hardcodedOpponent of ['Llanes', 'Ceares', 'Real Avilés']) {
  assert.equal(frontend.includes(hardcodedOpponent), false, `No debe hardcodearse el rival ${hardcodedOpponent}.`);
}

console.log('PLAYER evolución partido a partido: RPC única, visual móvil, escudos, máximos, comparador y privacidad validados.');
