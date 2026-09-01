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
assert.doesNotMatch(panel, /Tu última información/);
assert.match(panel, /Wellness hoy/);
assert.match(panel, /RPE hoy/);
assert.match(panel, /Sin respuesta/);
assert.match(panel, /Último:/);
assert.match(panel, /lg:grid-cols-\[minmax\(0,7fr\)_minmax\(12rem,3fr\)\]/, 'Estado actual reserva aproximadamente 70/30 para Wellness y RPE.');
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
assert.doesNotMatch(panel, /Una métrica, un periodo/);
assert.match(panel, /\[\['week', 'Semana'\], \['month', 'Mes'\]\]/);
assert.match(panel, /<select value=\{effectiveMetric\}/);
assert.match(panel, /availableMetrics\.some\(\(metric\) => metric\.key === metricKey\) \? metricKey : availableMetrics\[0\]\?\.key \|\| ''/, 'Una métrica que deja de estar disponible obtiene fallback seguro.');
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
assert.match(trendChart, /const height = 200/, 'La gráfica baja de 270 a 200 unidades de alto.');
assert.doesNotMatch(trendChart, /const height = 270/);
assert.match(trendChart, /hasTenPointScale/);
assert.match(trendChart, /Array\.from\(\{ length: 11 - Number\(scale\.min\) \}/, 'La escala 0–10/1–10 genera ticks enteros densos.');
assert.match(trendChart, /hidden sm:block/, 'En móvil se aligeran ticks alternos sin perder extremos.');
assert.match(trendChart, /maximumFractionDigits: 2/, 'Los valores visibles conservan hasta dos decimales reales.');
assert.match(trendChart, /\{formatNumber\(point\.value\)\}/, 'Cada punto muestra su valor sin depender del hover.');
assert.match(trendChart, /fullDate\(point\.date\).*metric\.label.*formatValue\(point\.value, metric\.unit\)/s, 'El tooltip conserva fecha, métrica, valor y unidad.');
assert.match(trendChart, /const axisLabelCount = Math\.min\(points\.length, 5\)/, 'La cantidad de etiquetas se calcula fuera del callback.');
assert.match(trendChart, /Array\.from\(\{ length: axisLabelCount \}, \(_, index\) =>/, 'Array.from usa únicamente los dos argumentos que realmente entrega.');
assert.doesNotMatch(trendChart, /Array\.from\([^]*\(_, index, labels\)/, 'Regresión: el tercer argumento de Array.from es undefined y tumbaba el render con puntos.');
assert.throws(
  () => Array.from({ length: 1 }, (_, index, labels) => labels.length + index),
  TypeError,
  'La regresión reproduce exactamente el TypeError original con una serie no vacía.',
);
const runtimeAxisIndexes = (pointCount) => {
  const axisLabelCount = Math.min(pointCount, 5);
  return Array.from({ length: axisLabelCount }, (_, index) => (
    Math.round((index * Math.max(pointCount - 1, 0)) / Math.max(axisLabelCount - 1, 1))
  ));
};
assert.deepEqual(runtimeAxisIndexes(0), []);
assert.deepEqual(runtimeAxisIndexes(1), [0]);
assert.deepEqual(runtimeAxisIndexes(7), [0, 2, 3, 5, 6]);
assert.deepEqual(runtimeAxisIndexes(31), [0, 8, 15, 23, 30]);
assert.match(presentation, /metric\.scale \|\| getDynamicScale/);
assert.match(presentation, /metric\.scale \|\| getDynamicScale\(scaleValues\)/, 'Peso mantiene una escala dinámica basada en sus propios valores.');
assert.match(presentation, /summaryValues\.length > 1/);
assert.doesNotMatch(presentation, /interpol|imput|value:\s*0/, 'No se imputan días ni valores ausentes.');
assert.match(trendChart, /splitAvailablePlayerSeries\(points\)/, 'La línea se corta en días sin respuesta.');

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
assert.match(panel, /const summaryItems = \[/);
assert.match(panel, /Wellness \$\{formatMetricValue\(wellnessEntry\.health_ratio/);
assert.match(panel, /RPE \$\{formatMetricValue\(rpeEntry\.rpe/);
assert.match(panel, /summaryItems\.join\(' · '\)/);
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
assert.match(panel, /grid gap-3 lg:grid-cols-\[minmax\(0,1\.15fr\)_minmax\(18rem,0\.85fr\)\]/);
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
assert.match(panel, /if \(cancelled\) return/, 'Una respuesta temporal tardía no reemplaza el estado tras cambiar de periodo.');
assert.match(panel, /const hasOpenedPerformanceRef = useRef\(false\)/);
assert.match(panel, /setAnchorDateValue\(getLocalPlayerDateKey\(\)\)/, 'La primera entrada abre en la fecha local actual.');

for (const forbiddenLabel of ['Borja', 'Jairo', 'Prioridad', 'Vigilar', 'media de plantilla', 'ranking', 'alerta PF', 'cumplimiento', 'número de respuestas', 'diagnóstico', 'lesión']) {
  assert.equal(branch.toLowerCase().includes(forbiddenLabel.toLowerCase()), false, `Privacidad visual: no mostrar ${forbiddenLabel}.`);
}
assert.doesNotMatch([app, panel, header, navigation, homeChart, trendChart].join('\n'), />\s*(?:session_id|jugador_id|health_ratio|created_at|updated_at|submitted_at)\s*</i);
assert.doesNotMatch([app, panel, header, navigation, homeChart, trendChart].join('\n'), /Supabase/i);
assert.doesNotMatch([app, panel].join('\n'), /\{(?:response\?\.)?error\.(?:message|details|hint)\}/);

console.log('Player Performance UI audit: estado, evolución, calendario, detalle, responsive y aislamiento validados.');
