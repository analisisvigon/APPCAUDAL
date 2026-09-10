import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('src/App.jsx');
const page = read('src/components/physio/PhysioPage.jsx');
const store = read('src/data/physioStore.js');
const presentation = read('src/utils/physioPresentation.js');

assert.match(app, /import PhysioPage from '\.\/components\/physio\/PhysioPage';/);
assert.match(app, /desktopTabs = \[[^\]]*'Rendimiento', 'Fisio', 'Multas'/);
assert.match(app, /mobileMoreTabs = \[[^\]]*'Rendimiento', 'Fisio', 'Multas'/);
assert.match(app, /activeTab === 'Fisio' \? \([\s\S]*?<PhysioPage[\s\S]*?players=\{players\}/);
assert.doesNotMatch(read('src/PlayerApp.jsx'), /PhysioPage|activeTab === 'Fisio'/);

for (const block of ['Registrar tratamiento', 'Tratamientos de hoy', 'Histórico', 'Resumen por jugador']) assert.ok(page.includes(block), `Falta bloque ${block}`);
for (const field of ['Fecha', 'Jugador', 'Zona corporal', 'Molestia / motivo', 'Tipo de tratamiento', 'Tipo de caso', 'Disponibilidad deportiva', 'Fisio que lo realiza', 'Duración aproximada', 'Observaciones']) assert.ok(page.includes(field), `Falta campo ${field}`);
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
