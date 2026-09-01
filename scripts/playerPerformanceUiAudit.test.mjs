import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const store = read('src/data/playerPerformanceStore.js');
const app = read('src/PlayerApp.jsx');
const panel = read('src/components/player/PlayerPerformancePanel.jsx');
const header = read('src/components/player/PlayerHeader.jsx');
const navigation = read('src/components/player/PlayerNavigation.jsx');
const homeChart = read('src/components/player/PlayerLineChart.jsx');
const trendChart = read('src/components/player/PlayerPerformanceTrendChart.jsx');
const presentation = read('src/utils/playerPerformancePresentation.js');
const branch = [app, panel, header, navigation, homeChart, trendChart, presentation, store].join('\n');

assert.deepEqual(
  [...new Set([...store.matchAll(/['"](wellness_entries|rpe_entries)['"]/g)].map((match) => match[1]))].sort(),
  ['rpe_entries', 'wellness_entries'],
  'El loader PLAYER solo consulta Wellness y RPE.',
);
assert.doesNotMatch(store, /\.eq\(\s*['"]jugador_id['"]|\.filter\([^\n]*jugador_id/, 'La identidad no se filtra en cliente.');
assert.match(store, /\.gte\('entry_date', startDate\)/);
assert.match(store, /\.lte\('entry_date', endDate\)/);
assert.match(store, /PLAYER_PERFORMANCE_MAX_RANGE_DAYS = 42/);
assert.match(store, /rangeDays > PLAYER_PERFORMANCE_MAX_RANGE_DAYS/);
assert.match(store, /\.limit\(PLAYER_PERFORMANCE_MAX_RANGE_DAYS\)/);
assert.match(store, /\.order\('entry_date', \{ ascending: false \}\)/);
assert.match(store, /PLAYER_PERFORMANCE_PAGE_SIZE = 8/);
assert.doesNotMatch(store, /^\s*['"]jugador_id['"],$/m, 'La proyección no descarga jugador_id.');
assert.match(store, /comment: normalizeOptionalText\(row\?\.comment\)/, 'El comentario conserva su fila.');
assert.match(store, /discomfort: normalizeOptionalText\(row\?\.discomfort\)/, 'La molestia conserva su fila.');
assert.match(store, /'health_ratio'/, 'La proyección incluye el score propio sincronizado y validado.');
assert.match(store, /health_ratio: normalizeOptionalNumber\(row\?\.health_ratio\)/);
assert.doesNotMatch(store, /submitted_at|created_at|updated_at/);

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
assert.match(navigation, /'Salir'/);
assert.match(navigation, /min-h-\[44px\]/);
assert.match(app, /view=\{activeSection === 'home' \? 'space' : 'performance'\}/);
assert.match(app, /onOpenPerformance=\{\(\) => setActiveSection\('performance'\)\}/);

// Inicio PLAYER sigue usando exactamente su resumen reciente.
assert.match(panel, /function PlayerSpaceDashboard/);
assert.match(panel, /Tu estado/);
assert.match(panel, /Último esfuerzo/);
assert.match(panel, /Evolución reciente/);
assert.match(panel, /Ver Mi rendimiento completo/);
assert.match(panel, /<WellnessStatusCard entry=\{latestWellness\} compact/);
assert.match(panel, /<RpeStatusCard entry=\{latestRpe\} compact/);

// Rendimiento: estado actual claro y estados parciales sin repetir cajas vacías.
assert.match(panel, /function CurrentState/);
assert.match(panel, /Estado actual/);
assert.match(panel, /Tu última información/);
assert.match(panel, /Aún no has registrado el Wellness de hoy/);
assert.match(panel, /Aún no has registrado el RPE de hoy/);
assert.match(panel, /Último disponible/);
assert.match(panel, /Todavía no tienes registros suficientes/);
for (const field of ['Wellness', 'Calidad del sueño', 'Horas de sueño', 'Fatiga', 'Dolor muscular', 'Estrés', 'Ánimo', 'Peso']) {
  assert.match(panel, new RegExp(field));
}
assert.match(panel, /buildPlayerCurrentState\(wellness, rpe, today\)/);
assert.match(presentation, /export function buildPlayerCurrentState/);
assert.doesNotMatch(branch, /getWellnessScore/, 'El PLAYER no recalcula ni inventa el score sincronizado.');
assert.match(presentation, /PLAYER_WELLNESS_SCORE_SCALE = Object\.freeze\(\{ min: 0, max: 10 \}\)/);

// Una sola evolución, con selector real y navegación acotada Semana/Mes.
assert.match(panel, /function EvolutionSection/);
assert.match(panel, /Tu evolución/);
assert.match(panel, /\[\['week', 'Semana'\], \['month', 'Mes'\]\]/);
assert.match(panel, /<select value=\{effectiveMetric\}/);
assert.match(panel, /Métrica de la gráfica/);
assert.match(panel, /shiftPlayerPerformanceAnchor/);
assert.match(panel, /Media/);
assert.match(panel, /Último valor/);
assert.match(panel, /Variación/);
assert.match(panel, /No hay suficientes registros para ver una tendencia/);
assert.match(presentation, /PLAYER_MONTH_DAILY_POINT_LIMIT = 14/);
assert.match(presentation, /useWeeklyAverages = period === 'month'/);
assert.match(panel, /Vista mensual agrupada en medias semanales/);
for (const metric of ['Wellness', 'RPE', 'Sueño', 'Fatiga', 'Dolor muscular', 'Estrés', 'Ánimo', 'Peso']) {
  assert.match(presentation, new RegExp(`label: '${metric}'`));
}
assert.equal((panel.match(/<PlayerPerformanceTrendChart model=\{model\}/g) || []).length, 1, 'Solo hay una gráfica principal en Rendimiento.');
assert.match(trendChart, /<svg/);
assert.match(trendChart, /<polyline/);
assert.match(trendChart, /<circle/);
assert.match(trendChart, /<title>/);
assert.match(trendChart, /role="img"/);
assert.match(trendChart, /metric\.unit/);
assert.match(presentation, /metric\.scale \|\| getDynamicScale/);
assert.match(presentation, /summaryValues\.length > 1/);
assert.doesNotMatch(presentation, /interpol|imput|value:\s*0/, 'No se imputan días ni valores ausentes.');

// Calendario visual y detalle bajo demanda sustituyen el histórico largo.
assert.match(panel, /function CalendarSection/);
assert.match(panel, /Tus registros/);
assert.match(panel, /grid grid-cols-7/);
assert.match(panel, /role="grid"/);
assert.match(panel, /aria-label=\{`\$\{formatDate\(date\)\}, \$\{responseLabel\}/);
assert.match(panel, /aria-pressed=\{selectedDate === date\}/);
assert.match(panel, /'W\+R'/);
assert.match(panel, /Molestia/);
assert.match(panel, /Sin registro/);
assert.match(panel, /Ver mes anterior en el calendario/);
assert.match(panel, /Ver mes siguiente en el calendario/);
assert.match(panel, /function DayDetail/);
assert.match(panel, /Detalle del día/);
assert.match(panel, /Wellness — Sin respuesta/);
assert.match(panel, /RPE — Sin respuesta/);
assert.match(panel, /wellnessEntry\.discomfort/);
assert.match(panel, /wellnessEntry\.comment/);
assert.match(panel, /rpeEntry\.comment/);
assert.doesNotMatch(branch, /find\([^\n]*(?:comment|discomfort)/, 'Comentario y molestia no se buscan en otra respuesta.');
assert.doesNotMatch(panel, /<ol|<details|Histórico Wellness|Histórico RPE|loadMoreWellness|loadMoreRpe/, 'El calendario reemplaza la cronología permanente.');

// La carga solo es propia y solo aparece con la semántica segura ya existente.
assert.match(panel, /getRpeWorkloadAvailability\(latestRpe\)/);
assert.match(panel, /getRpeWorkloadAvailability\(rpeEntry\)/);
assert.match(panel, /Carga interna registrada/);
assert.doesNotMatch(panel, /Tu carga|Carga de equipo|U\.C\./);

// Responsive y accesibilidad para 320–430 px sin estructuras de escritorio forzadas.
assert.match(app, /px-3 py-3[^\"]*sm:px-4/);
assert.match(app, /max-w-6xl/);
assert.match(panel, /grid gap-3 lg:grid-cols-\[1\.05fr_0\.95fr\]/);
assert.match(trendChart, /className="block h-auto w-full"/);
assert.doesNotMatch(branch, /<table|overflow-x-auto|min-w-\[[4-9]\d\dpx\]/);
assert.match(panel, /focus-visible:ring-2/);
assert.match(panel, /aria-label="Periodo de evolución"/);
assert.match(panel, /aria-label="Leyenda del calendario"/);

assert.match(app, /invalid_session/);
assert.match(app, /identity_invalid/);
assert.match(panel, /\['Wellness', 'RPE'\]\.map/);
assert.match(panel, /Cargando \{label\}/);
assert.match(panel, /Reintentar/);

for (const forbiddenLabel of ['Borja', 'Jairo', 'Prioridad', 'Vigilar', 'media de plantilla', 'ranking', 'alerta PF', 'cumplimiento', 'número de respuestas', 'diagnóstico', 'lesión']) {
  assert.equal(branch.toLowerCase().includes(forbiddenLabel.toLowerCase()), false, `Privacidad visual: no mostrar ${forbiddenLabel}.`);
}
assert.doesNotMatch([app, panel, header, navigation, homeChart, trendChart].join('\n'), />\s*(?:session_id|jugador_id|health_ratio|created_at|updated_at|submitted_at)\s*</i);
assert.doesNotMatch([app, panel, header, navigation, homeChart, trendChart].join('\n'), /Supabase/i);
assert.doesNotMatch([app, panel].join('\n'), /\{(?:response\?\.)?error\.(?:message|details|hint)\}/);

console.log('Player Performance UI audit: estado, evolución, calendario, detalle, responsive y aislamiento validados.');
