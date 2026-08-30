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
assert.match(panel, /Evolución reciente/);
assert.match(panel, /Histórico Wellness/);
assert.match(panel, /Histórico RPE/);
assert.match(panel, /getRpeWorkloadAvailability/, 'La carga usa la regla de fiabilidad ya validada.');
assert.match(panel, /No son U\.C\. externas/, 'La UI diferencia carga RPE interna de U.C. externa.');
assert.match(panel, /invalid_session/);
assert.match(panel, /Reintentar/);
assert.match(panel, /Sin respuestas Wellness/);
assert.match(panel, /Sin respuestas RPE/);

console.log('Player performance UI audit: aislamiento, campos, estados y paginación validados.');
