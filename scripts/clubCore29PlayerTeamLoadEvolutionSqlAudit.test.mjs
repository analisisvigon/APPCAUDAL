import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../supabase_club_core_29_player_team_load_evolution.sql', import.meta.url), 'utf8');
const verify = fs.readFileSync(new URL('../supabase_club_core_29_player_team_load_evolution_verify.sql', import.meta.url), 'utf8');
const compact = (value) => value.toLowerCase().replace(/\s+/g, ' ').trim();
const executable = (value) => compact(value.replace(/--.*$/gm, ''));
const normalized = compact(migration);
const normalizedVerify = compact(verify);
const executableMigration = executable(migration);
const executableVerify = executable(verify);

assert.match(migration, /^-- APPCAUDAL - Club Core 29 - PLAYER team load evolution\./m);
assert.match(normalized, /begin;[\s\S]*commit;$/);
assert.match(normalized, /create function public\.get_my_team_load_evolution\( p_start_date date, p_end_date date \)/);
assert.doesNotMatch(executableMigration, /create or replace function public\.get_my_team_load_evolution/);
assert.doesNotMatch(executableMigration, /p_(jugador|player|club|user|membership|session)_id/);

assert.match(normalized, /returns table \( session_date date, load_units numeric, distance_m numeric, hsr_m numeric, accelerations integer, decelerations integer, sprints integer, meters_per_minute numeric, actual_duration_minutes integer \)/);
const returnContract = normalized.match(/returns table \(([\s\S]*?)\) language plpgsql/)?.[1] || '';
for (const forbidden of [
  'id', 'notes', 'scope', 'jugador_id', 'aggregation_method', 'created_at',
  'updated_at', 'rpe', 'wellness', 'comment', 'discomfort', 'name',
]) {
  assert.doesNotMatch(` ${returnContract} `, new RegExp(`\\b${forbidden}\\b`), `DTO expone ${forbidden}`);
}

assert.match(normalized, /language plpgsql stable security definer set search_path = pg_catalog/);
assert.match(normalized, /from public\.current_membership\(\) membership/);
assert.match(normalized, /actor_role is distinct from 'player'/);
assert.match(normalized, /actor_jugador_id is null/);
assert.match(normalized, /actor_active is not true/);
assert.match(normalized, /club_count <> 1 or canonical_club_id is distinct from actor_club_id/);
assert.match(normalized, /not exists \( select 1 from public\.jugadores player where player\.id = actor_jugador_id \)/);

assert.match(normalized, /session_row\.record_kind = 'daily_team_load'/);
assert.match(normalized, /metric_row\.scope = 'team'/);
assert.match(normalized, /metric_row\.jugador_id is null/);
assert.match(normalized, /metric_row\.aggregation_method = 'team_average'/);
assert.match(normalized, /order by session_row\.session_date asc/);
assert.doesNotMatch(executableMigration, /\bcoalesce\s*\([^)]*(load_units|distance_m|hsr_m|accelerations|decelerations|sprints|meters_per_minute|actual_duration_minutes)[^)]*,\s*0/);

assert.match(normalized, /inclusive_day_count := \(p_end_date - p_start_date\) \+ 1/);
assert.match(normalized, /inclusive_day_count > 62/);
assert.match(normalized, /using errcode = '22023'/);

assert.match(normalized, /alter function public\.get_my_team_load_evolution\(date,date\) owner to postgres/);
assert.match(normalized, /revoke all on function public\.get_my_team_load_evolution\(date,date\) from public, anon, authenticated, service_role/);
assert.match(normalized, /grant execute on function public\.get_my_team_load_evolution\(date,date\) to authenticated/);

