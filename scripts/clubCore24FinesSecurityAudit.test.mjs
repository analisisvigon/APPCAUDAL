import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const read = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const compact = (value) => value.toLowerCase().replace(/\s+/g, ' ');
const executable = (value) => compact(value.replace(/--.*$/gm, ''));

const migration19 = read('supabase_club_core_19_fines_foundation.sql');
const migration20 = read('supabase_club_core_20_fine_rules.sql');
const migration21 = read('supabase_club_core_21_fines_core.sql');
const migration22 = read('supabase_club_core_22_fine_payments.sql');
const migration23 = read('supabase_club_core_23_fines_rpc.sql');
const verifier = read('supabase_club_core_24_fines_security_verify.sql');
const packageJson = JSON.parse(read('package.json'));

assert.equal(
  fs.existsSync(new URL('../supabase_club_core_24_fines_security.sql', import.meta.url)),
  false,
  'Bloque 4.6 no debe crear una migración 24 de cambios.',
);

const normalized23 = compact(migration23);
const normalizedVerifier = compact(verifier);
const executable23 = executable(migration23);
const allBackend = compact([migration19, migration20, migration21, migration22, migration23].join('\n'));

const publicRpcs = [
  'get_fine_rules_for_management()',
  'get_fine_subjects_for_management()',
  'create_fine_individual(uuid,uuid,date,text)',
  'create_fine_collective(uuid,uuid[],date,text)',
  'cancel_fine(uuid,text)',
  'record_fine_payment(uuid,numeric,date,text)',
  'record_fine_refund(uuid,numeric,date,text)',
  'get_my_fines(integer,integer)',
  'get_my_fines_summary()',
  'get_fines_management_list(text,integer,integer,text)',
  'get_fines_financial_summary(text)',
  'get_fines_subject_summary(text)',
];

for (const signature of publicRpcs) {
  const functionName = signature.slice(0, signature.indexOf('('));
  assert.match(normalized23, new RegExp(`function public\\.${functionName}\\s*\\(`));
  assert.ok(normalizedVerifier.includes(`public.${signature}`), `El verify 24 no inventaría ${signature}.`);
}

assert.equal(
  [...migration23.matchAll(/^create function public\.(get_|create_|cancel_|record_)/gm)].length,
  12,
  'Deben seguir existiendo exactamente 12 RPC públicas del Bloque 4.5.',
);
assert.match(normalized23, /security definer/);
assert.match(normalized23, /set search_path = pg_catalog/);
assert.match(normalized23, /if not public\.can_manage_fines\(\)/);
assert.match(normalized23, /from public\.current_membership\(\) membership/);
assert.match(normalized23, /public\.current_jugador_id\(\)/);
assert.doesNotMatch(
  executable23,
  /create_fine_(individual|collective)\s*\([^)]*p_club_id|p_(created|recorded|cancelled)_by_membership_id/,
);

assert.doesNotMatch(executable23, /(create|drop|alter) policy/);
assert.doesNotMatch(executable23, /grant [^;]* on table/);
assert.doesNotMatch(executable23, /insert into public\.club_member_permissions/);
assert.doesNotMatch(executable23, /role\s*=\s*'captain'/);
assert.doesNotMatch(executable23, /fine_fund_expenses|pg_cron|cron\./);

assert.match(allBackend, /for update/);
assert.match(allBackend, /collected_before \+ new\.amount > generated_amount/);
assert.match(allBackend, /new\.amount > collected_before/);
assert.match(allBackend, /tg_op <> 'insert'/);
assert.match(allBackend, /identidad y los snapshots de una incidencia son inmutables/);
assert.match(allBackend, /identidad, el importe y los snapshots de una multa son inmutables/);
assert.match(allBackend, /el recargo ya aplicado es inmutable y no puede repetirse/);

