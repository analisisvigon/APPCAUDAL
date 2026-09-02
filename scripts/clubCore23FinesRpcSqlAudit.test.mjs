import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL('../supabase_club_core_23_fines_rpc.sql', import.meta.url),
  'utf8',
);
const verifier = fs.readFileSync(
  new URL('../supabase_club_core_23_fines_rpc_verify.sql', import.meta.url),
  'utf8',
);

const compact = (value) => value.toLowerCase().replace(/\s+/g, ' ');
const normalizedMigration = compact(migration);
const normalizedVerifier = compact(verifier);
const executableMigration = compact(migration.replace(/--.*$/gm, ''));

assert.match(migration, /^-- APPCAUDAL - Bloque 4\.5/m);
assert.match(normalizedMigration, /begin;.*commit;/s);

const publicRpcs = [
  'get_fine_rules_for_management()',
  'get_fine_subjects_for_management()',
  'create_fine_individual(',
  'create_fine_collective(',
  'cancel_fine(',
  'record_fine_payment(',
  'record_fine_refund(',
  'get_my_fines(',
  'get_my_fines_summary()',
  'get_fines_management_list(',
  'get_fines_financial_summary(',
  'get_fines_subject_summary(',
];
for (const rpc of publicRpcs) {
  assert.ok(normalizedMigration.includes(`function public.${rpc}`), `Falta RPC ${rpc}.`);
}

