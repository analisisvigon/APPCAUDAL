import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const app = read('src/PlayerApp.jsx');
const navigation = read('src/components/player/PlayerNavigation.jsx');
const panel = read('src/components/player/PlayerFinesTransparencyPanel.jsx');
const visuals = read('src/components/fines/FinesTransparencyVisuals.jsx');
const staffPage = read('src/components/fines/FinesManagementPage.jsx');
const store = read('src/data/finesTransparencyStore.js');
const source = [app, navigation, panel, visuals, store].join('\n');

assert.match(app, /import PlayerFinesTransparencyPanel from '\.\/components\/player\/PlayerFinesTransparencyPanel';/);
assert.match(app, /activeSection === 'fines' \? \([\s\S]*?<PlayerFinesPanel client=\{client\} \/>[\s\S]*?<PlayerFinesTransparencyPanel client=\{client\} \/>[\s\S]*?\) : null/);
assert.doesNotMatch(app, /canManageFines\s*&&\s*activeSection === 'fines'/, 'La transparencia no depende de la capability de gestión.');
assert.match(app, /const FinesManagementPage = lazy\(\(\) => import\('\.\/components\/fines\/FinesManagementPage'\)\);/);
assert.match(app, /canManageFines && activeSection === 'fines-management'/);
assert.match(navigation, /\.\.\.\(canManageFines \? \[\['fines-management', 'Gestión de multas'\]\] : \[\]\)/);

assert.equal((store.match(/client\.rpc\(/g) || []).length, 2, 'El ejecutor compartido tiene solo una llamada con y otra sin argumentos.');
for (const rpc of [
  'get_fines_transparency_summary',
  'get_fines_transparency_subjects',
  'get_fines_transparency_rules',
  'get_fines_transparency_list',
]) assert.match(store, new RegExp(`['"]${rpc}['"]`));
assert.doesNotMatch(store, /\.from\s*\(/, 'La transparencia no consulta tablas directamente.');
assert.doesNotMatch(store, /p_(?:club|subject|jugador|membership|user|player|fine|rule|incident)_id/i);
assert.doesNotMatch(store, /(?:club|subject|jugador|membership|user|player|fine|rule|incident)_id\s*:/i, 'La allowlist no conserva IDs internos.');

for (const field of [
  'season_code', 'total_fines', 'active_fines', 'unpaid_count', 'partial_count',
  'paid_count', 'cancelled_count', 'overdue_count', 'generated_total',
  'collected_total', 'pending_total', 'subject_name', 'rule_name', 'occurred_on',
  'original_amount', 'surcharge_amount', 'due_on', 'financial_status',
  'lifecycle_status', 'is_overdue', 'note',
]) assert.match(store, new RegExp(`\\b${field}\\b`), `Falta el campo sanitizado ${field}.`);

for (const label of [
  'Total generado', 'Total cobrado', 'Total pendiente', 'Total multas',
  'Pendientes', 'Pagadas', 'Anuladas', 'Vencidas',
]) assert.ok(panel.includes(label), `Falta el KPI ${label}.`);
assert.equal((panel.match(/<Kpi /g) || []).length, 8, 'La transparencia muestra exactamente ocho KPI grupales.');
for (const title of [
  'Quién ha aportado más', 'Mayor importe pendiente',
  'Motivos con mayor importe', 'Motivos más frecuentes',
  'Resumen por jugador', 'Multas del grupo',
]) assert.ok(panel.includes(title), `Falta el bloque visual ${title}.`);
assert.equal((panel.match(/<FinesHorizontalRanking/g) || []).length, 4);
assert.match(panel, /<FinesStatusDistribution summary=\{summary\} \/>/);
assert.match(staffPage, /import \{ FinesStatusDistribution \} from '\.\/FinesTransparencyVisuals';/);
assert.match(staffPage, /<FinesStatusDistribution summary=\{summary\} \/>/, 'STAFF reutiliza la distribución visual.');

assert.match(panel, /state\.status === 'loading'/);
assert.match(panel, /state\.status === 'error'/);
assert.match(panel, /!state\.rows\.length/);
assert.match(panel, /state\.hasMore/);
assert.match(panel, /offset: state\.rows\.length/);
assert.match(panel, /Promise\.all/);
assert.match(panel, /fine\.note \? <section/);
assert.match(panel, /grid-cols-2/);
assert.match(panel, /lg:grid-cols-2/);
assert.doesNotMatch(panel, /<table|overflow-x-auto|min-w-\[[4-9]\d\dpx\]/, 'La vista PLAYER no introduce tabla ni scroll horizontal.');

for (const forbiddenRpc of [
  'create_fine_individual', 'create_fine_collective', 'record_fine_payment',
  'record_fine_refund', 'cancel_fine', 'get_fines_management_list',
  'get_fine_subjects_for_management', 'get_fine_rules_for_management',
]) assert.equal(source.includes(forbiddenRpc), false, `La rama de transparencia no incluye ${forbiddenRpc}.`);
for (const forbiddenAction of ['Registrar pago', 'Reembolso', 'Anular', 'Editar', 'Eliminar']) {
  assert.doesNotMatch(panel, new RegExp(`>\\s*${forbiddenAction}\\s*<`, 'i'));
}
assert.doesNotMatch(source, /club_member_permissions|role\s*=\s*['"]captain['"]|\bfines_manage\b/i);
assert.doesNotMatch(source, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);

console.log('Transparencia de multas: PLAYER universal, 8 KPI, 4 rankings, distribución, tarjetas sanitizadas y reutilización STAFF validadas.');
