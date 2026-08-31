import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const store = read('src/data/playerPerformanceStore.js');
const app = read('src/PlayerApp.jsx');
const panel = read('src/components/player/PlayerPerformancePanel.jsx');
const header = read('src/components/player/PlayerHeader.jsx');
const navigation = read('src/components/player/PlayerNavigation.jsx');
const chart = read('src/components/player/PlayerLineChart.jsx');
const presentation = read('src/utils/playerPerformancePresentation.js');
const branch = [app, panel, header, navigation, chart, presentation, store].join('\n');

assert.deepEqual(
  [...store.matchAll(/^\s*['"](wellness_entries|rpe_entries)['"],$/gm)].map((match) => match[1]),
  ['wellness_entries', 'rpe_entries'],
  'El loader PLAYER solo consulta Wellness y RPE.',
);
assert.doesNotMatch(store, /\.eq\(\s*['"]jugador_id['"]|\.filter\([^\n]*jugador_id/, 'La identidad no se filtra en cliente.');
assert.match(store, /\.order\('entry_date', \{ ascending: false \}\)/);
assert.match(store, /\.range\(offset, offset \+ limit\)/);
assert.match(store, /PLAYER_PERFORMANCE_PAGE_SIZE = 8/);
assert.match(store, /appendUniquePlayerEntries/);
assert.doesNotMatch(store, /^\s*['"]jugador_id['"],$/m, 'La proyección no descarga jugador_id.');
assert.match(store, /comment: normalizeOptionalText\(row\?\.comment\)/, 'El comentario conserva su fila.');
assert.match(store, /discomfort: normalizeOptionalText\(row\?\.discomfort\)/, 'La molestia conserva su fila.');
assert.doesNotMatch(store, /health_ratio|submitted_at|created_at|updated_at/);

for (const forbidden of [
  'getPerformanceDashboard', 'getJugadores', 'performanceLoadStore', 'globalPlayerStore',
  'authenticatedDataLoad', 'training_sessions', 'training_session_load_metrics',
  'rpe_sync_pending', 'team average', 'ranking',
]) {
  assert.equal(branch.toLowerCase().includes(forbidden.toLowerCase()), false, `PLAYER no debe contener ${forbidden}.`);
}

assert.match(header, /flex min-w-0 items-center/, 'La identidad usa cabecera horizontal.');
assert.match(header, /h-\[76px\] w-\[76px\]/, 'La foto conserva protagonismo sin dominar la pantalla.');
assert.doesNotMatch(branch, /h-36 w-36|h-40 w-40/, 'No vuelve la foto de perfil sobredimensionada.');
assert.match(header, /Jugador · C\.D\. Caudal de Mieres/);
assert.match(header, /profile\?\.shirt_name/);
assert.match(header, /profile\?\.name/);
assert.match(header, /profile\?\.number/);
assert.match(header, /profile\?\.player_position/);

assert.deepEqual(
  [...navigation.matchAll(/\['(home|analysis|matches|performance)', '([^']+)'\]/g)].map((match) => match[2]),
  ['Inicio', 'Mi análisis', 'Partidos', 'Rendimiento'],
  'La navegación PLAYER mantiene sus cuatro destinos V1.',
);
assert.match(navigation, /'Salir'/, 'Cerrar sesión queda como acción secundaria discreta.');
assert.match(navigation, /min-h-\[44px\]/, 'Los destinos conservan touch target móvil.');
assert.match(app, /view=\{activeSection === 'home' \? 'space' : 'performance'\}/, 'Inicio conserva la vista HOME y Rendimiento su vista completa.');
assert.match(app, /onOpenPerformance=\{\(\) => setActiveSection\('performance'\)\}/);

assert.match(panel, /function PlayerSpaceDashboard/);
assert.match(panel, /Tu estado/);
assert.match(panel, /Último esfuerzo/);
assert.match(panel, /Evolución reciente/);
assert.match(panel, /Ver Mi rendimiento completo/);
assert.match(panel, /<WellnessStatusCard entry=\{latestWellness\} compact/);
assert.match(panel, /<RpeStatusCard entry=\{latestRpe\} compact/);

assert.match(panel, /Resumen de rendimiento/);
assert.match(panel, /Evolución Wellness/);
assert.match(panel, /Evolución RPE/);
assert.match(panel, /7 últimos/);
assert.match(panel, /Todo cargado/);
assert.match(panel, /WELLNESS_METRICS/);
assert.match(chart, /<svg/);
assert.match(chart, /<polyline/);
assert.match(chart, /<circle/);
assert.match(chart, /role="img"/);
assert.match(presentation, /PLAYER_CHART_SCALE = Object\.freeze\(\{ min: 1, max: 10 \}\)/);
assert.match(presentation, /value: getPlayerMetricValue\(entry\?\.\[field\]\)/);
assert.match(presentation, /if \(segment\.length\) segments\.push\(segment\)/, 'Los valores ausentes cortan la línea.');
assert.doesNotMatch(presentation, /fill|interpol|imput|value:\s*0/, 'No se imputan días ni valores ausentes.');
assert.match(panel, /entries=\{state\.wellness\}/, 'La gráfica Wellness recibe únicamente filas del loader PLAYER.');
assert.match(panel, /entries=\{state\.rpe\}/, 'La gráfica RPE recibe únicamente filas del loader PLAYER.');

assert.match(panel, /workload\.durationMinutes !== null \?/, 'Duración solo se renderiza cuando está disponible.');
assert.match(panel, /workload\.load !== null \?/, 'Carga solo se renderiza cuando está disponible.');
assert.doesNotMatch(panel, /No disponible|No son U\.C\.|Duración y carga solo aparecen/, 'Los opcionales ausentes y textos técnicos no añaden ruido.');
assert.doesNotMatch(panel, /U\.C\./, 'La interfaz no denomina U.C. a la carga RPE.');
assert.doesNotMatch(panel, /'—'/, 'Los datos ausentes no llenan la interfaz de guiones.');

assert.match(panel, /<ol className="mt-2 divide-y/, 'Los históricos son listas compactas, no tarjetas por fila.');
assert.match(panel, /<details className="group/, 'Los detalles Wellness secundarios pueden expandirse.');
assert.match(panel, /entry\.discomfort/);
assert.match(panel, /entry\.comment/);
assert.doesNotMatch(branch, /find\([^\n]*(?:comment|discomfort)/, 'Comentario y molestia no se buscan en otra respuesta.');
assert.match(panel, /loadMoreWellness/);
assert.match(panel, /loadMoreRpe/);
assert.match(panel, /wellnessRequestInFlightRef\.current/);
assert.match(panel, /rpeRequestInFlightRef\.current/);
assert.match(panel, /appendUniquePlayerEntries\(current\.wellness, page\.rows\)/);
assert.match(panel, /appendUniquePlayerEntries\(current\.rpe, page\.rows\)/);
assert.match(panel, /Lo ya cargado sigue disponible/);

assert.match(app, /px-3 py-3[^\"]*sm:px-4/, 'El shell aprovecha 320 px con margen controlado.');
assert.match(app, /max-w-6xl/, 'Desktop aprovecha anchura sin extender indefinidamente.');
assert.match(panel, /grid gap-3 md:grid-cols-2/, 'Las tarjetas principales apilan en móvil.');
assert.match(panel, /flex max-w-full flex-wrap/, 'Los selectores de métrica envuelven en móvil.');
assert.match(chart, /className="block h-auto w-full"/, 'Las gráficas son fluidas.');
assert.doesNotMatch(branch, /<table|overflow-x-auto|min-w-\[[4-9]\d\dpx\]/, 'PLAYER no necesita scroll horizontal ni tablas de escritorio.');

assert.match(app, /invalid_session/);
assert.match(app, /identity_invalid/);
assert.match(panel, /\['Wellness', 'RPE'\]\.map/, 'Los dos estados de carga se generan de forma consistente.');
assert.match(panel, /Cargando \{label\}/);
assert.match(panel, /Reintentar/);
assert.match(branch, /focus-visible:ring-2/);

for (const forbiddenLabel of ['Borja', 'Jairo', 'Prioridad', 'Vigilar', 'media de plantilla', 'ranking', 'alerta PF', 'cumplimiento', 'número de respuestas']) {
  assert.equal(branch.toLowerCase().includes(forbiddenLabel.toLowerCase()), false, `Privacidad visual: no mostrar ${forbiddenLabel}.`);
}
assert.doesNotMatch([app, panel, header, navigation, chart].join('\n'), />\s*(?:session_id|jugador_id|health_ratio|created_at|updated_at|submitted_at)\s*</i);
assert.doesNotMatch([app, panel, header, navigation, chart].join('\n'), /Supabase/i);
assert.doesNotMatch([app, panel].join('\n'), /\{(?:response\?\.)?error\.(?:message|details|hint)\}/);

console.log('Player visual UI audit: diseño, gráficas, históricos, responsive y aislamiento validados.');