assert.match(normalizedMigration, /create function public\.require_fines_manager\(\)/);
assert.match(normalizedMigration, /if not public\.can_manage_fines\(\)/);
assert.match(normalizedMigration, /from public\.current_membership\(\) membership/);
assert.match(normalizedMigration, /create function public\.resolve_fines_season\(/);
assert.match(normalizedMigration, /season\.starts_on <= p_reference_on/);
assert.match(normalizedMigration, /season\.ends_on >= p_reference_on/);
assert.match(normalizedMigration, /if season_count <> 1/);

assert.match(normalizedMigration, /create function public\.create_fine_individual\([\s\S]*?p_rule_id uuid[\s\S]*?p_subject_id uuid[\s\S]*?p_occurred_on date[\s\S]*?p_note text default null/);
assert.match(normalizedMigration, /insert into public\.fine_incidents[\s\S]*?insert into public\.fines/);
assert.match(normalizedMigration, /rule_row\.pricing_mode = 'unpriced'/);
assert.match(normalizedMigration, /subject_row\.subject_type = 'player'[\s\S]*?rule_row\.applies_to_players/);
assert.match(normalizedMigration, /subject_row\.subject_type = 'staff'[\s\S]*?rule_row\.applies_to_staff/);
assert.match(normalizedMigration, /char_length\(p_note\) > 500/);

assert.match(normalizedMigration, /create function public\.create_fine_collective\(/);
assert.match(normalizedMigration, /cardinality\(p_subject_ids\)/);
assert.match(normalizedMigration, /requested_count < 1 or requested_count > 100/);
assert.match(normalizedMigration, /count\(distinct input\.subject_id\)/);
assert.match(normalizedMigration, /not rule_row\.collective_allowed/);

assert.match(normalizedMigration, /create function public\.cancel_fine\(/);
assert.match(normalizedMigration, /collected_value <> 0/);
assert.match(normalizedMigration, /cancelled_by_membership_id = actor\.membership_id/);
assert.doesNotMatch(normalizedMigration, /insert into public\.fine_payments[^;]*'refund'[^;]*cancel/i);

assert.match(normalizedMigration, /create function public\.record_fine_payment\(/);
assert.match(normalizedMigration, /perform public\.apply_fine_surcharge_if_due\(p_fine_id\)/);
assert.match(normalizedMigration, /'payment'/);
assert.match(normalizedMigration, /create function public\.record_fine_refund\(/);
assert.match(normalizedMigration, /'refund'/);
assert.match(normalizedMigration, /p_amount <> pg_catalog\.round\(p_amount, 2\)/);
assert.match(normalizedMigration, /recorded_by_membership_id[\s\S]*?actor\.membership_id/);

assert.match(normalizedMigration, /create or replace function public\.guard_fine_payment_integrity\(\)/);
for (const preservedGuard of [
  'for update',
  'collected_before + new.amount > generated_amount',
  'new.amount > collected_before',
  "tg_when = 'after'",
  'apply_fine_surcharge_if_due(new.fine_id)',
]) {
  assert.ok(normalizedMigration.includes(preservedGuard), `El guard 4.4 pierde ${preservedGuard}.`);
}
assert.match(normalizedMigration, /actor_role = 'player'[\s\S]*?current_actor_matches[\s\S]*?public\.can_manage_fines\(\)/);

assert.match(normalizedMigration, /create function public\.get_my_fines\(/);
assert.match(normalizedMigration, /public\.current_jugador_id\(\)/);
assert.match(normalizedMigration, /subject\.jugador_id = actor_jugador_id/);
assert.doesNotMatch(normalizedMigration, /get_my_fines\([\s\S]{0,100}jugador_id/);
assert.match(normalizedMigration, /create function public\.get_my_fines_summary\(\)/);
assert.match(normalizedMigration, /where own\.lifecycle_status = 'active'/);
assert.match(normalizedMigration, /where own\.lifecycle_status = 'cancelled'/);

assert.match(normalizedMigration, /create function public\.get_fines_management_list\(/);
assert.match(normalizedMigration, /p_limit integer default 100[\s\S]*?p_season_code text default null/);
assert.match(normalizedMigration, /p_limit < 1 or p_limit > 200/);
assert.match(normalizedMigration, /'all', 'unpaid', 'partial', 'paid', 'cancelled', 'overdue'/);
assert.match(normalizedMigration, /create function public\.get_fines_financial_summary\(/);
assert.match(normalizedMigration, /create function public\.get_fines_subject_summary\(/);
assert.match(normalizedMigration, /group by subject\.id/);
assert.match(normalizedMigration, /fine\.lifecycle_status = 'active'/);

assert.doesNotMatch(
  executableMigration,
  /\b(p_club_id|p_membership_id|p_created_by_membership_id|p_recorded_by_membership_id|p_cancelled_by_membership_id)\b[^;]*create_fine_(individual|collective)/,
);
assert.doesNotMatch(executableMigration, /insert into public\.club_member_permissions/);
assert.doesNotMatch(executableMigration, /role\s*(=|in)\s*[^;]*'captain'/);
assert.doesNotMatch(executableMigration, /create table/);
assert.doesNotMatch(executableMigration, /(create|drop|alter) policy/);
assert.doesNotMatch(executableMigration, /alter table public\.[a-z_]+ (enable|disable|force|no force) row level security/);
assert.doesNotMatch(executableMigration, /grant [^;]* on table/);
assert.doesNotMatch(executableMigration, /fine_fund_expenses|pg_cron|cron\./);
assert.doesNotMatch(executableMigration, /\b(react|playerapp|app\.jsx|\.css)\b/);

assert.match(normalizedMigration, /security definer/g);
assert.match(normalizedMigration, /set search_path = pg_catalog/g);
for (const rpc of publicRpcs) {
  const escaped = rpc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('\\(', '\\(');
  assert.match(normalizedMigration, new RegExp(`grant execute on function public\\.${escaped}`));
}
assert.match(normalizedMigration, /revoke all on function public\.require_fines_manager\(\)[\s\S]*?authenticated/);
assert.match(normalizedMigration, /revoke all on function public\.resolve_fines_season\(uuid,date,text\)[\s\S]*?authenticated/);
assert.match(normalizedMigration, /acl\.privilege_type = 'execute'[\s\S]*?acl\.grantee not in/);

assert.match(normalizedVerifier, /create or replace function pg_temp\.verify_fines_rpc\(\)/);
assert.match(normalizedVerifier, /select test_name, test_ok, details from pg_temp\.verify_fines_rpc\(\); rollback;/);
for (const scenario of [
  'staff_management_catalog',
  'individual_creation_contract',
  'collective_creation_contract',
  'duplicate_collective_rejected',
  'unpriced_rule_rejected',
  'payment_refund_flow',
  'surcharge_via_rpc',
  'cancel_contract',
  'player_own_read_isolated',
  'player_own_summary',
  'normal_player_management_denied',
  'transient_player_manager_flow',
  'viewer_with_permission_denied',
  'cross_club_idor_rejected',
  'direct_table_access_regression',
]) {
  assert.ok(normalizedVerifier.includes(scenario), `Falta escenario ${scenario}.`);
}
assert.match(normalizedVerifier, /viewer \+ permission: can_manage=false, 10\/10 manager rpcs denied/);
assert.match(normalizedVerifier, /get_fines_financial_summary\('verify45'\)/);
assert.match(normalizedVerifier, /only owner\/authenticated\/service_role execute/);

const verificationCount = [...verifier.matchAll(/test_name\s*:=/g)].length;
assert.equal(verificationCount, 58, `El verificador debe producir 58 checks; produce ${verificationCount}.`);

console.log(`Club Core 23 fines RPC SQL audit: OK (${verificationCount} checks)`);