assert.match(verifier, /^-- APPCAUDAL - Bloque 4\.6/m);
assert.match(normalizedVerifier, /begin;.*rollback;/s);
assert.match(normalizedVerifier, /create temporary table fines_security_results/);
assert.match(normalizedVerifier, /select test_name, test_ok, details from pg_temp\.fines_security_results order by seq; rollback;/);
assert.match(normalizedVerifier, /final_check_count_at_least_80/);
assert.match(normalizedVerifier, /fine_incidents.*fines.*fine_payments/s);
assert.match(normalizedVerifier, /player_normal_management_denied/);
assert.match(normalizedVerifier, /captain_player_identity_preserved/);
assert.match(normalizedVerifier, /captain_direct_five_tables_zero/);
assert.match(normalizedVerifier, /viewer_permission_fail_closed/);
assert.match(
  normalizedVerifier,
  /player \+ fines_manage is a reversible subtransaction\. begin execute 'reset role'; perform pg_catalog\.set_config\('request\.jwt\.claim\.sub','',true\)/,
);
assert.match(
  normalizedVerifier,
  /viewer \+ permission remains fail-closed\. begin execute 'reset role'; perform pg_catalog\.set_config\('request\.jwt\.claim\.sub','',true\)/,
);
assert.match(normalizedVerifier, /viewer_membership_id := staff_membership_id/);
assert.match(normalizedVerifier, /permission_count=%s is_player=%s is_app_staff=%s current_jugador_id=%s can_manage=%s scenario_error=%s/);
assert.match(normalizedVerifier, /allowed=%s denied=%s; %s scenario_error=%s/);
assert.match(normalizedVerifier, /fine_rules=%s fine_subjects=%s fine_incidents=%s fines=%s fine_payments=%s/);
assert.match(normalizedVerifier, /insert fine_incidents=%s; update fines=%s; delete fine_payments=%s; expected sqlstate=42501/);
assert.match(normalizedVerifier, /viewer_management_allowed = 0/);
for (const operation of [
  'rules',
  'subjects',
  'create_individual',
  'create_collective',
  'payment',
  'refund',
  'cancel',
  'management_list',
  'financial_summary',
  'subject_summary',
]) {
  assert.ok(
    normalizedVerifier.includes(`${operation}=allowed`) && normalizedVerifier.includes(`${operation}=denied[`),
    `Falta el diagnÃ³stico allowed/denied de ${operation} para CAPTAIN.`,
  );
}
assert.match(normalizedVerifier, /uid_without_membership_fail_closed/);
assert.match(normalizedVerifier, /anon_all_function_paths_denied/);
assert.match(normalizedVerifier, /idor_cross_club_five_paths_denied/);
assert.match(normalizedVerifier, /payment_4_partial/);
assert.match(normalizedVerifier, /refund_3_partial/);
assert.match(normalizedVerifier, /surcharge_original_outstanding/);
assert.match(
  normalizedVerifier,
  /select fine\.surcharge_amount, fine\.surcharge_base_amount into refund_reopen_surcharge_amount, refund_reopen_surcharge_base_amount from public\.fines fine where fine\.id = refund_reopen_fine/,
);
assert.match(
  normalizedVerifier,
  /refund_reopen_surcharge_base_amount = 3\.00 and refund_reopen_surcharge_amount = 1\.50/,
);
assert.doesNotMatch(
  normalizedVerifier,
  /record_fine_refund\(refund_reopen_fine[\s\S]{0,800}?result_row\.surcharge_amount/,
  'record_fine_refund no devuelve surcharge_amount; debe comprobarse en public.fines.',
);
assert.match(normalizedVerifier, /cancelled_with_surcharge_zero_cash/);
assert.match(normalizedVerifier, /ledger_update_immutable/);
assert.match(normalizedVerifier, /snapshot_rule_immutable/);
assert.match(normalizedVerifier, /summary_financial_amounts/);
assert.match(normalizedVerifier, /summary_subject_three_or_more/);
assert.match(normalizedVerifier, /overdue_exact_definition/);
assert.match(normalizedVerifier, /service_role_infrastructure_write/);
assert.match(normalizedVerifier, /service_role_still_guarded/);
assert.match(normalizedVerifier, /pagination_player_limits/);
assert.match(normalizedVerifier, /season_unknown_rejected/);
assert.match(normalizedVerifier, /final_real_permission_still_zero/);
assert.match(normalizedVerifier, /final_transactional_fixture_inventory/);

const explicitChecks = [...verifier.matchAll(/perform\s+pg_temp\.add_fines_security_check\s*\(/gi)].length;
const dynamicChecks = 12 + 10 + 7 + 6 + 6;
const finalCountCheck = 1;
const expectedChecks = explicitChecks + dynamicChecks + finalCountCheck;
assert.ok(expectedChecks >= 80, `El verificador solo produciría ${expectedChecks} checks.`);
assert.equal(expectedChecks, 134, 'Actualizar el contrato estático si cambia la cobertura real del verify 24.');

assert.equal(packageJson.scripts['test:fines-security'], 'node scripts/clubCore24FinesSecurityAudit.test.mjs');

const changedTrackedFiles = execFileSync('git', ['diff', '--name-only'], {
  cwd: new URL('..', import.meta.url),
  encoding: 'utf8',
})
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);

assert.equal(
  changedTrackedFiles.some((path) => /^supabase_club_core_(?:0[1-9]|1\d|2[0-3])_/.test(path)),
  false,
  'No se puede modificar una migración 01-23 en el Bloque 4.6.',
);
assert.equal(
  changedTrackedFiles.some((path) => path.startsWith('src/') || /(^|\/)(App|PlayerApp)\.(jsx?|tsx?)$/.test(path)),
  false,
  'El Bloque 4.6 no puede modificar frontend.',
);

console.log(`Club Core 24 fines security audit: OK (${expectedChecks} SQL checks expected)`);
