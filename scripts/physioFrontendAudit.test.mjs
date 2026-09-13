import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('src/App.jsx');
const page = read('src/components/physio/PhysioPage.jsx');
const store = read('src/data/physioStore.js');
const presentation = read('src/utils/physioPresentation.js');
const styles = read('src/index.css');
const modal = page.slice(page.indexOf('function TreatmentModal('), page.indexOf('export default function PhysioPage'));
const treatmentCatalog = presentation.slice(
  presentation.indexOf('export const PHYSIO_TREATMENT_TYPES'),
  presentation.indexOf('export const PHYSIO_CASE_TYPES'),
);

assert.match(app, /import PhysioPage from '\.\/components\/physio\/PhysioPage';/);
assert.match(app, /desktopTabs = \[[^\]]*'Rendimiento', 'Fisio', 'Multas'/);
assert.match(app, /mobileMoreTabs = \[[^\]]*'Rendimiento', 'Fisio', 'Multas'/);
assert.match(app, /activeTab === 'Fisio' \? \([\s\S]*?<PhysioPage[\s\S]*?players=\{players\}/);
assert.doesNotMatch(read('src/PlayerApp.jsx'), /PhysioPage|activeTab === 'Fisio'/);

for (const block of ['Registrar tratamiento', 'Tratamientos de hoy', 'Histórico', 'Resumen por jugador']) assert.ok(page.includes(block), `Falta bloque ${block}`);
for (const field of ['Fecha', 'Jugador', 'Zona corporal', 'Molestia / motivo', 'Tipo de tratamiento', 'Tipo de caso', 'Disponibilidad deportiva', 'Registrado por', 'Duración aproximada (min)', 'Observaciones']) assert.ok(modal.includes(field), `Falta campo ${field}`);
for (const filter of ['Filtrar por jugador', 'Fecha desde', 'Fecha hasta', 'Filtrar por zona', 'Filtrar por tipo de caso', 'Filtrar por disponibilidad', 'Filtrar por fisio']) assert.ok(page.includes(filter), `Falta filtro ${filter}`);
for (const metric of ['Tratamientos hoy', 'Jugadores hoy', 'Tratamientos esta semana', 'Jugadores esta semana']) assert.ok(page.includes(metric), `Falta KPI ${metric}`);
for (const summary of ['Tratamientos', 'Días tratados', 'Última fecha', 'Nuevas:', 'Seguimientos:', 'Zonas más tratadas']) assert.ok(page.includes(summary), `Falta resumen ${summary}`);
assert.match(page, /role="dialog"/);
assert.match(page, /aria-modal="true"/);
assert.match(page, /event\.key === 'Escape'/);
assert.match(page, /lg:hidden/);
assert.match(page, /hidden overflow-x-auto lg:block/);
assert.match(page, /Cargar más/);
assert.match(page, /más recientes primero/);
assert.match(page, /no constituye diagnóstico ni recomendación clínica/);
assert.match(page, /no representan diagnósticos ni valoración clínica/);
assert.doesNotMatch(page, />\s*club_id\s*</i);
assert.doesNotMatch(page, />\s*user_id\s*</i);
assert.doesNotMatch(page, />\s*membership_id\s*</i);

assert.match(modal, /<div role="note"[\s\S]*?>\{registeredByName\}<\/p>/, 'Registrado por se presenta como información, no como control');
assert.doesNotMatch(modal, /readOnly/, 'Registrado por no conserva apariencia de input');
assert.match(modal, /STAFF_UUID_PATTERN\.test\(rawStaffDisplayName\)/, 'un UUID nunca se presenta como nombre del staff');
assert.match(modal, /label="Duración aproximada \(min\)"[\s\S]*?placeholder="Ej\. 25"/);
assert.match(modal, /<textarea maxLength=\{1000\} rows=\{4\}[\s\S]*?min-h-24 resize-y[\s\S]*?placeholder="Observaciones opcionales"/);
assert.equal((treatmentCatalog.match(/\n\s*\['/g) || []).length, 12, 'se mantienen exactamente los 12 tratamientos internos');
assert.match(modal, /PHYSIO_TREATMENT_TYPES\.map/);
assert.match(modal, /type="checkbox" checked=\{checked\} onChange=\{\(\) => toggleTreatment\(value\)\}/);
assert.ok(modal.includes('draft.treatmentTypes.filter((value) => value !== type)') && modal.includes('[...draft.treatmentTypes, type]'), 'la multiselección conserva alta y baja independientes');
assert.match(modal, /grid grid-cols-2 gap-2 md:grid-cols-3/, 'dos columnas móviles y tres desde tablet');
assert.match(modal, /min-h-11[\s\S]*?focus-within:ring-2[\s\S]*?border-caudal-electric\/60 bg-caudal-electric\/15/, 'las tarjetas mantienen target táctil, foco y selección evidente');
for (const group of ['Cabeza / cuello', 'Tronco', 'Miembro superior', 'Miembro inferior', 'Otra']) assert.ok(page.includes(`['${group}'`), `Falta agrupación ${group}`);
assert.equal((modal.match(/<optgroup/g) || []).length, 1, 'el catálogo corporal se renderiza mediante grupos sin duplicar selects');
assert.match(modal, /max-h-\[calc\(100dvh-0\.75rem\)\][^\n]*overflow-y-auto overscroll-contain/);
assert.match(modal, /app-modal-actions app-safe-area-footer sticky bottom-0/);
assert.match(modal, /type="submit" disabled=\{saving \|\| !players\.length\}[\s\S]*?>\{saving \? 'Guardando…' : 'Guardar tratamiento'\}<\/button>/);
assert.match(styles, /\.app-safe-area-footer[\s\S]*?padding-bottom: calc\(1rem \+ var\(--app-safe-area-bottom\)\)/);
assert.match(styles, /\.mobile-form-controls select,[\s\S]*?\.mobile-form-controls textarea[\s\S]*?font-size: 1rem/);

for (const operation of ['listTodayTreatments', 'listTreatmentsRange', 'listTreatmentHistory', 'createTreatment', 'updateTreatment', 'getPlayerPhysioSummary']) assert.ok(store.includes(`function ${operation}`), `Falta ${operation}`);
assert.match(store, /client\.from\(PHYSIO_TABLE\)\.insert/);
assert.match(store, /client\.from\(PHYSIO_TABLE\)\.update/);
assert.equal((store.match(/client\.rpc\(/g) || []).length, 1, 'Solo el resumen agregado usa RPC.');
assert.doesNotMatch(store, /\.delete\s*\(/);
for (const protectedField of ['club_id', 'performed_by_user_id', 'performed_by_name_snapshot', 'created_at', 'updated_at']) {
  const payload = store.slice(store.indexOf('const editablePayload'), store.indexOf('const orderedTreatmentQuery'));
  assert.equal(payload.includes(protectedField), false, `${protectedField} no puede entrar en payload CRUD`);
}
assert.match(store, /range\(offset, offset \+ limit - 1\)/);
assert.match(store, /player:jugadores!physio_treatments_player_id_fkey/);

assert.match(presentation, /PHYSIO_BODY_AREAS/);
assert.match(presentation, /PHYSIO_TREATMENT_TYPES/);
assert.match(presentation, /new Set\(todayRows\.map/);
assert.match(presentation, /new Set\(weekRows\.map/);
assert.match(presentation, /durationMinutes: ''/);

console.log('Fisio STAFF: navegación, CRUD, formulario, hoy, histórico, filtros, resumen, privacidad y responsive validados.');
