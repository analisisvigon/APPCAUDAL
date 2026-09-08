import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL('../supabase_club_core_27_player_match_stats_publication_fix.sql', import.meta.url),
  'utf8',
);
const verify = fs.readFileSync(
  new URL('../supabase_club_core_27_player_match_stats_publication_fix_verify.sql', import.meta.url),
  'utf8',
);
const compact = (value) => value.toLowerCase().replace(/\s+/g, ' ').trim();
const executable = (value) => compact(value.replace(/--.*$/gm, ''));
const normalized = compact(migration);
const normalizedVerify = compact(verify);
const executableMigration = executable(migration);
const executableVerify = executable(verify);

assert.match(migration, /^-- APPCAUDAL - PLAYER match stats: alineacion con el publication gate canonico/m);
assert.match(normalized, /begin;[\s\S]*commit;$/);
assert.match(normalized, /public\.get_my_player_analysis_match_stats\(text,text,text\)/);
assert.match(normalized, /public\.is_player_match_publishable\(text,text,timestamp with time zone\)/);
assert.match(normalized, /canonical_condition constant text := 'public\.is_player_match_publishable\(serialized\.payload ->> ''status'', serialized\.payload ->> ''date''\)'/);
assert.match(normalized, /live_stats no usa el publication gate final esperado/);
assert.match(normalized, /legacy_player_visible_pattern/);
assert.match(normalized, /legacy_status_pattern/);
assert.match(normalized, /player_visible_count = 1 and legacy_status_count = 1 and helper_name_count = 0 and canonical_call_count = 0/);
assert.match(normalized, /player_visible_count = 0 and legacy_status_count = 0 and helper_name_count = 1 and canonical_call_count = 1/);
assert.match(normalized, /transformed_source := pg_catalog\.regexp_replace\( original_source, legacy_player_visible_pattern, 'where true'/);
assert.match(normalized, /transformed_source := pg_catalog\.regexp_replace\( transformed_source, legacy_status_pattern, canonical_condition/);
assert.match(normalized, /execute transformed_definition/);

assert.match(normalized, /pronargs <> 3/);
assert.match(normalized, /pronargdefaults <> 3/);
assert.match(normalized, /proowner <> 'postgres'::regrole/);
assert.match(normalized, /not function_row\.prosecdef/);
assert.match(normalized, /function_row\.provolatile <> 's'/);
assert.match(normalized, /array\['search_path=pg_catalog'\]::text\[\]/);
assert.match(normalized, /has_function_privilege\( 'authenticated', function_row\.oid, 'execute' \)/);
assert.match(normalized, /has_function_privilege\( 'service_role', function_row\.oid, 'execute' \)/);
assert.match(normalized, /has_function_privilege\('anon', function_row\.oid, 'execute'\)/);
assert.doesNotMatch(executableMigration, /\b(grant|revoke|alter table|create table|create index|create policy|drop policy|drop function)\b/);
assert.doesNotMatch(executableMigration, /\b(insert into|update|delete from) public\./);
for (const rpc of [
  'get_my_player_analysis_live_stats',
  'get_my_player_match_history',
  'get_my_player_analysis_overview',
  'get_my_player_production_actions',
]) {
  assert.doesNotMatch(
    executableMigration,
    new RegExp(`create or replace function public\\.${rpc}\\s*\\(`),
    `${rpc} no puede reemplazarse en Core 27.`,
  );
}

assert.match(normalized, /helper_count <> 1/);
assert.match(normalized, /strpos\(function_row\.prosrc, canonical_condition\) = 0/);
assert.match(normalized, /strpos\(function_row\.prosrc, 'player_visible'\) <> 0/);
assert.match(normalized, /legacy_count <> 0/);

assert.match(normalizedVerify, /begin;[\s\S]*rollback;$/);
assert.doesNotMatch(executableVerify, /(^|;) commit;/);
assert.match(normalizedVerify, /gate_canonical_only/);
assert.match(normalizedVerify, /gate_live_stats_parity/);
assert.match(normalizedVerify, /at time zone ''europe\/madrid''/);
assert.match(normalizedVerify, /return madrid_today > match_day/);
assert.match(normalizedVerify, /gate_past_ignores_player_visible/);
assert.match(normalizedVerify, /'2020-01-01'[\s\S]*'finalizado'[\s\S]*false[\s\S]*'validado'/);
assert.match(normalizedVerify, /gate_future_finalized_excluded/);
assert.match(normalizedVerify, /'2099-01-10'[\s\S]*'finalizado'/);
assert.match(normalizedVerify, /gate_suspended_excluded/);
assert.doesNotMatch(normalizedVerify, /current_date\s*-\s*1/);
assert.match(normalizedVerify, /gate_delegated_invalid_excluded/);
assert.match(normalizedVerify, /gate_unreviewed_excluded/);
assert.match(normalizedVerify, /identity_other_player_excluded/);
assert.match(normalizedVerify, /runtime_minutes_null_vs_zero/);

for (const combination of [
  /\(1, 'season', 'all', 'last_3_event_matches'\)/,
  /\(2, 'season', 'all', 'last_5_event_matches'\)/,
  /\(3, 'season', 'all', 'full_scope'\)/,
  /\(4, 'all', 'all', 'full_scope'\)/,
  /\(5, 'league', 'home', 'full_scope'\)/,
  /\(6, 'league', 'away', 'full_scope'\)/,
]) assert.match(normalizedVerify, combination);

assert.match(normalizedVerify, /reconciliation_live_stats_exact/);
assert.match(normalizedVerify, /count\(\*\)::integer as matches_with_events/);
assert.match(normalizedVerify, /sum\(result\.shots_on_target\)/);
assert.match(normalizedVerify, /round\(comparison\.shots_on_target::numeric \* 100 \/ comparison\.shots, 2\)/);
assert.doesNotMatch(normalizedVerify, /avg\([^)]*shot_accuracy/);
assert.match(normalizedVerify, /goals_per_match[\s\S]*shots_per_match[\s\S]*shots_on_target_per_match[\s\S]*crosses_per_match[\s\S]*turnovers_per_match[\s\S]*steals_per_match[\s\S]*fouls_committed_per_match[\s\S]*fouls_received_per_match/);
assert.match(normalizedVerify, /jsonb_agg\(pg_catalog\.jsonb_build_object/);
assert.match(normalizedVerify, /role_viewer_denied/);
assert.match(normalizedVerify, /role_staff_denied/);
assert.match(normalizedVerify, /role_no_membership_denied/);
assert.match(normalizedVerify, /role_anon_denied/);
assert.match(normalizedVerify, /checks_before_counter=%s; expected=26; total_output=27/);
assert.equal(
  (normalizedVerify.match(/add_player_match_stats_gate_check\( '/g) || []).length,
  27,
  'Verify 27 debe emitir 27 checks, incluido el contador.',
);
assert.doesNotMatch(
  executableVerify,
  /(update|delete from) public\.(partidos|match_quick_events|partido_estadisticas_jugador|club_memberships)/,
);

console.log('Club Core 27 publication fix SQL audit: gate canonico y verify transaccional de 27 checks validados.');
