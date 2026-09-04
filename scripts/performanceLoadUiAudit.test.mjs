import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(projectRoot, 'src', 'App.jsx'), 'utf8');
const card = fs.readFileSync(path.join(projectRoot, 'src', 'components', 'performance', 'DailyLoadCard.jsx'), 'utf8');
const store = fs.readFileSync(path.join(projectRoot, 'src', 'utils', 'performanceLoadStore.js'), 'utf8');
const rpeUtils = fs.readFileSync(path.join(projectRoot, 'src', 'utils', 'performanceRpe.js'), 'utf8');

assert.match(app, /<DailyLoadCard/);
assert.match(app, /averageRpe=\{selectedDay\?\.avgRpe \?\? null\}/);
assert.match(app, /rpeResponseCount=\{selectedDay\?\.rpeResponseCount \|\| 0\}/);
assert.match(app, /activePlayerCount=\{players\.length \|\| null\}/);
assert.match(app, /loadTrainingLoadsRange\(supabase, requestWeekStart, weekEnd\)/);
assert.match(app, /\.from\('rpe_entries'\)[\s\S]*?\.gte\('entry_date', requestWeekStart\)[\s\S]*?\.lte\('entry_date', weekEnd\)/);
assert.match(app, /setRpeEntries\(\(current\) => resolveRpeRefreshEntries\(current, nextRpeEntries, true\)\)/);
assert.match(app, /window\.addEventListener\('focus', refreshPerformanceOnFocus\)/);
assert.match(app, /window\.removeEventListener\('focus', refreshPerformanceOnFocus\)/);
assert.match(app, /onClick=\{refreshPerformanceDataManually\}/);
assert.match(app, /disabled=\{performanceLoading\}/);
assert.match(app, /performanceLoading \? 'Actualizando…' : 'Actualizar'/);
assert.match(app, /performancePeriodCacheRef\.current\.clear\(\)/);
assert.match(app, /performancePeriodRequestVersionRef\.current \+= 1/);
assert.doesNotMatch(
  app.match(/const loadPerformanceData = async \(\) => \{[\s\S]*?const refreshPerformanceDataManually/)?.[0] || '',
  /setPerformancePeriodEntries\(\{ key: '', wellness: \[\], rpe: \[\] \}\)/,
  'El refresco debe invalidar la caché sin borrar la última vista histórica antes de recibir la nueva.',
);
assert.match(app, /rpeEntries=\{performanceRpePeriodEntries\}/);
assert.match(app, /resolveRpePeriodEntries\(\{/);
assert.match(app, /getPerformanceNaturalWeekStart\(new Date\(\)\)/);
assert.match(app, /No se pudo actualizar RPE/);
assert.match(app, /Duración/);
assert.match(app, /Carga RPE/);
assert.match(app, /selectedRpeWorkload\.durationMinutes === null \? '—'/);
assert.match(app, /selectedRpeWorkload\.load === null \? '—'/);
assert.match(app, /aria-label="Evolución RPE individual"/);
const performanceLoadErrorHandler = app.match(/const loadPerformanceData = async \(\) => \{[\s\S]*?const refreshPerformanceDataManually/)?.[0] || '';
const performanceLoadCatch = performanceLoadErrorHandler.match(/catch \(loadError\) \{[\s\S]*?\} finally/)?.[0] || '';
assert.doesNotMatch(performanceLoadCatch, /setRpeEntries\(\[\]\)|setWellnessEntries\(\[\]\)/, 'Un error de refresco debe mantener el último estado cargado.');
assert.match(app, /hasTrainingLoad[\s\S]*Carga registrada/);
assert.match(app, /hasTrainingLoad \? 'bg-sky-300/);
assert.match(app, /ref=\{performanceDayNavRef\}/);
assert.match(app, /performanceDayNavRef\.current/);
assert.match(app, /scrollIntoView\(\{/);
assert.match(app, /data-selected=\{selected \? 'true' : 'false'\}/);
assert.match(app, /min-w-\[770px\][^"']*grid-cols-7/);
assert.match(app, /onClick=\{\(\) => setPerformanceSelectedDate\(day\.entryDate\)\}/);
assert.match(
  app,
  /String\(row\.jugador_id \|\| ''\) === String\(player\.id \|\| ''\)[\s\S]*!row\.jugador_id && row\.player_name === player\.name/,
  'Los minutos históricos deben seguir al UUID tras corregir el nombre del jugador.',
);
assert.doesNotMatch(app, /performanceDayTooltipDate|setPerformanceDayTooltipDate/);
assert.doesNotMatch(app, /Pulso diario del equipo|Resumen por día/);

const microcycleNavigation = app.match(/<nav aria-label="Navegación del microciclo"[\s\S]*?<\/nav>/)?.[0] || '';
assert.match(microcycleNavigation, /day\.avgRpe/);
assert.match(microcycleNavigation, /day\.avgWellness/);
assert.doesNotMatch(microcycleNavigation, /day\.dayStatus\.label|Prioridad|Vigilancia|Sin alertas/);
assert.match(microcycleNavigation, /Carga registrada/);
assert.doesNotMatch(microcycleNavigation, /day\.maxRpe|day\.highRpeCount|Máximo|RPE altos/);

assert.match(card, /Sin carga registrada\./);
assert.match(card, /Registrar carga/);
assert.match(card, /Guardar carga/);
assert.match(card, /Editar/);
assert.match(card, /Automático/);
assert.match(card, /Google Forms/);
assert.match(card, /Sin respuestas/);
assert.match(card, /Cobertura baja/);
assert.match(card, /coverage\.percentage/);
assert.match(card, /PERFORMANCE_SESSION_TYPES\.map/);
assert.match(card, /grid grid-cols-2 gap-2 lg:grid-cols-3/);
assert.match(card, /rows=\{2\}/);
assert.match(card, /ref=\{notesRef\}/);
assert.match(card, /!editing && load/);
assert.match(card, /\{editing \? \(/);
assert.doesNotMatch(card, /INTENSIDAD|Intensidad|\bINT\b/);
assert.doesNotMatch(card, /name=["']rpe|p_rpe/i, 'El RPE automático no debe ser un campo editable ni persistido.');

assert.match(store, /\.from\('training_sessions'\)/);
assert.match(store, /\.gte\('session_date', startDate\)/);
assert.match(store, /\.lte\('session_date', endDate\)/);
assert.match(store, /client\.rpc\('upsert_team_daily_training_load', params\)/);
assert.doesNotMatch(store, /rpe_entries|wellness_entries|session_id.*rpe/i);

assert.match(rpeUtils, /function summarizeRpeEntries/);
assert.match(rpeUtils, /function resolveRpePeriodEntries/);
assert.match(rpeUtils, /function resolveRpeRefreshEntries/);
assert.match(rpeUtils, /const hasLinkedSession = Boolean\(entry\?\.session_id\)/);
assert.match(rpeUtils, /durationMinutes: hasReliableDuration \? duration : null/);
assert.match(rpeUtils, /load: hasReliableLoad \? load : null/);

console.log('performanceLoadUiAudit: all assertions passed');
