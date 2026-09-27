import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../supabase_club_core_31_canonical_substitutions.sql', import.meta.url), 'utf8');
const verify = fs.readFileSync(new URL('../supabase_club_core_31_canonical_substitutions_verify.sql', import.meta.url), 'utf8');
const compact = (value) => value.toLowerCase().replace(/\s+/g, ' ').trim();
const executable = (value) => compact(value.replace(/--.*$/gm, ''));
const normalizedMigration = compact(migration);
const normalizedVerify = compact(verify);
const executableMigration = executable(migration);

assert.match(migration, /^-- APPCAUDAL - Club Core 31 - Sustituciones canonicas encadenadas\./m);
assert.match(normalizedMigration, /^--[\s\S]*begin;[\s\S]*commit;$/);
assert.match(normalizedVerify, /begin;[\s\S]*rollback;$/);

for (const column of [
  'partido_id', 'minute', 'event_order', 'outgoing_jugador_id',
  'incoming_jugador_id', 'outgoing_name_snapshot', 'incoming_name_snapshot',
  'reason', 'created_at', 'updated_at',
]) {
  assert.ok(migration.includes(column), `Migracion Core 31 sin ${column}`);
}

assert.match(normalizedMigration, /reason is null or reason in \('tactical', 'injury', 'discomfort', 'other'\)/);
assert.match(normalizedMigration, /unique \(partido_id, minute, event_order\)/);
assert.match(normalizedMigration, /check \(event_order >= 0\)/);
assert.match(normalizedMigration, /check \(outgoing_jugador_id <> incoming_jugador_id\)/);
assert.match(normalizedMigration, /references public\.partidos\(id\) on delete cascade/);
assert.equal((normalizedMigration.match(/references public\.jugadores\(id\) on delete restrict/g) || []).length, 2);

assert.match(normalizedMigration, /create policy substitution_staff_select[\s\S]*using \(public\.is_app_staff\(\)\)/);
assert.doesNotMatch(executableMigration, /create policy[^;]+for (insert|update|delete|all)/);
assert.match(normalizedMigration, /revoke all on table public\.partido_eventos_sustitucion from public, anon, authenticated/);
assert.match(normalizedMigration, /grant select on table public\.partido_eventos_sustitucion to authenticated/);

for (const signature of [
  'public.get_match_substitution_events(p_partido_id uuid)',
  'public.mutate_match_substitution_atomic(',
]) {
  assert.ok(migration.includes(signature), `Falta RPC ${signature}`);
}
assert.match(normalizedMigration, /security definer set search_path = pg_catalog/);
assert.equal((normalizedMigration.match(/if not public\.is_app_staff\(\)/g) || []).length, 2);
assert.match(normalizedMigration, /from public\.partidos match_row[\s\S]*for update/);
assert.match(normalizedMigration, /legacy_substitution_ambiguous/);
assert.match(normalizedMigration, /order by event\.minute, event\.event_order, event\.id/);
assert.match(normalizedMigration, /set minutes = coalesce\(played_minutes->>stats\.jugador_id::text, '0'\)/);
assert.match(normalizedMigration, /set replacement_name = coalesce/);
assert.doesNotMatch(normalizedMigration, /(physio|treatment|diagnosis|medical_alert)/);

const expectedChecks = [
  'CATALOG_prerequisites', 'SCHEMA_exact_columns', 'SCHEMA_checks_and_unique_order',
  'SCHEMA_indexes', 'SECURITY_rls_staff_select_only',
  'SECURITY_table_acl_read_only_authenticated', 'RPC_read_contract',
  'RPC_mutation_contract', 'SECURITY_rpc_acl', 'SCHEMA_updated_at_trigger',
  'FIXTURE_transactional_ready', 'A_starter_90_without_exit',
  'B_starter_exits_60', 'C_substitute_enters_60_finishes_30',
  'D_substitute_enters_60_exits_75_15', 'E_second_substitute_enters_75_15',
  'F_full_chain_two_events', 'G_same_minute_event_order',
  'H_outgoing_out_rejected', 'I_incoming_inside_rejected',
  'J_minute_out_of_range_rejected', 'K_player_denied', 'L_viewer_denied',
  'M_anon_denied', 'N_staff_allowed', 'O_legacy_materializable',
  'P_legacy_ambiguous_controlled_error', 'Q_delete_recalculates',
  'R_update_recalculates', 'S_minutes_and_replacement_projection',
];
for (const check of expectedChecks) {
  assert.ok(verify.includes(`'${check}'`), `Verifier Core 31 sin ${check}`);
}
assert.equal((verify.match(/(?:select|perform) pg_temp\.add_core31_check\(/g) || []).length, 30);
assert.match(normalizedVerify, /set local role authenticated/);
assert.match(normalizedVerify, /set local role anon/);
assert.match(normalizedVerify, /check_count <> 30/);
assert.doesNotMatch(executable(verify), /(^|;) commit;/);

for (const frontendIdentifier of ['src/App.jsx', 'MatchPrintTab', 'PlayerProfile', 'renderStats']) {
  assert.ok(!migration.includes(frontendIdentifier));
  assert.ok(!verify.includes(frontendIdentifier));
}

console.log('Club Core 31 canonical substitutions SQL audit: OK (30 transactional checks).');
