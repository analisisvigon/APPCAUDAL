import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../supabase_club_core_30_training_load_metrics_rls_fix.sql', import.meta.url), 'utf8');
const verify = fs.readFileSync(new URL('../supabase_club_core_30_training_load_metrics_rls_fix_verify.sql', import.meta.url), 'utf8');
const core10 = fs.readFileSync(new URL('../supabase_club_core_10_performance_staff_rls.sql', import.meta.url), 'utf8');
const phase1 = fs.readFileSync(new URL('../supabase_training_daily_load_phase1.sql', import.meta.url), 'utf8');
const rendimiento = fs.readFileSync(new URL('../supabase_rendimiento.sql', import.meta.url), 'utf8');

const compact = (value) => value.toLowerCase().replace(/\s+/g, ' ').trim();
const executable = (value) => compact(value.replace(/--.*$/gm, ''));
const normalizedMigration = compact(migration);
const normalizedVerify = compact(verify);
const executableMigration = executable(migration);
const executableVerify = executable(verify);

assert.match(migration, /^-- APPCAUDAL - Club Core 30 - Training load metrics legacy RLS fix\./m);
assert.match(normalizedMigration, /^--[\s\S]*begin;[\s\S]*commit;$/);

// Historical provenance: only the daily-load phase created these metrics
// policies. rendimiento.sql created similarly named policies for other tables.
for (const policyName of [
  'Authenticated staff can read training load metrics',
  'Authenticated staff can write training load metrics',
]) {
  assert.ok(phase1.includes(`create policy "${policyName}"`), `Origen historico ausente para ${policyName}`);
  assert.ok(core10.includes(`drop policy if exists "${policyName}"`), `Core 10 no elimina ${policyName}`);
  assert.ok(!rendimiento.includes(policyName), `supabase_rendimiento.sql no debe ser el origen de ${policyName}`);
}

const legacyDrops = executableMigration.match(/\bdrop policy if exists\b/g) || [];
assert.equal(legacyDrops.length, 2, 'Core 30 debe ejecutar exactamente dos DROP POLICY');
assert.match(executableMigration, /drop policy if exists "authenticated staff can read training load metrics" on public\.training_session_load_metrics;/);
assert.match(executableMigration, /drop policy if exists "authenticated staff can write training load metrics" on public\.training_session_load_metrics;/);

assert.doesNotMatch(executableMigration, /\bcreate\s+policy\b/);
assert.doesNotMatch(executableMigration, /\balter\s+policy\b/);
assert.doesNotMatch(executableMigration, /\bdrop\s+policy\s+(?!if exists "authenticated staff can (?:read|write) training load metrics")/);
assert.doesNotMatch(executableMigration, /\b(grant|revoke)\b/);
assert.doesNotMatch(executableMigration, /\b(insert\s+into|update|delete\s+from)\s+public\./);
assert.doesNotMatch(executableMigration, /\bon\s+public\.training_sessions\b/);
assert.doesNotMatch(executableMigration, /\balter\s+table\s+public\.training_sessions\b/);

for (const canonicalPolicy of [
  'performance_staff_select',
  'performance_staff_insert',
  'performance_staff_update',
  'performance_staff_delete',
]) {
  assert.ok(migration.includes(`'${canonicalPolicy}'`), `Postcondicion sin ${canonicalPolicy}`);
  assert.doesNotMatch(executableMigration, new RegExp(`drop policy(?: if exists)? ${canonicalPolicy}\\b`));
}

assert.match(normalizedMigration, /relation\.relrowsecurity/);
assert.match(normalizedMigration, /count\(\*\)[\s\S]*training_session_load_metrics[\s\S]*<> 4/);
assert.match(normalizedMigration, /is_app_staff/);
assert.match(normalizedMigration, /using[\s\S]*true|normalized[\s\S]*true/);

assert.match(normalizedVerify, /begin;[\s\S]*rollback;$/);
assert.doesNotMatch(executableVerify, /(^|;) commit;/);
assert.doesNotMatch(executableVerify, /\b(create|alter|drop)\s+policy\b/);
assert.doesNotMatch(executableVerify, /\b(grant|revoke)\b[^;]*\bon\s+table\b/);

const expectedChecks = [
  'PREREQUISITES_single_club_owner_unbound_player',
  'RLS_training_load_metrics_enabled',
  'RLS_exact_four_canonical_staff_policies',
  'RLS_legacy_read_policy_absent',
  'RLS_legacy_write_policy_absent',
  'RLS_zero_client_using_true',
  'RLS_zero_client_with_check_true',
  'RLS_no_player_policy',
  'GRANTS_preserved_authenticated_crud_anon_denied',
  'REGRESSION_training_sessions_contract_intact',
  'PLAYER_context_exact',
  'PLAYER_direct_select_zero',
  'PLAYER_insert_denied',
  'PLAYER_update_denied_or_zero',
  'PLAYER_delete_denied_or_zero',
  'VIEWER_context_exact',
  'VIEWER_direct_select_zero',
  'VIEWER_insert_denied',
  'VIEWER_update_denied_or_zero',
  'VIEWER_delete_denied_or_zero',
  'ANON_select_denied',
  'ANON_insert_denied',
  'STAFF_context_exact',
  'STAFF_select_works',
  'STAFF_insert_works',
  'STAFF_update_works',
  'STAFF_delete_works',
  'CORE29_function_security_contract_intact',
  'CORE29_rpc_player_works',
  'CORE29_dto_and_team_only_privacy_intact',
];
for (const check of expectedChecks) {
  assert.ok(verify.includes(`'${check}'`), `Verifier Core 30 sin ${check}`);
}
assert.equal((verify.match(/perform pg_temp\.add_core30_check\(/g) || []).length, 30);

assert.match(normalizedVerify, /set local role authenticated/);
assert.match(normalizedVerify, /set local role anon/);
assert.match(normalizedVerify, /public\.is_player\(\)/);
assert.match(normalizedVerify, /public\.is_app_staff\(\)/);
assert.match(normalizedVerify, /from public\.get_my_team_load_evolution\(fixture_start, fixture_start\)/);
assert.match(normalizedVerify, /rpc_player_metric_id[\s\S]*'player'[\s\S]*999/);
assert.match(normalizedVerify, /player_context\.database_role = 'authenticated'/);
assert.match(normalizedVerify, /error_state = '42501'/);
assert.match(normalizedVerify, /affected_count = 0/);
assert.match(normalizedVerify, /affected_count = 1/);

for (const frontendIdentifier of [
  'PlayerPerformancePanel',
  'playerPerformanceStore',
  'LoadEvolutionSection',
  'performanceLoad.js',
]) {
  assert.ok(!migration.includes(frontendIdentifier));
  assert.ok(!verify.includes(frontendIdentifier));
}

console.log('Club Core 30 training load metrics RLS fix SQL audit: OK (30 transactional checks).');
