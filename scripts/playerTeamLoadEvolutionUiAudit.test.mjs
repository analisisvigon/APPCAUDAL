import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const panel = read('src/components/player/PlayerPerformancePanel.jsx');
const store = read('src/data/playerPerformanceStore.js');
const evolution = read('src/components/performance/LoadEvolutionSection.jsx');
const loadUtils = read('src/utils/performanceLoad.js');
const presentation = read('src/utils/playerPerformancePresentation.js');

const teamStoreStart = store.indexOf('const normalizePlayerTeamLoad');
const teamStoreEnd = store.indexOf('const normalizePageRequest');
const teamStore = store.slice(teamStoreStart, teamStoreEnd) + store.slice(store.indexOf('export async function getMyTeamLoadEvolution'));
const metricConfig = loadUtils.slice(
  loadUtils.indexOf('export const PERFORMANCE_LOAD_METRIC_CONFIG'),
  loadUtils.indexOf('export const getPerformanceLoadMetricConfig'),
);

assert.match(panel, /<LoadEvolutionSection[\s\S]*?mode="player"/);
assert.match(panel, /<EvolutionSection[\s\S]*?<LoadEvolutionSection/, 'La evolución colectiva queda bajo la evolución personal.');
assert.match(evolution, /EVOLUCIÓN DE CARGA DEL EQUIPO/);
assert.match(evolution, /Consulta cómo evoluciona la carga colectiva de entrenamiento\./);
assert.doesNotMatch(evolution, /Mi carga|Tu carga|Carga individual/);

assert.match(teamStore, /client\.rpc\('get_my_team_load_evolution', \{/);
assert.match(teamStore, /p_start_date: startDate/);
assert.match(teamStore, /p_end_date: endDate/);
assert.doesNotMatch(teamStore, /\.from\(/, 'El acceso colectivo PLAYER no consulta tablas.');
assert.doesNotMatch(panel, /\.from\(['"]training_sessions['"]|\.from\(['"]training_session_load_metrics['"]/);
assert.doesNotMatch(teamStore, /jugador_id|club_id|user_id|membership_id/);
assert.match(store, /PLAYER_TEAM_LOAD_MAX_RANGE_DAYS = 62/);
assert.match(store, /rangeDays > PLAYER_TEAM_LOAD_MAX_RANGE_DAYS/);
assert.match(presentation, /period === 'month'[\s\S]*getPlayerMonthBounds\(anchorDate\)[\s\S]*getPlayerWeekBounds\(anchorDate\)/);

for (const field of [
  'session_date', 'load_units', 'distance_m', 'hsr_m', 'accelerations',
  'decelerations', 'sprints', 'meters_per_minute', 'actual_duration_minutes',
]) assert.match(teamStore, new RegExp(`row\\?\\.${field}`));
for (const forbidden of ['id:', 'scope', 'aggregation_method', 'notes:', 'created_at', 'updated_at']) {
  assert.equal(teamStore.includes(forbidden), false, `El DTO colectivo no expone ${forbidden}.`);
}

assert.equal((metricConfig.match(/enabled: true/g) || []).length, 8);
assert.deepEqual(
  [...metricConfig.matchAll(/label: '([^']+)'[\s\S]*?unit: '([^']+)'[\s\S]*?enabled: true/g)].map((match) => [match[1], match[2]]),
  [
    ['U.C.', 'U.C.'], ['Distancia', 'km'], ['HSR', 'm'], ['ACC', 'acciones'],
    ['DCC', 'acciones'], ['Sprint', 'sprints'], ['M/min', 'm/min'], ['Volumen', 'min'],
  ],
);
assert.match(loadUtils, /\$\{metricConfig\.label\} medio ponderado del equipo/);
assert.match(loadUtils, /aggregation: 'durationWeightedAverage'/);
assert.match(loadUtils, /point\.weight > 0/);

assert.match(evolution, /mode === 'player'[\s\S]*formatLongDate\(current\)[\s\S]*metricConfig\.label/);
assert.match(evolution, /No hay datos de \{metric\.label\} del equipo para este periodo\./);
assert.match(evolution, /Cargando la evolución de carga del equipo…/);
assert.match(evolution, /No se pudo cargar la evolución de carga del equipo\./);
assert.match(evolution, />Reintentar<\/button>/);
assert.match(evolution, /min-h-\[44px\]/);
assert.match(evolution, /overflow-x-auto/);
assert.match(evolution, /min-w-\[34rem\] sm:min-w-0/);
assert.match(evolution, /mode = 'staff'/, 'STAFF sigue siendo el modo por defecto.');
assert.match(evolution, /getPerformanceMetricKpiLabels\(metric, period\)/, 'STAFF conserva sus labels existentes.');

console.log('playerTeamLoadEvolutionUiAudit: RPC exclusiva, DTO, reutilización, privacidad, estados y responsive validados.');
