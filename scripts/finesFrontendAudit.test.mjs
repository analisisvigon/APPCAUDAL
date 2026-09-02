import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const app = read('src/App.jsx');
const page = read('src/components/fines/FinesManagementPage.jsx');
const store = read('src/data/finesManagementStore.js');
const presentation = read('src/utils/finesPresentation.js');
const source = [page, store, presentation].join('\n');

assert.match(app, /import FinesManagementPage from '\.\/components\/fines\/FinesManagementPage';/);
assert.match(app, /desktopTabs = \[[^\]]*'Multas'/);
assert.match(app, /mobileMoreTabs = \[[^\]]*'Multas'/);
assert.match(app, /activeTab === 'Multas' \? \(\s*<FinesManagementPage client=\{supabase\}/);

const managementRpcs = [
  'get_fine_rules_for_management',
  'get_fine_subjects_for_management',
  'get_fines_management_list',
  'get_fines_financial_summary',
  'get_fines_subject_summary',
  'create_fine_individual',
  'create_fine_collective',
  'record_fine_payment',
  'record_fine_refund',
  'cancel_fine',
];
for (const rpc of managementRpcs) {
  assert.ok(store.includes(`'${rpc}'`), `Falta integrar la RPC ${rpc}.`);
}
assert.equal((store.match(/client\.rpc\(/g) || []).length, 2, 'Solo el wrapper común puede invocar RPC, con o sin argumentos.');
assert.match(store, /const callRpc = async[\s\S]*?response = args === undefined \? await client\.rpc\(rpcName\) : await client\.rpc\(rpcName, args\);/);
assert.doesNotMatch(source, /\.from\s*\(/, 'El módulo de Multas no puede consultar tablas directamente.');

for (const copy of [
  'Multas',
  'Nueva multa',
  'Resumen económico',
  'Listado y gestión',
  'Situación por jugador',
  'Pendiente por jugador',
  'Registrar pago',
  'Registrar reembolso',
  'Anular multa',
  'Cargar más',
  'No hay multas registradas esta temporada.',
  'Reintentar',
]) assert.ok(page.includes(copy), `Falta contenido o estado ${copy}.`);

assert.match(page, /const PAGE_SIZE = 50/);
assert.match(page, /getFinesManagementList\(client, \{ status: statusFilter, limit: PAGE_SIZE, offset:/);
assert.match(page, /FINE_STATUS_FILTERS\.map/);
assert.match(page, /mode === 'individual'/);
assert.match(page, /mode === 'collective'/);
assert.match(page, /rule\.collective_allowed/);
assert.match(page, /maxLength=\{500\}/);
assert.match(page, /Esta nota será visible para el jugador\./);
assert.match(page, /role="dialog"/);
assert.match(page, /aria-modal="true"/);
assert.match(page, /event\.key === 'Escape'/);
assert.match(page, /role="img" aria-label="Gráfico de barras: pendiente por jugador"/);
assert.match(page, /listState\.status === 'loading'/);
assert.match(page, /listState\.status === 'error'/);
assert.match(page, /listState\.status === 'ready' && !listState\.rows\.length/);
assert.match(page, /formatFinesCurrency\(summary\.generated_total\)/);
assert.match(page, /formatFinesCurrency\(summary\.collected_total\)/);
assert.match(page, /formatFinesCurrency\(summary\.pending_total\)/);
assert.match(page, /getPendingFinesCount\(summary\)/);
assert.match(page, /lg:hidden/);
assert.match(page, /hidden overflow-x-auto lg:block/);
assert.match(page, /const refreshFinesData = \(\) => setRefreshToken/);
assert.match(page, /setToast\(successMessage\);\s*refreshFinesData\(\);/);
for (const operation of ['createFineIndividual', 'createFineCollective', 'recordFinePayment', 'recordFineRefund', 'cancelFine']) {
  assert.ok(page.includes(`${operation}(client`), `Falta conectar la operación ${operation}.`);
}

assert.match(presentation, /new Intl\.NumberFormat\('es-ES'/);
assert.match(presentation, /style: 'currency'/);
assert.match(presentation, /currency: 'EUR'/);
assert.match(presentation, /cancelBlockedByCollection/);
assert.match(presentation, /amount > Number\(maximum\)/);

assert.doesNotMatch(source, /\bfines_manage\b/, 'La UI no asigna ni consulta la permission fines_manage.');
for (const forbidden of [
  "role === 'captain'",
  "role == 'captain'",
  'TRAINING_EXIT_DELAY_AFTER_TALK',
  'Borja Rodríguez',
  'Jairo Cárcaba',
]) assert.equal(source.includes(forbidden), false, `No debe existir dependencia frontend de ${forbidden}.`);

assert.equal(fs.existsSync(new URL('../supabase_club_core_25_fines_frontend.sql', import.meta.url)), false, 'El Bloque 4.7 no crea migración 25.');

console.log('Frontend STAFF de Multas: navegación, RPC-only, operaciones, estados y responsive validados.');
