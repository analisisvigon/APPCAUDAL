import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL('../supabase_club_core_22_fine_payments.sql', import.meta.url),
  'utf8',
);
const verifier = fs.readFileSync(
  new URL('../supabase_club_core_22_fine_payments_verify.sql', import.meta.url),
  'utf8',
);

const compact = (value) => value.toLowerCase().replace(/\s+/g, ' ');
const normalizedMigration = compact(migration);
const normalizedVerifier = compact(verifier);
const executableMigration = compact(migration.replace(/--.*$/gm, ''));

assert.match(migration, /^-- APPCAUDAL - Bloque 4\.4/m);
assert.match(normalizedMigration, /begin;.*commit;/s, 'La migracion debe ser transaccional.');
assert.match(normalizedMigration, /create table public\.fine_payments/);
assert.equal(
  [...normalizedMigration.matchAll(/create table public\./g)].length,
  1,
  'Bloque 4.4 solo puede crear fine_payments.',
);

for (const fineColumn of [
  'add column due_on date not null',
  'add column surcharge_amount numeric(10,2) not null default 0',
  'add column surcharge_base_amount numeric(10,2) null',
  'add column surcharge_applied_at timestamptz null',
]) {
  assert.ok(normalizedMigration.includes(fineColumn), `Falta fines.${fineColumn}.`);
}

for (const paymentColumn of [
  'id uuid primary key',
  'club_id uuid not null',
  'fine_id uuid not null',
  'payment_kind text not null',
  'amount numeric(10,2) not null',
  'paid_on date not null',
  'note text null',
  'recorded_by_membership_id uuid not null',
  'created_at timestamptz not null',
]) {
  assert.ok(normalizedMigration.includes(paymentColumn), `Falta fine_payments.${paymentColumn}.`);
}

assert.doesNotMatch(normalizedMigration, /create table public\.fine_payments[\s\S]*?currency/);
assert.match(normalizedMigration, /payment_kind in \('payment', 'refund'\)/);
assert.match(normalizedMigration, /amount > 0[\s\S]*?amount <> 'nan'::numeric/);
assert.doesNotMatch(normalizedMigration, /references public\.[a-z_]+\(id\) on delete cascade/);
assert.equal(
  [...normalizedMigration.matchAll(/on delete restrict/g)].length >= 3,
  true,
  'Las FKs del ledger deben ser no destructivas.',
);

assert.match(normalizedMigration, /date_trunc\('month', incident_occurred_on::timestamp\)/);
assert.match(normalizedMigration, /interval '1 month'[\s\S]*?interval '1 day'/);
assert.match(normalizedMigration, /new\.due_on is distinct from old\.due_on/);
assert.match(normalizedMigration, /new\.surcharge_amount := 0/);
assert.match(normalizedMigration, /new\.surcharge_base_amount := null/);
assert.match(normalizedMigration, /new\.surcharge_applied_at := null/);
assert.match(normalizedMigration, /surcharge_amount = pg_catalog\.round\(surcharge_base_amount \* 0\.50, 2\)/);
assert.match(normalizedMigration, /new\.original_amount - collected_before/);
assert.match(normalizedMigration, /old\.surcharge_applied_at is not null[\s\S]*?no puede repetirse/);
assert.match(normalizedMigration, /current_date <= fine_row\.due_on[\s\S]*?return false/);

assert.match(normalizedMigration, /create function public\.apply_fine_surcharge_if_due\(p_fine_id uuid\)/);
assert.match(normalizedMigration, /from public\.fines fine[\s\S]*?for update/);
assert.match(normalizedMigration, /create function public\.guard_fine_payment_integrity\(\)/);
assert.match(normalizedMigration, /where fine\.id = new\.fine_id[\s\S]*?for update/);
assert.match(normalizedMigration, /current_date > fine_due_on[\s\S]*?apply_fine_surcharge_if_due\(new\.fine_id\)/);
assert.match(normalizedMigration, /collected_before \+ new\.amount > generated_amount/);
assert.match(normalizedMigration, /new\.amount > collected_before/);
assert.match(normalizedMigration, /fine_lifecycle_status <> 'active'/);
assert.match(normalizedMigration, /fine_club_id is distinct from new\.club_id/);
assert.match(normalizedMigration, /actor_club_id is distinct from new\.club_id/);
assert.match(normalizedMigration, /tg_op <> 'insert'[\s\S]*?ledger financiero es inmutable/);
assert.match(normalizedMigration, /tg_when = 'after'[\s\S]*?payment_kind = 'refund'[\s\S]*?apply_fine_surcharge_if_due/);
assert.match(normalizedMigration, /create trigger apply_fine_surcharge_after_refund/);

assert.match(normalizedMigration, /create function public\.get_fine_financial_totals\(p_fine_id uuid\)/);
assert.match(normalizedMigration, /fine\.original_amount \+ fine\.surcharge_amount/);
assert.match(normalizedMigration, /case movement\.payment_kind[\s\S]*?when 'payment' then movement\.amount[\s\S]*?when 'refund' then -movement\.amount/);
assert.match(normalizedMigration, /when totals\.collected_amount <= 0 then 'unpaid'/);
assert.match(normalizedMigration, /then 'partial'[\s\S]*?else 'paid'/);
assert.doesNotMatch(
  normalizedMigration,
  /add column (financial_status|generated_amount|collected_amount|pending_amount)/,
  'Los totales y el estado financiero deben ser derivados.',
);

