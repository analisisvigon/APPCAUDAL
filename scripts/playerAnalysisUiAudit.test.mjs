import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const app = read('src/PlayerApp.jsx');
const navigation = read('src/components/player/PlayerNavigation.jsx');
const panel = read('src/components/player/PlayerAnalysisPanel.jsx');
const production = read('src/components/player/PlayerAnalysisProduction.jsx');
const history = read('src/components/player/PlayerAnalysisHistory.jsx');
const zoneMap = read('src/components/player/PlayerAnalysisZoneMap.jsx');
const domainState = read('src/components/player/PlayerAnalysisDomainState.jsx');
const placeholder = read('src/components/player/PlayerMatchesPlaceholder.jsx');
const store = read('src/data/playerAnalysisStore.js');
const presentation = read('src/utils/playerAnalysisPresentation.js');
const branch = [app, navigation, panel, production, history, zoneMap, domainState, placeholder, store, presentation].join('\n');
const liveSection = panel.slice(panel.indexOf('function LiveSection'), panel.indexOf('export default function PlayerAnalysisPanel'));

assert.deepEqual(
  [...store.matchAll(/^\s*(?:overview|live|production|history): '([^']+)'/gm)].map((match) => match[1]),
  [
    'get_my_player_analysis_overview',
    'get_my_player_analysis_live_stats',
    'get_my_player_production_actions',
    'get_my_player_match_history',
  ],
  'El store inventaría exactamente las cuatro RPC PLAYER ricas.',
);
assert.equal((store.match(/client\.rpc\(/g) || []).length, 1, 'Las RPC pasan por un único ejecutor seguro.');
assert.match(store, /client\.rpc\(rpcName, payload\)/);
assert.doesNotMatch(store, /get_my_player_analysis_summary/);
assert.doesNotMatch(store, /\.from\s*\(/, 'Mi análisis no consulta tablas directamente.');
assert.doesNotMatch(store, /p_(?:jugador|user|membership|player)_id/i, 'No acepta identidad externa.');
assert.match(store, /p_competition_scope/);
assert.match(store, /p_venue/);
assert.match(store, /p_window/);
assert.match(store, /p_limit/);
assert.match(store, /p_offset/);
assert.match(store, /PLAYER_ANALYSIS_PAGE_SIZE = 25/);
assert.match(store, /appendUniquePlayerHistory/);

for (const forbidden of [
  './App', 'getJugadores', 'globalPlayerStore', 'performanceLoadStore', 'authenticatedDataLoad',
  'training_sessions', 'team average', 'ranking', 'scouting', 'prioridad', 'vigilar',
]) assert.equal(branch.toLowerCase().includes(forbidden.toLowerCase()), false, `Mi análisis PLAYER no contiene ${forbidden}.`);

for (const forbiddenIdentity of [
  'Borja', 'Jairo',
  '350615a9-b068-450a-b867-da30a59b9082',
  '2e0146e9-e9fc-45ad-b055-edc138a85f7e',
  'f7f5aaeb-e82b-4e6b-8920-694bc32cb6c7',
]) assert.equal(branch.includes(forbiddenIdentity), false, `No debe hardcodearse ${forbiddenIdentity}.`);

for (const option of ['Temporada', 'Todos', 'Liga', 'Copa RFEF', 'Play Off', 'Amistoso', 'Local', 'Visitante']) {
  assert.ok(presentation.includes(option), `Falta filtro ${option}.`);
}
for (const mapping of ['season', 'all', 'league', 'copa_rfef', 'playoff', 'friendly', 'home', 'away']) {
  assert.ok(presentation.includes(`'${mapping}'`), `Falta mapping ${mapping}.`);
}
for (const mapping of ['last_3_event_matches', 'last_5_event_matches', 'full_scope']) {
  assert.ok(presentation.includes(`'${mapping}'`), `Falta ventana ${mapping}.`);
}
assert.match(panel, /\[client, competitionScope, venue\]/, 'Overview/producción se sincronizan por filtros.');
assert.match(panel, /\[client, competitionScope, venue, liveWindow\]/, 'Live añade su ventana al mismo ámbito.');
assert.match(panel, /usePlayerAnalysisHistory\(client, competitionScope, venue\)/);

for (const label of [
  'Principales', 'Minutos', 'Partidos', 'Titularidades', 'Participación',
  'Producción', 'Goles', 'Asistencias', 'G+A', 'Disciplina', 'Amarillas', 'Rojas',
]) assert.ok(panel.includes(label), `Overview sin ${label}.`);
assert.equal((panel.match(/<DenseMetric /g) || []).length, 4, 'Solo Participación conserva cuatro tarjetas KPI principales.');
assert.equal((panel.match(/<ProductionMetricRow /g) || []).length, 3, 'Producción agrupa total y /90 en tres filas.');
for (const field of [
  'overview.goals', 'overview.goalsPer90', 'overview.assists', 'overview.assistsPer90',
  'overview.goalContributions', 'overview.goalContributionsPer90',
  'overview.yellowCards', 'overview.redCards',
]) assert.ok(panel.includes(field), `Overview pierde ${field}.`);
assert.doesNotMatch(panel, /title="Producción por 90'/, 'Producción total y /90 ya no duplican bloques.');
assert.match(panel, /PLAYER_ANALYSIS_PARTIAL_NOTE/);
assert.match(presentation, /Dato disponible parcialmente/);
assert.doesNotMatch(panel, />\s*(?:PARTIAL|COMPLETE|UUID|legacy)\s*</i);
assert.doesNotMatch(panel, /Lesi[oó]n/i);
assert.match(panel, /Tu rendimiento en el periodo seleccionado\./);
assert.doesNotMatch(panel, /en un único ámbito coherente|Solo datos validados|nunca eventos individuales/i);

for (const label of [
  'Registro en vivo', 'Finalización', 'Con balón', 'Defensivo', 'Goles / partido', 'Tiros / partido',
  'A puerta / partido', '% tiros a puerta', 'Centros / partido', 'Pérdidas / partido',
  'Robos / partido', 'Faltas realizadas', 'Faltas recibidas',
]) assert.ok(panel.includes(label), `Live sin ${label}.`);
assert.match(panel, /partido analizado/);
assert.match(panel, /partidos analizados/);
assert.equal((panel.match(/<LiveMetricGroup /g) || []).length, 1, 'Los tres grupos se generan desde una única estructura compacta.');
assert.match(panel, /metricGroups\.map/);
assert.doesNotMatch(liveSection, /style=\{\{\s*width|<progress|<meter/i, 'Live no inventa escalas visuales.');
assert.doesNotMatch(liveSection, /(?:bg|text)-(?:emerald|amber|red)-/, 'Live no aplica semáforos evaluativos.');
assert.doesNotMatch(panel, /Solo validados|Todos los registros/);
assert.match(panel, /live\.matchesWithEvents === 0/);

for (const label of [
  'Zonas de tiro', 'Zonas de asistencia', 'Zonas de portería', 'Cómo marca', 'Tipo de gol',
  'Conexiones', 'Detalle de acciones', 'Todos', 'Goles', 'Asistencias',
]) assert.ok(production.includes(label), `Producción sin ${label}.`);
assert.doesNotMatch(production, /Videoteca|Vídeo permitido/i, 'Videoteca queda eliminada sin duplicar acciones.');
assert.doesNotMatch(production, /sanitizad/i, 'El copy PLAYER evita terminología técnica.');
assert.match(production, /target="_blank"/);
assert.match(production, /rel="noopener noreferrer"/);
assert.match(production, /!action\.videoAvailable \|\| !isAllowedPlayerAnalysisVideo\(action\.videoUrl\)/);
assert.match(production, /<SafeVideoLink action=\{action\} compact \/>/, 'Detalle de acciones conserva el vídeo autorizado.');
assert.doesNotMatch(production, /window\.open/);
assert.doesNotMatch(production, /onClick=.*counterpartName|href=.*counterpartName/);
assert.match(zoneMap, /grid grid-cols-3 grid-rows-3/);
assert.match(presentation, /if \(!allowed\.has\(key\)\) return/);
assert.match(production, /map\.zones\.some\(\(zone\) => zone\.count > 0\)/, 'Los mapas vacíos no se renderizan.');
assert.match(production, /getPlayerZoneMapGridClass\(visibleZoneMaps\.length\)/);
assert.match(presentation, /visibleMapCount === 1[\s\S]*max-w-md/);
assert.match(presentation, /visibleMapCount === 2[\s\S]*max-w-4xl sm:grid-cols-2/);
assert.match(presentation, /sm:grid-cols-2 xl:grid-cols-3/, 'Tres mapas usan tres columnas solo en desktop ancho.');

for (const label of ['Fecha', 'Rival', 'Resultado', 'Competición', 'L/V', 'Rol', 'Min', 'Goles', 'Asist.', 'TA', 'TR']) {
  assert.ok(history.includes(label), `Historial sin ${label}.`);
}
assert.match(history, /lg:hidden/, 'El historial móvil usa cards.');
assert.match(history, /hidden overflow-x-auto lg:block/, 'La tabla solo aparece en desktop.');
assert.match(history, /Ver más/);
assert.match(history, /Cargando…/);
assert.match(history, /Lo ya cargado sigue disponible/);
assert.match(history, /resolvePlayerHistoryVideoUrls\(state\.rows, productionActions\)/);
assert.match(history, /href=\{videoUrl\}/);
assert.match(history, /target="_blank"/);
assert.match(history, /rel="noopener noreferrer"/);
assert.match(history, /Vídeo en Detalle de acciones/, 'La ambigüedad queda como indicador no interactivo.');
assert.doesNotMatch(history, /hasAllowedVideo \? <span[^>]*>\s*▶/, 'Historial no crea un botón falso desde el booleano.');
assert.match(presentation, /matchingVideoUrls\.length === 1 \? matchingVideoUrls\[0\] : null/);
assert.doesNotMatch(history, /\b(?:rating|injured|notes|sistema|PRE|POST)\b/i);

assert.match(panel, /usePlayerAnalysisDomain/);
assert.match(panel, /Promise|\.then\(/, 'Los dominios cargan de forma asíncrona independiente.');
assert.match(domainState, /Reintentar/);
assert.match(domainState, /No se pudo cargar este bloque/);
assert.doesNotMatch(domainState, /error\.message|error_message|details/);

assert.doesNotMatch(branch, /Posiciones utilizadas|Disponible próximamente/, 'Posiciones queda oculto hasta disponer de RPC.');
for (const forbiddenPrivacy of [
  /\brating\b/i, /\binjured\b/i, /\bpost_video_link\b/i, /\bscorer_id\b/i,
  /\bassistant_id\b/i, /\bjugador_id\b/i, /\bmembership_id\b/i,
]) assert.doesNotMatch([panel, production, history, presentation].join('\n'), forbiddenPrivacy);

assert.deepEqual(
  [...navigation.matchAll(/\['(home|analysis|matches|performance)', '([^']+)'\]/g)].map((match) => match[2]),
  ['Inicio', 'Mi análisis', 'Partidos', 'Rendimiento'],
);
assert.match(app, /activeSection === 'analysis' \? <PlayerAnalysisPanel client=\{client\}/);
assert.match(app, /activeSection === 'matches' \? <PlayerMatchesPlaceholder/);
assert.match(placeholder, /Próximamente/);
assert.doesNotMatch(branch, /get_my_player_matches/, 'Partidos sigue sin implementación.');

assert.match(panel, /flex min-w-0 flex-wrap gap-2 sm:flex-nowrap/);
assert.match(panel, /grid grid-cols-2 gap-2 sm:grid-cols-4/);
assert.match(panel, /grid min-w-0 gap-3 lg:grid-cols-3/);
assert.match(production, /filteredActions\.length === 1 \? 'max-w-2xl' : 'lg:grid-cols-2'/);
assert.match(production, /mt-4 max-w-xl/, 'Una conexión no fuerza una tarjeta sobredimensionada.');
assert.match(panel, /productionActions=\{productionState\.status === 'ready' \? productionState\.data : \[\]\}/);
assert.match(history, /grid-cols-3 gap-1\.5 min-\[390px\]:grid-cols-6/);
assert.doesNotMatch([panel, production, zoneMap].join('\n'), /overflow-x-auto|min-w-\[[4-9]\d\dpx\]/, 'Los bloques móviles no fuerzan scroll horizontal.');
assert.match(domainState, /min-h-\[44px\]/);
assert.match(history, /min-h-\[46px\]/);

console.log('Player Mi análisis rico: RPC, filtros, dominios, producción, historial, privacidad y responsive validados.');
