import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL('../supabase_club_core_21_fines_core.sql', import.meta.url),
  'utf8',
);
const verifier = fs.readFileSync(
  new URL('../supabase_club_core_21_fines_core_verify.sql', import.meta.url),
  'utf8',
);

const compact = (value) => value.toLowerCase().replace(/\s+/g, ' ');
const normalizedMigration = compact(migration);
const normalizedVerifier = compact(verifier);
const executableMigration = compact(migration.replace(/--.*$/gm, ''));

assert.match(migration, /^-- APPCAUDAL - Bloque 4\.3/m);
assert.match(normalizedMigration, /begin;.*commit;/s, 'La migracion debe ser transaccional.');
assert.match(normalizedMigration, /create table public\.fine_incidents/);
assert.match(normalizedMigration, /create table public\.fines/);
assert.equal(
  [...normalizedMigration.matchAll(/create table public\./g)].length,
  2,
  'Bloque 4.3 solo puede crear fine_incidents y fines.',
);

assert.doesNotMatch(executableMigration, /create table public\.fine_payments/);
assert.doesNotMatch(
  executableMigration,
  /\b(paid|pending|partial|due_on|paid_at|payment_status|surcharge|surcharge_amount|outstanding_amount|balance)\b\s+(boolean|text|date|numeric|timestamptz)/,
  'Bloque 4.3 no puede crear pagos, saldo ni recargo.',
);
assert.doesNotMatch(
  executableMigration,
  /(alter|drop|truncate) table public\.(club_seasons|fine_subjects|fine_rules|club_member_permissions)/,
  'Bloque 4.3 no puede modificar tablas 4.1/4.2.',
);
assert.doesNotMatch(
  executableMigration,
  /create( or replace)? function public\.(can_manage_fines|current_membership|current_jugador_id|is_player|is_app_staff)\s*\(/,
  'Bloque 4.3 no puede reemplazar helpers heredados.',
);
assert.doesNotMatch(executableMigration, /insert into public\.club_member_permissions/);
assert.doesNotMatch(executableMigration, /role\s*(=|in)\s*[^;]*'captain'/);

for (const incidentColumn of [
  'club_id uuid not null',
  'season_id uuid not null',
  'fine_rule_id uuid not null',
  'incident_kind text not null',
  'occurred_on date not null',
  'rule_code_snapshot text not null',
  'reason_snapshot text not null',
  'description_snapshot text null',
  'note text null',
  'created_by_membership_id uuid not null',
]) {
  assert.ok(normalizedMigration.includes(incidentColumn), `Falta fine_incidents.${incidentColumn}.`);
}

for (const fineColumn of [
  'incident_id uuid not null',
  'subject_id uuid not null',
  'subject_name_snapshot text not null',
  'original_amount numeric(10,2) not null',
  "currency text not null default 'eur'",
  "lifecycle_status text not null default 'active'",
  'cancelled_at timestamptz null',
  'cancelled_by_membership_id uuid null',
  'cancellation_reason text null',
]) {
  assert.ok(normalizedMigration.includes(fineColumn), `Falta fines.${fineColumn}.`);
}

assert.match(normalizedMigration, /incident_kind in \('individual', 'collective'\)/);
assert.match(normalizedMigration, /original_amount > 0/);
assert.match(normalizedMigration, /currency = 'eur'/);
assert.match(normalizedMigration, /lifecycle_status in \('active', 'cancelled'\)/);
assert.match(normalizedMigration, /constraint fines_incident_subject_key unique \(incident_id, subject_id\)/);
assert.match(normalizedMigration, /lifecycle_status = 'active'[\s\S]*?cancelled_at is null/);
assert.match(normalizedMigration, /lifecycle_status = 'cancelled'[\s\S]*?cancelled_at is not null/);
assert.doesNotMatch(normalizedMigration, /references public\.[a-z_]+\(id\) on delete cascade/);

assert.match(normalizedMigration, /create function public\.guard_fine_incident_integrity\(\)/);
assert.match(normalizedMigration, /create function public\.guard_fine_integrity\(\)/);
for (const crossClubGuard of [
  'season_club_id is distinct from new.club_id',
  'rule_club_id is distinct from new.club_id',
  'actor_club_id is distinct from new.club_id',
  'incident_club_id is distinct from new.club_id',
  'subject_club_id is distinct from new.club_id',
  'canceller_club_id is distinct from new.club_id',
]) {
  assert.ok(normalizedMigration.includes(crossClubGuard), `Falta guard ${crossClubGuard}.`);
}
for (const derivedSnapshot of [
  'new.rule_code_snapshot := rule_code',
  'new.reason_snapshot := rule_name',
  'new.description_snapshot := rule_description',
  'new.subject_name_snapshot := subject_display_name',
  'new.original_amount := rule_default_amount',
  "new.currency := 'eur'",
]) {
  assert.ok(normalizedMigration.includes(derivedSnapshot), `Falta derivacion ${derivedSnapshot}.`);
}
assert.match(normalizedMigration, /rule_pricing_mode not in \('fixed', 'per_subject'\)/);
assert.match(normalizedMigration, /not rule_active/);
assert.match(normalizedMigration, /new\.original_amount is distinct from old\.original_amount/);
assert.match(normalizedMigration, /new\.reason_snapshot is distinct from old\.reason_snapshot/);

for (const table of ['fine_incidents', 'fines']) {
  assert.match(normalizedMigration, new RegExp(`alter table public\\.${table} enable row level security`));
}
assert.match(
  normalizedMigration,
  /create policy "fines staff can read incidents"[\s\S]*?for select[\s\S]*?public\.is_app_staff\(\)[\s\S]*?public\.current_membership\(\)/,
);
assert.match(
  normalizedMigration,
  /create policy "fines staff can read individual fines"[\s\S]*?for select[\s\S]*?public\.is_app_staff\(\)[\s\S]*?public\.current_membership\(\)/,
);
assert.doesNotMatch(normalizedMigration, /create policy[^;]+for (insert|update|delete|all)/);
assert.match(normalizedMigration, /grant select on table public\.fine_incidents, public\.fines to authenticated/);
assert.match(
  normalizedMigration,
  /grant select, insert, update, delete on table public\.fine_incidents, public\.fines to service_role/,
);
assert.doesNotMatch(
  normalizedMigration,
  /grant (insert|update|delete|all)[^;]* on table public\.(fine_incidents|fines)[^;]* to authenticated/,
);
assert.doesNotMatch(executableMigration, /insert into public\.(fine_incidents|fines)/);

assert.match(normalizedVerifier, /create or replace function pg_temp\.verify_fines_core\(\)/);
assert.match(normalizedVerifier, /select test_name, test_ok, details from pg_temp\.verify_fines_core\(\); rollback;/);
for (const scenario of [
  'valid_individual_incident',
  'fine_snapshots_amount_currency_derived',
  'historical_snapshots_survive_catalog_change',
  'collective_creates_two_individual_fines',
  'collective_amount_is_per_subject',
  'non_collective_rule_rejected',
  'unpriced_rule_rejected',
  'null_subject_name_rejected',
  'duplicate_subject_in_incident_rejected',
  'cancelled_requires_all_fields',
  'cross_club_season_rejected',
  'cross_club_rule_rejected',
  'cross_club_actor_rejected',
  'cross_club_incident_link_rejected',
  'cross_club_subject_rejected',
  'cross_club_canceller_rejected',
  'player_with_transient_fines_manage_still_zero',
  'authenticated_writes_denied',
]) {
  assert.ok(normalizedVerifier.includes(scenario), `Falta escenario ${scenario}.`);
}
assert.match(normalizedVerifier, /\('original_amount', 'numeric', 'no', 10, 2\)/);
assert.doesNotMatch(normalizedVerifier, /from information_schema\.columns column\b/);

const verificationCount = [...verifier.matchAll(/test_name\s*:=/g)].length;
assert.equal(verificationCount, 60, `El verificador debe producir 60 checks; produce ${verificationCount}.`);

console.log(`Club Core 21 fines core SQL audit: OK (${verificationCount} checks)`);
