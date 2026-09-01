import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const app = read('src/PlayerApp.jsx');
const panel = read('src/components/player/PlayerMatchesPanel.jsx');
const store = read('src/data/playerMatchesStore.js');
const presentation = read('src/utils/playerMatchesPresentation.js');
const source = [app, panel, store, presentation].join('\n');

assert.match(app, /activeSection === 'matches' \? <PlayerMatchesPanel client=\{client\}/);
assert.doesNotMatch(app, /PlayerMatchesPlaceholder/);
assert.equal((store.match(/client\.rpc\(/g) || []).length, 1, 'El store ejecuta una sola llamada RPC.');
assert.match(store, /client\.rpc\(PLAYER_MATCHES_RPC\)/, 'La RPC se invoca sin payload.');
assert.match(store, /PLAYER_MATCHES_RPC = 'get_my_player_matches'/);
assert.doesNotMatch(store, /client\.rpc\([^\n]+,/, 'No se envían parámetros de identidad.');
assert.doesNotMatch(source, /\.from\s*\(/, 'Partidos PLAYER no consulta tablas.');
assert.doesNotMatch(source, /p_(?:jugador|user|club|partido)_id/i);

for (const field of [
  'matchDate', 'opponent', 'opponentCrest', 'isHome', 'homeTeam', 'awayTeam',
  'homeScore', 'awayScore', 'stadium', 'competitionKey', 'competitionName',
  'competitionLogoUrl', 'matchRound', 'timeline',
]) assert.ok(store.includes(field), `Falta normalizar ${field}.`);
for (const field of ['event_type', 'minute', 'player_name', 'assistant_name', 'card_count', 'video_url']) {
  assert.ok(store.includes(field), `Falta leer ${field} del timeline sanitizado.`);
}
for (const eventType of ['Gol a favor', 'Gol en contra', 'Amarilla', 'Roja']) {
  assert.ok(store.includes(eventType), `Falta allowlist de ${eventType}.`);
}
assert.match(store, /if \(!ALLOWED_EVENT_TYPES\.has\(eventType\)\) return \[\]/);

for (const copy of [
  'Partidos', 'Tus partidos con el Caudal.', 'Pendiente', 'Finalizado',
  'Local', 'Visitante', 'Timeline', 'Asistencia:', 'No hay partidos disponibles.',
  'No se pudieron cargar los partidos.', 'Reintentar',
]) assert.ok(source.includes(copy), `Falta estado o contenido ${copy}.`);
assert.match(panel, /match\.matchRound \?/);
assert.match(panel, /match\.stadium \?/);
assert.match(panel, /match\.competitionLogoUrl \?/);
assert.match(panel, /formatPlayerMatchDate\(match\.matchDate\)/);
assert.match(panel, /getPlayerMatchScorePresentation\(match\)/);
assert.match(presentation, /match\.homeScore !== null[\s\S]*match\.awayScore !== null/);
assert.doesNotMatch(presentation, /timeline/i, 'El marcador no se recalcula desde eventos.');
assert.match(presentation, /match\.isHome === true/);
assert.match(presentation, /match\.isHome === false/);
assert.doesNotMatch(presentation, /includes\(|localeCompare\(/, 'La localía no se infiere comparando equipos.');
assert.match(presentation, /OWN_CLUB_IDENTITY\.crest/);

assert.match(panel, /<article[\s\S]*?aria-label=\{matchLabel\}/);
assert.doesNotMatch(panel, /<article[^>]*onClick=/, 'La tarjeta no es clickable.');
assert.doesNotMatch(panel, /cursor-pointer|hover:-translate|openMatch|navigate\(|useNavigate|window\.location/);
for (const forbidden of ['PRE', 'ESTADÍSTICAS', 'POST', 'IMPRESIÓN', 'Editar', 'Eliminar']) {
  const escaped = forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.doesNotMatch(panel, new RegExp(`>\\s*${escaped}\\s*<|['"]${escaped}['"]`, 'i'), `PLAYER no debe renderizar ${forbidden}.`);
}
assert.doesNotMatch(panel, /Acciones del partido|FloatingActionMenu|\.\.\./);
assert.equal((panel.match(/match\.partidoId/g) || []).length, 1, 'partido_id solo se usa como key React.');
assert.match(panel, /key=\{match\.partidoId \|\|/);
assert.doesNotMatch(panel, /href=\{match\.|to=\{match\.|partidoId.*(?:href|route|navigate)/i);

assert.match(store, /url\.protocol === 'https:' && ALLOWED_VIDEO_HOSTS\.has/);
for (const host of ['youtu.be', 'youtube.com', 'www.youtube.com', 'm.youtube.com']) assert.ok(store.includes(host));
assert.match(panel, /isAllowedPlayerMatchVideo\(event\.videoUrl\)/, 'La UI repite la validación del vídeo.');
assert.match(panel, /target="_blank"/);
assert.match(panel, /rel="noopener noreferrer"/);
assert.match(panel, /clickEvent\.stopPropagation\(\)/);
assert.match(panel, /hasVideo \? \(/, 'Sin URL permitida no se renderiza el enlace.');
assert.doesNotMatch(panel, /post_video_link|window\.open/);

assert.match(panel, /state\.status === 'loading'/);
assert.match(panel, /state\.status === 'error'/);
assert.match(panel, /state\.status === 'ready' && state\.rows\.length === 0/);
assert.match(panel, /state\.rows\.map\(\(match, index\)/, 'Se conserva el orden devuelto por la RPC.');
assert.doesNotMatch(panel, /\.sort\s*\(/, 'La UI no reordena arbitrariamente.');

assert.match(panel, /grid-cols-\[minmax\(0,1fr\)_minmax\(98px,auto\)_minmax\(0,1fr\)\]/);
assert.match(panel, /min-\[390px\]/);
assert.match(panel, /xl:grid-cols-2/);
assert.doesNotMatch(panel, /<table|overflow-x-auto|min-w-\[[4-9]\d\dpx\]/, 'No existe tabla ni ancho mínimo horizontal en móvil.');
assert.match(panel, /focus-visible:ring-2/);
assert.match(panel, /aria-label=\{`Ver vídeo/);
assert.match(panel, /alt=\{`Escudo de/);

for (const forbidden of [
  './App', 'getJugadores', 'globalPlayerStore', 'authenticatedDataLoad',
  'partido_eventos_gol', 'partido_estadisticas_jugador', 'supabase.from',
  'scouting', 'lineup', 'snapshot', 'quickEvents', 'notes',
]) assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, `Aislamiento roto por ${forbidden}.`);

console.log('Partidos PLAYER: RPC única, tarjetas seguras, timeline, vídeo, estados y responsive validados.');
