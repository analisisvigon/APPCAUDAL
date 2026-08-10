import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(projectRoot, 'src', 'App.jsx'), 'utf8');
const card = fs.readFileSync(path.join(projectRoot, 'src', 'components', 'performance', 'DailyLoadCard.jsx'), 'utf8');
const store = fs.readFileSync(path.join(projectRoot, 'src', 'utils', 'performanceLoadStore.js'), 'utf8');

assert.match(app, /<DailyLoadCard/);
assert.match(app, /averageRpe=\{selectedDay\?\.avgRpe \?\? null\}/);
assert.match(app, /rpeResponseCount=\{selectedDay\?\.rpeResponseCount \|\| 0\}/);
assert.match(app, /activePlayerCount=\{players\.length \|\| null\}/);
assert.match(app, /loadTrainingLoadsRange\(supabase, performanceWeekStart, weekEnd\)/);
assert.match(app, /hasTrainingLoad[\s\S]*Carga registrada/);
assert.match(app, /hasTrainingLoad \? 'bg-sky-300/);

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

console.log('performanceLoadUiAudit: all assertions passed');