// Core 29 may create and secure only its RPC. It must not widen the STAFF tables.
assert.doesNotMatch(executableMigration, /\b(alter|create|drop)\s+(table|policy)\b/);
assert.doesNotMatch(executableMigration, /\bgrant\b[^;]*\bon\s+table\b/);
assert.doesNotMatch(executableMigration, /\brevoke\b[^;]*\bon\s+table\b/);
assert.doesNotMatch(executableMigration, /\b(insert\s+into|update|delete\s+from)\s+public\./);
assert.doesNotMatch(executableMigration, /public\.(wellness_entries|rpe_entries|rpe_sync_pending)/);

assert.match(normalizedVerify, /begin;[\s\S]*rollback;$/);
assert.doesNotMatch(executableVerify, /(^|;) commit;/);
for (const check of [
  'PREREQUISITES_single_club_owner_unbound_player',
  'FUNCTION_exact_signature',
  'FUNCTION_no_defaults',
  'FUNCTION_owner_postgres',
  'FUNCTION_stable_security_definer_search_path',
  'FUNCTION_authenticated_only_acl',
  'DTO_exact_columns_and_types',
  'DTO_no_identifiers_or_private_fields',
  'SOURCE_exact_team_filters',
  'TABLE_RLS_training_sessions_staff_contract',
  'TABLE_RLS_training_session_load_metrics_staff_contract',
  'TABLE_RLS_staff_contract_intact',
  'RANGE_null_start_22023',
  'RANGE_null_end_22023',
  'RANGE_reversed_22023',
  'RANGE_over_62_days_22023',
  'RANGE_62_days_allowed',
  'PLAYER_valid_allowed',
  'PLAYER_fixture_context_exact',
  'PLAYER_direct_training_sessions_blocked',
  'PLAYER_direct_training_session_load_metrics_blocked',
  'PLAYER_direct_tables_still_denied',
  'RESULT_only_team_rows',
  'RESULT_one_row_per_day',
  'RESULT_order_ascending',
  'RESULT_runtime_exact_keys',
  'RESULT_null_preserved',
  'RESULT_zero_preserved',
  'RESULT_eight_metrics_exact_values',
  'RESULT_actual_duration_minutes',
  'ROLE_staff_denied',
  'ROLE_viewer_denied',
  'ROLE_no_membership_denied',
  'ROLE_anon_denied',
  'CROSS_CLUB_fail_closed',
]) assert.ok(verify.includes(`'${check}'`), `Verifier Core 29 sin ${check}`);

assert.match(normalizedVerify, /insert into public\.training_session_load_metrics[\s\S]*'team'[\s\S]*'player'/);
assert.match(normalizedVerify, /'player', fixture_player_id, null, 999/);
assert.match(normalizedVerify, /relation\.relrowsecurity/);
assert.match(normalizedVerify, /relation\.relforcerowsecurity/);
assert.match(normalizedVerify, /pg_catalog\.aclexplode/);
assert.match(normalizedVerify, /pg_catalog\.has_table_privilege\('authenticated', relation\.relation_oid, 'select'\)/);
assert.match(normalizedVerify, /training_sessions_sqlstate = '42501'[\s\S]*training_sessions_visible_count = 0/);
assert.match(normalizedVerify, /load_metrics_sqlstate = '42501'[\s\S]*load_metrics_visible_count = 0/);
assert.doesNotMatch(executableVerify, /from pg_catalog\.pg_policy policy where policy\.polrelid = 'public\.training_sessions'::regclass\) = 4/);
assert.doesNotMatch(executableVerify, /\b(create|alter|drop)\s+policy\b/);
assert.doesNotMatch(executableVerify, /\b(grant|revoke)\b[^;]*\bon\s+table\b/);
assert.match(normalizedVerify, /with ordinality output_row/);
assert.match(normalizedVerify, /insert into public\.clubs[\s\S]*verify29 second club/);
assert.match(normalizedVerify, /create temporary table core29_verify_results[\s\S]*on commit drop/);
assert.match(normalizedVerify, /select test_name, test_ok, details[\s\S]*rollback;$/);

console.log('Club Core 29 PLAYER team load evolution SQL audit: OK (diagnostic transactional checks).');
