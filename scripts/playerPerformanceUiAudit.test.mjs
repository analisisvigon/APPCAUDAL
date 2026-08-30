import assert from 'node:assert/strict';
import fs from 'node:fs';

const store = fs.readFileSync(new URL('../src/data/playerPerformanceStore.js', import.meta.url), 'utf8');
const panel = fs.readFileSync(
  new URL('../src/components/player/PlayerPerformancePanel.jsx', import.meta.url),
  'utf8',
);
const app = fs.readFileSync(new URL('../src/PlayerApp.jsx', import.meta.url), 'utf8');
const branch = `${app}\n${panel}\n${store}`;

assert.deepEqual(
  [...store.matchAll(/^\s*['"](wellness_entries|rpe_entries)['"],$/gm)].map((match) => match[1]),
  ['wellness_entries', 'rpe_entries'],
  'El loader PLAYER solo puede consultar Wellness y RPE.',
);
assert.doesNotMatch(store, /\.eq\(\s*['"]jugador_id['"]/, 'La identidad no se controla mediante un filtro de cliente.');
assert.doesNotMatch(store, /\.filter\([^\n]*jugador_id/, 'No se filtra un dataset global por jugador en cliente.');
assert.match(store, /\.order\('entry_date', \{ ascending: false \}\)/, 'Ambos históricos usan la fecha semántica.');
assert.match(store, /\.range\(offset, offset \+ limit\)/, 'Las consultas están limitadas y paginadas.');
assert.match(store, /PLAYER_PERFORMANCE_PAGE_SIZE = 8/, 'La página inicial tiene un tamaño móvil razonable.');
assert.match(store, /receivedRows\.slice\(0, limit\)/, 'La fila extra solo detecta si hay más resultados.');
assert.match(store, /appendUniquePlayerEntries/, 'Las páginas se deduplican sin reemplazar respuestas cargadas.');
assert.doesNotMatch(store, /^\s*['"]jugador_id['"],$/m, 'La proyección PLAYER no necesita recibir jugador_id.');
assert.match(store, /comment: normalizeOptionalText\(row\?\.comment\)/, 'El comentario procede de la misma fila.');
assert.match(store, /discomfort: normalizeOptionalText\(row\?\.discomfort\)/, 'La molestia procede de la misma fila.');
assert.doesNotMatch(store, /health_ratio|submitted_at|created_at|updated_at/, 'No se descargan campos internos o técnicos.');

for (const forbidden of [
  'getPerformanceDashboard',
  'getJugadores',
  'performanceLoadStore',
  'globalPlayerStore',
  'authenticatedDataLoad',
  'training_sessions',
  'training_session_load_metrics',
  'rpe_sync_pending',
  'team average',
  'ranking',
]) {
  assert.equal(branch.toLowerCase().includes(forbidden.toLowerCase()), false, `El branch PLAYER no debe contener ${forbidden}.`);
}

assert.match(app, /['"]Mi espacio['"]/);
assert.match(app, /['"]Mi rendimiento['"]/);
assert.match(panel, /Último Wellness/);
assert.match(panel, /Último RPE/);
assert.match(panel, /<LatestWellnessCard entry=\{state\.wellness\[0\] \|\| null\}/, 'Último Wellness usa la primera fila DESC.');
assert.match(panel, /<LatestRpeCard entry=\{state\.rpe\[0\] \|\| null\}/, 'Último RPE usa la primera fila DESC.');
assert.match(panel, /Evolución reciente/);
assert.match(panel, /Histórico Wellness/);
assert.match(panel, /Histórico RPE/);
assert.match(panel, /Estado actual/);
assert.match(panel, /getRpeWorkloadAvailability/, 'La carga usa la regla de fiabilidad ya validada.');
assert.match(panel, /No son U\.C\. externas/, 'La UI diferencia carga RPE interna de U.C. externa.');
assert.match(panel, /No disponible/, 'Duración y carga no fiables se presentan explícitamente como no disponibles.');
assert.match(panel, /invalid_session/);
assert.match(panel, /Reintentar/);
assert.match(panel, /Sin respuestas Wellness/);
assert.match(panel, /Sin respuestas RPE/);
assert.match(panel, /Cargando Wellness/);
assert.match(panel, /Cargando RPE/);
assert.match(panel, /loadMoreWellness/);
assert.match(panel, /loadMoreRpe/);
assert.match(panel, /wellnessRequestInFlightRef\.current/);
assert.match(panel, /rpeRequestInFlightRef\.current/);
assert.match(panel, /state\.wellnessHasMore \? \(/, 'El botón Wellness desaparece cuando no hay más.');
assert.match(panel, /state\.rpeHasMore \? \(/, 'El botón RPE desaparece cuando no hay más.');
assert.match(panel, /wellness: appendUniquePlayerEntries\(current\.wellness, wellnessPage\.rows\)/);
assert.match(panel, /rpe: appendUniquePlayerEntries\(current\.rpe, rpePage\.rows\)/);
assert.match(panel, /Lo ya cargado sigue disponible/);
assert.match(app, /Consulta tus respuestas Wellness y RPE/);
assert.match(app, /focus-visible:ring-2/);
assert.match(panel, /focus-visible:ring-2/);
assert.match(app, /px-3 py-4[^"]*sm:px-4 sm:py-8/, 'El contenedor aprovecha 320 px sin perder márgenes.');
assert.match(panel, /flex flex-wrap items-center justify-between/, 'Las cabeceras históricas pueden envolver en móvil.');
assert.match(panel, /grid gap-4 sm:grid-cols-2/, 'Las tarjetas principales son verticales en móvil.');
assert.doesNotMatch(branch, /<table|overflow-x-auto/, 'PLAYER no traslada tablas de escritorio a móvil.');

for (const forbiddenLabel of [
  'Prioridad',
  'Vigilar',
  'media de plantilla',
  'ranking',
  'alerta PF',
  'cumplimiento',
  'número de respuestas',
]) {
  assert.equal(branch.toLowerCase().includes(forbiddenLabel.toLowerCase()), false, `Privacidad visual: no mostrar ${forbiddenLabel}.`);
}
assert.doesNotMatch(
  `${app}\n${panel}`,
  />\s*(?:session_id|jugador_id|health_ratio|created_at|updated_at|submitted_at)\s*</i,
  'Los nombres técnicos no se renderizan como labels PLAYER.',
);
assert.doesNotMatch(`${app}\n${panel}`, /Supabase/i, 'La UI no menciona la infraestructura al jugador.');
assert.doesNotMatch(`${app}\n${panel}`, /\{(?:response\?\.)?error\.(?:message|details|hint)\}/, 'La UI no imprime errores técnicos recibidos.');

console.log('Player performance UI audit: aislamiento, campos, estados y paginación validados.');
