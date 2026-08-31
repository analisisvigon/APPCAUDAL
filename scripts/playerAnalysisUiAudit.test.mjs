import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const app = read('src/PlayerApp.jsx');
const navigation = read('src/components/player/PlayerNavigation.jsx');
const panel = read('src/components/player/PlayerAnalysisPanel.jsx');
const placeholder = read('src/components/player/PlayerMatchesPlaceholder.jsx');
const store = read('src/data/playerAnalysisStore.js');
const presentation = read('src/utils/playerAnalysisPresentation.js');
const branch = [app, navigation, panel, placeholder, store, presentation].join('\n');

assert.deepEqual(
  [...store.matchAll(/\.rpc\(\s*([A-Z_]+)/g)].map((match) => match[1]),
  ['ANALYSIS_RPC'],
  'El loader llama exclusivamente a su RPC propia.',
);
assert.match(store, /ANALYSIS_RPC = 'get_my_player_analysis_summary'/);
assert.match(store, /client\.rpc\(ANALYSIS_RPC\)/, 'La RPC no recibe argumentos.');
assert.doesNotMatch(store, /client\.rpc\(ANALYSIS_RPC\s*,/, 'No existe payload controlable por el cliente.');
assert.doesNotMatch(store, /\.from\s*\(/, 'Mi análisis no consulta tablas directamente.');
assert.doesNotMatch(store, /function loadPlayerAnalysisSummary\([^)]*,/, 'El loader no acepta identidad externa.');

for (const forbidden of [
  './App', 'getJugadores', 'globalPlayerStore', 'performanceLoadStore', 'authenticatedDataLoad',
  'training_sessions', 'team average', 'ranking', 'scouting', 'prioridad', 'vigilar',
]) {
  assert.equal(branch.toLowerCase().includes(forbidden.toLowerCase()), false, `Mi análisis PLAYER no debe contener ${forbidden}.`);
}
for (const forbiddenIdentity of [
  'Borja', 'Jairo',
  '350615a9-b068-450a-b867-da30a59b9082',
  '2e0146e9-e9fc-45ad-b055-edc138a85f7e',
  'f7f5aaeb-e82b-4e6b-8920-694bc32cb6c7',
]) {
  assert.equal(branch.includes(forbiddenIdentity), false, `No debe hardcodearse ${forbiddenIdentity}.`);
}

assert.match(panel, /¿Cómo voy esta temporada\?/);
for (const label of ['Partidos', 'Minutos', 'Titularidades', 'Goles', 'Asistencias', 'Participación', 'Producción', 'Disciplina', 'Amarillas', 'Rojas']) {
  assert.match(panel, new RegExp(label), `La presentación debe incluir ${label}.`);
}
assert.match(panel, /PLAYER_ANALYSIS_PARTIAL_NOTE/);
assert.match(presentation, /Dato disponible parcialmente/);
assert.doesNotMatch(panel, /['"](?:PARTIAL|UUID|legacy|scorer_id)['"]/, 'La UI no renderiza terminología técnica de cobertura.');
assert.match(panel, /contributionsPartial/);
assert.match(presentation, /goals \+ assists/);
assert.match(presentation, /matches > 0/);
assert.match(panel, /invalid_session/);
assert.match(panel, /identity_invalid/);
assert.match(panel, /Reintentar/);

assert.deepEqual(
  [...navigation.matchAll(/\['(home|analysis|matches|performance)', '([^']+)'\]/g)].map((match) => match[2]),
  ['Inicio', 'Mi análisis', 'Partidos', 'Rendimiento'],
  'La navegación PLAYER contiene exactamente los cuatro destinos acordados.',
);
assert.match(navigation, /'Salir'/);
assert.match(navigation, /grid-cols-2[^"]*sm:grid-cols-4/, 'La navegación se apila sin desbordar en móvil.');
assert.match(navigation, /min-h-\[44px\]/);
assert.match(app, /activeSection === 'analysis' \? <PlayerAnalysisPanel client=\{client\}/);
assert.match(app, /activeSection === 'matches' \? <PlayerMatchesPlaceholder/);
assert.doesNotMatch(branch, /get_my_player_matches/, 'Partidos sigue sin endpoint ni implementación.');
assert.match(placeholder, /Próximamente/);

assert.match(app, /px-3 py-3[^"]*sm:px-4/);
assert.match(app, /overflow-x-clip/);
assert.match(panel, /grid grid-cols-2 gap-2\.5 sm:grid-cols-5/);
assert.match(panel, /grid grid-cols-1 gap-2 min-\[360px\]:grid-cols-3/, 'Producción se apila a 320 px.');
assert.match(panel, /lg:grid-cols-\[1\.1fr_0\.9fr\]/);
assert.doesNotMatch(branch, /<table|overflow-x-auto|min-w-\[[4-9]\d\dpx\]/, 'No hay tablas ni anchos que fuercen scroll horizontal.');
assert.match(panel, /min-h-\[46px\]/, 'Retry conserva un touch target seguro.');

console.log('Player Mi análisis UI audit: navegación, privacidad, presentación y responsive validados.');