assert.match(normalizedMigration, /alter table public\.fine_payments enable row level security/);
assert.match(
  normalizedMigration,
  /create policy "fines staff can read payments"[\s\S]*?for select[\s\S]*?public\.is_app_staff\(\)[\s\S]*?public\.current_membership\(\)/,
);
assert.doesNotMatch(normalizedMigration, /create policy[^;]+for (insert|update|delete|all)/);
assert.match(normalizedMigration, /grant select on table public\.fine_payments to authenticated/);
assert.match(
  normalizedMigration,
  /grant select, insert, update, delete on table public\.fine_payments to service_role/,
);
assert.doesNotMatch(
  normalizedMigration,
  /grant (insert|update|delete|all)[^;]*on table public\.fine_payments[^;]*to authenticated/,
);
assert.match(
  normalizedMigration,
  /revoke all on function public\.apply_fine_surcharge_if_due\(uuid\) from public, anon, authenticated, service_role/,
);
assert.match(
  normalizedMigration,
  /grant execute on function public\.apply_fine_surcharge_if_due\(uuid\) to service_role/,
);
assert.doesNotMatch(executableMigration, /insert into public\.club_member_permissions/);
assert.doesNotMatch(executableMigration, /role\s*(=|in)\s*[^;]*'captain'/);
assert.doesNotMatch(executableMigration, /\b(pg_cron|cron\.|schedule\s*\()/);
assert.doesNotMatch(executableMigration, /fine_fund_expenses/);
assert.doesNotMatch(executableMigration, /\b(react|playerapp|app\.jsx|\.css)\b/);

assert.match(normalizedVerifier, /create or replace function pg_temp\.verify_fine_payments\(\)/);
assert.match(
  normalizedVerifier,
  /select test_name, test_ok, details from pg_temp\.verify_fine_payments\(\); rollback;/,
);
for (const scenario of [
  'due_on_september_first',
  'due_on_september_last',
  'due_on_february',
  'full_payment_within_term',
  'partial_payment_within_term',
  'surcharge_on_original_outstanding',
  'surcharge_without_prior_payments',
  'no_surcharge_when_original_fully_paid',
  'expired_refund_reopens_debt_and_surcharge',
  'surcharge_applies_once',
  'no_surcharge_before_or_on_due_on',
  'numeric_rounding_preserves_cents',
  'backdated_paid_on_cannot_evade_surcharge',
  'single_overpayment_rejected',
  'sequential_overpayment_rejected',
  'refund_reduces_collected',
  'excessive_refund_rejected',
  'cancelled_rejects_payment_and_refund',
  'ledger_update_delete_rejected',
  'cross_club_fine_and_actor_rejected',
  'authenticated_payment_writes_denied',
  'player_with_transient_fines_manage_still_zero',
]) {
  assert.ok(normalizedVerifier.includes(scenario), `Falta escenario ${scenario}.`);
}
assert.match(normalizedVerifier, /alter table public\.fine_payments disable trigger guard_fine_payment_integrity/);
assert.match(normalizedVerifier, /alter table public\.fine_payments enable trigger guard_fine_payment_integrity/);
assert.match(normalizedVerifier, /\('amount', 'numeric', 'no'\)/);
assert.match(normalizedVerifier, /numeric_precision = 10[\s\S]*?numeric_scale = 2/);
assert.match(
  normalizedVerifier,
  /count\(\*\) = 2 and pg_catalog\.bool_and\( actual_column\.data_type = 'numeric' and actual_column\.numeric_precision = 10 and actual_column\.numeric_scale = 2 \)[\s\S]*?column_name in \('surcharge_amount', 'surcharge_base_amount'\)/,
  'El verify debe validar por separado tipo, precision y escala de ambas columnas de recargo.',
);
for (const triggerContract of [
  "'guard_fine_financial_integrity'::text, 'fines'::text, 'guard_fine_financial_integrity'::text, 23::integer",
  "'guard_fine_payment_integrity', 'fine_payments', 'guard_fine_payment_integrity', 31",
  "'apply_fine_surcharge_after_refund', 'fine_payments', 'guard_fine_payment_integrity', 5",
]) {
  assert.ok(
    normalizedVerifier.includes(triggerContract),
    `Falta contrato exacto de trigger: ${triggerContract}`,
  );
}
assert.match(normalizedVerifier, /trigger_row\.tgenabled::text as enabled_state/);
assert.match(normalizedVerifier, /trigger_row\.tgqual is not null[\s\S]*?payment_kind[\s\S]*?refund/);
assert.match(normalizedVerifier, /select \* from expected except select \* from actual/);
assert.match(normalizedVerifier, /select \* from actual except select \* from expected/);

const verificationCount = [...verifier.matchAll(/test_name\s*:=/g)].length;
assert.equal(verificationCount, 60, `El verificador debe producir 60 checks; produce ${verificationCount}.`);

console.log(`Club Core 22 fine payments SQL audit: OK (${verificationCount} checks)`);
