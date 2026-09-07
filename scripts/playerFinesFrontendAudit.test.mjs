import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const app = read('src/PlayerApp.jsx');
const navigation = read('src/components/player/PlayerNavigation.jsx');
const panel = read('src/components/player/PlayerFinesPanel.jsx');
const store = read('src/data/playerFinesStore.js');
const presentation = read('src/utils/playerFinesPresentation.js');
const sharedPresentation = read('src/utils/finesPresentation.js');
const playerSource = [app, navigation, panel, store, presentation].join('\n');

assert.match(app, /import PlayerFinesPanel from '\.\/components\/player\/PlayerFinesPanel';/);
assert.match(app, /activeSection === 'fines' \? \([\s\S]*?<PlayerFinesPanel client=\{client\} \/>[\s\S]*?<PlayerFinesTransparencyPanel client=\{client\} \/>[\s\S]*?\) : null/);
assert.equal((navigation.match(/\['fines', 'Multas'\]/g) || []).length, 1, 'Multas aparece una sola vez en la navegación PLAYER.');
assert.match(navigation, /sm:grid-cols-5/);

assert.equal((store.match(/client\.rpc\(/g) || []).length, 2, 'El store PLAYER solo ejecuta dos rutas RPC.');
assert.match(store, /list: 'get_my_fines'/);
assert.match(store, /summary: 'get_my_fines_summary'/);
assert.match(store, /client\.rpc\(PLAYER_FINES_RPCS\.list, \{ p_limit: limit, p_offset: offset \}\)/);
assert.match(store, /client\.rpc\(PLAYER_FINES_RPCS\.summary\)/);
assert.doesNotMatch(store, /p_(?:jugador|subject|club|membership|user|player)_id/i);
assert.doesNotMatch(playerSource, /\.from\s*\(/, 'Mis multas no consulta tablas directamente.');

for (const rpc of [
  'get_fine_rules_for_management', 'get_fine_subjects_for_management',
  'get_fines_management_list', 'get_fines_financial_summary', 'get_fines_subject_summary',
  'create_fine_individual', 'create_fine_collective', 'record_fine_payment',
  'record_fine_refund', 'cancel_fine',
]) assert.equal(playerSource.includes(rpc), false, `PLAYER no puede incluir ${rpc}.`);
for (const operation of [
  'createFineIndividual', 'createFineCollective', 'recordFinePayment',
  'recordFineRefund', 'cancelFine', 'getFineSubjectsForManagement',
  'getFineRulesForManagement', 'getFinesSubjectSummary', 'getFinesFinancialSummary',
]) assert.equal(playerSource.includes(operation), false, `PLAYER no importa ${operation}.`);

assert.doesNotMatch(playerSource, /\bfines_manage\b|role\s*={2,3}\s*['"]captain['"]/i);
assert.doesNotMatch(playerSource, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
assert.doesNotMatch(playerSource, /ranking|comparaci[oó]n con compañeros|situaci[oó]n por jugador|totales del equipo/iu);
assert.doesNotMatch(store, /subject_name|jugador_id|club_id|created_by|cancelled_by/i, 'La allowlist PLAYER no expone identidad o actor de terceros.');

for (const copy of [
  'Mis multas', 'Consulta tus sanciones y pagos.', 'Pendiente', 'Pagado',
  'Activas', 'Pagadas', 'Histórico', 'Vencida', 'Original', 'Recargo',
  'Vence', 'Nota', 'Motivo de anulación', 'Cargar más',
  'No tienes multas registradas.', 'Cuando exista alguna, aparecerá aquí.',
  'No se pudieron cargar tus multas.', 'Reintentar',
]) assert.ok(panel.includes(copy), `Falta contenido o estado PLAYER: ${copy}.`);

for (const label of ['Pendiente', 'Parcial', 'Pagada', 'Anulada']) {
  assert.ok(sharedPresentation.includes(`label: '${label}'`), `Falta presentar el estado ${label}.`);
}
assert.match(panel, /getFineStatusPresentation\(fine\)/);
assert.match(panel, /isPlayerFineOverdue\(fine\)/);
assert.match(presentation, /fine\.lifecycle_status === 'active'[\s\S]*numericAmount\(fine\.pending_amount\) > 0[\s\S]*today > fine\.due_on/);
assert.match(panel, /hasPlayerFineSurcharge\(fine\)/);
assert.match(panel, /surchargeVisible \? <AmountItem label="Recargo"/);
assert.match(panel, /fine\.note \? <section/);
assert.match(panel, /fine\.lifecycle_status === 'cancelled' && fine\.cancellation_reason/);

assert.match(panel, /PLAYER_FINE_FILTERS\.map/);
assert.match(panel, /filterPlayerFines\(listState\.rows, filter\)/);
assert.match(panel, /Los filtros se aplican a las multas cargadas\./);
assert.match(panel, /PLAYER_FINES_PAGE_SIZE = 30|PLAYER_FINES_PAGE_SIZE/);
assert.match(panel, /offset: listState\.rows\.length/);
assert.match(panel, /listState\.hasMore \?/);
assert.match(panel, /summary\.pending_total/);
assert.match(panel, /summary\.collected_total/);
assert.match(panel, /summary\.active_fines/);
assert.match(panel, /summary\.paid_count/);
assert.match(panel, /summary\.surcharge_total > 0/);

assert.match(panel, /summaryState\.status === 'loading' && listState\.status === 'loading'/);
assert.match(panel, /summaryState\.status === 'error'/);
assert.match(panel, /listState\.status === 'error'/);
assert.match(panel, /listState\.rows\.length === 0/);
assert.match(panel, /grid grid-cols-2 gap-2 sm:grid-cols-4/);
assert.match(panel, /snap-x snap-mandatory[^"]*overflow-x-auto[^"]*scroll-smooth/);
assert.match(panel, /min-h-11 shrink-0 snap-start/);
assert.match(panel, /lg:grid-cols-2/);
assert.doesNotMatch(panel, /<table|min-w-\[[4-9]\d\dpx\]/, 'Mis multas no introduce tabla ni contenido con ancho fijo desbordante.');
assert.match(panel, /formatFinesCurrency\(/);
assert.match(panel, /formatFinesDate\(/);

for (const forbiddenButton of ['Pagar', 'Registrar pago', 'Reembolso', 'Anular', 'Editar', 'Eliminar']) {
  const escaped = forbiddenButton.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.doesNotMatch(panel, new RegExp(`>\\s*${escaped}\\s*<`, 'i'), `PLAYER no renderiza la acción ${forbiddenButton}.`);
}

console.log('Mis multas PLAYER: dos RPC propias, privacidad, KPIs, tarjetas, estados, filtros y responsive validados.');
