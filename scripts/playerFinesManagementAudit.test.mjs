import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const read = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const resolver = read('src/auth/resolveAppIdentity.js');
const shell = read('src/AppAuthShell.jsx');
const app = read('src/PlayerApp.jsx');
const navigation = read('src/components/player/PlayerNavigation.jsx');
const capabilities = read('src/utils/playerCapabilities.js');
const ownPanel = read('src/components/player/PlayerFinesPanel.jsx');
const ownStore = read('src/data/playerFinesStore.js');
const managementPage = read('src/components/fines/FinesManagementPage.jsx');
const managementStore = read('src/data/finesManagementStore.js');
const source = [resolver, shell, app, navigation, capabilities, ownPanel, ownStore, managementPage, managementStore].join('\n');

assert.match(resolver, /client\.rpc\('current_membership'\)/);
assert.match(resolver, /client\.rpc\('can_manage_fines'\)/);
assert.match(resolver, /capabilityResponse\?\.data === true/);
assert.match(resolver, /catch \{[\s\S]*?canManageFines = false;/, 'La capability falla cerrada.');
assert.match(resolver, /kind: 'player'[\s\S]*capabilities: \{ canManageFines \}/);
assert.doesNotMatch(resolver, /\.from\s*\(|club_member_permissions/);

assert.match(shell, /<PlayerApp client=\{supabase\} identity=\{authState\.identity\} onRefreshIdentity=\{retryIdentity\}/);
assert.match(app, /const FinesManagementPage = lazy\(\(\) => import\('\.\/components\/fines\/FinesManagementPage'\)\);/);
assert.match(app, /const canManageFines = canPlayerManageFines\(identity\);/);
assert.match(app, /guardPlayerSection\(current, canManageFines\)/);
assert.match(app, /guardPlayerSection\(section, canManageFines\)/);
assert.match(app, /canManageFines && activeSection === 'fines-management'/);
assert.match(app, /title="Gestión de multas"/);
assert.match(app, /unavailableMessage="Gestión de multas no disponible\."/);
assert.match(app, /onAccessDenied=\{onRefreshIdentity\}/);
assert.doesNotMatch(app, /import FinesManagementPage from/, 'La gestión no entra en el bundle inicial del PLAYER normal.');

assert.match(capabilities, /identity\?\.kind === 'player'/);
assert.match(capabilities, /identity\?\.membership\?\.role === 'player'/);
assert.match(capabilities, /identity\?\.capabilities\?\.canManageFines === true/);
assert.match(capabilities, /requestedSection === 'fines-management' && canManageFines !== true[\s\S]*\? 'home'/);
assert.match(navigation, /\.\.\.\(canManageFines \? \[\['fines-management', 'Gestión de multas'\]\] : \[\]\)/);
assert.equal((navigation.match(/\['fines', 'Multas'\]/g) || []).length, 1);
assert.equal((navigation.match(/\['fines-management', 'Gestión de multas'\]/g) || []).length, 1);
assert.match(navigation, /canManageFines \? 'lg:grid-cols-6' : 'sm:grid-cols-5'/);

assert.match(managementPage, /export default function FinesManagementPage\(\{ client, title = 'Multas', unavailableMessage = '', onAccessDenied = null \}\)/);
assert.match(managementPage, /<h2[^>]*>\{title\}<\/h2>/);
assert.match(managementPage, /isFinesManagementAccessDenied\(error\)/);
assert.match(managementPage, /onAccessDenied\?\.\(\)/);
assert.match(managementPage, /unavailableMessage && isFinesManagementAccessDenied/);
assert.match(managementStore, /isFinesManagementAccessDenied/);
assert.match(managementStore, /String\(current\.code \|\| ''\)\.toUpperCase\(\) === '42501'/);

for (const rpc of [
  'get_fine_rules_for_management', 'get_fine_subjects_for_management',
  'get_fines_management_list', 'get_fines_financial_summary', 'get_fines_subject_summary',
  'create_fine_individual', 'create_fine_collective', 'record_fine_payment',
  'record_fine_refund', 'cancel_fine',
]) assert.ok(managementStore.includes(`'${rpc}'`), `Falta reutilizar ${rpc}.`);
for (const operation of ['createFineIndividual', 'createFineCollective', 'recordFinePayment', 'recordFineRefund', 'cancelFine']) {
  assert.ok(managementPage.includes(`${operation}(client`), `Falta mantener ${operation}.`);
}

assert.match(ownStore, /list: 'get_my_fines'/);
assert.match(ownStore, /summary: 'get_my_fines_summary'/);
assert.equal((ownStore.match(/client\.rpc\(/g) || []).length, 2);
assert.doesNotMatch(ownStore, /get_fines_management|create_fine|record_fine|cancel_fine/);
assert.doesNotMatch(ownPanel, /FinesManagementPage|finesManagementStore|Situación por jugador/);

assert.doesNotMatch(source, /role\s*={2,3}\s*['"]captain['"]|role\s*=\s*['"]captain['"]/i);
assert.doesNotMatch(source, /Agus|Borja|Jairo|Julio/);
assert.doesNotMatch(source, /\.from\s*\(\s*['"](?:fine_rules|fine_subjects|fine_incidents|fines|fine_payments|club_member_permissions)['"]\s*\)/i);
assert.doesNotMatch(app, /\.\/App|Plantilla|Análisis Grupal|Registro Delegado|RendimientoPage|Equipos/);
assert.doesNotMatch(source, /insert into\s+public\.club_member_permissions/i);
assert.equal(fs.existsSync(new URL('../src/data/captainFinesStore.js', import.meta.url)), false);

const changedTrackedFiles = execFileSync('git', ['diff', '--name-only'], {
  cwd: new URL('..', import.meta.url),
  encoding: 'utf8',
}).trim().split(/\r?\n/).filter(Boolean);
assert.equal(
  changedTrackedFiles.some((path) => /^supabase_club_core_(?:0[1-9]|1\d|2[0-4])_/.test(path)),
  false,
  'El Bloque 4.9 no puede modificar backend ni verify 24.',
);

console.log('Gestión de multas PLAYER: capability segura, guard de sección, carga diferida y componente STAFF reutilizado.');
