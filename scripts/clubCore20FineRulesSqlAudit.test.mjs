import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL('../supabase_club_core_20_fine_rules.sql', import.meta.url),
  'utf8',
);
const verifier = fs.readFileSync(
  new URL('../supabase_club_core_20_fine_rules_verify.sql', import.meta.url),
  'utf8',
);

const compact = (value) => value.toLowerCase().replace(/\s+/g, ' ');
const normalizedMigration = compact(migration);
const normalizedVerifier = compact(verifier);
const executableMigration = compact(migration.replace(/--.*$/gm, ''));

const expectedRules = [
  ['TRAINING_LATE', '2.00', 'fixed', true, true, false, true],
  ['MATCH_LATE', '3.00', 'fixed', true, true, false, true],
  ['LOCKER_MATERIAL_FORGOTTEN', '2.00', 'fixed', true, true, false, true],
  ['TRAINING_EARRINGS', '2.00', 'fixed', true, true, false, true],
  ['PHONE_DURING_COACH_TALK', '2.00', 'fixed', true, true, false, true],
  ['PHONE_AFTER_TRAINING_TALK', '2.00', 'fixed', true, true, false, true],
  ['TRAINING_EXIT_DELAY_AFTER_TALK', 'null', 'unpriced', true, true, false, false],
  ['PHONE_MATCH_AFTER_LINEUP', '2.00', 'fixed', true, true, false, true],
  ['MATCH_WRONG_UNIFORM', '2.00', 'fixed', true, true, false, true],
  ['LEAGUE_MATCH_NON_ATTENDANCE_INJURED', '2.00', 'fixed', true, false, false, true],
  ['LEAVE_BENCH_WITHOUT_PERMISSION', '2.00', 'fixed', true, false, false, true],
  ['MATCH_ABSENCE', '20.00', 'fixed', true, true, false, true],
  ['LOCKER_BAD_STATE_IDENTIFIED', '2.00', 'fixed', true, true, false, true],
  ['LOCKER_BAD_STATE_COLLECTIVE', '1.00', 'per_subject', true, false, true, true],
  ['WEEKLY_MATERIAL_COLLECTIVE', '2.00', 'per_subject', true, false, true, true],
  ['MANDATORY_GROUP_EVENT_ABSENCE', '2.00', 'fixed', true, true, false, true],
  ['YOUTH_NAME_NOT_USED', '2.00', 'fixed', true, true, false, true],
  ['YELLOW_PROTEST', '3.00', 'fixed', true, false, false, true],
  ['FIFTH_YELLOW_PROTEST', '5.00', 'fixed', true, false, false, true],
  ['RED_PROTEST', '20.00', 'fixed', true, false, false, true],
  ['TRAINING_NOTICE_UNDER_2H', '2.00', 'fixed', true, false, false, true],
  ['PF_SURVEY_MISSING', '2.00', 'fixed', true, false, false, true],
  ['DISRESPECT_TEAMMATE_STAFF', '50.00', 'fixed', true, true, false, true],
];

assert.match(migration, /^-- APPCAUDAL - Bloque 4\.2/m);
assert.match(normalizedMigration, /begin;.*commit;/s, 'La migracion debe ser transaccional.');
assert.match(normalizedMigration, /create table public\.fine_rules/);
assert.doesNotMatch(
  normalizedMigration,
  /create table public\.(fine_incidents|fines|fine_payments)/,
  'Bloque 4.2 no puede crear incidencias, multas ni pagos.',
);
assert.doesNotMatch(
  normalizedMigration,
  /(alter|drop|truncate) table public\.(club_seasons|fine_subjects|club_member_permissions)/,
  'Bloque 4.2 no puede modificar tablas del Bloque 4.1.',
);
assert.doesNotMatch(
  normalizedMigration,
  /create( or replace)? function public\.(can_manage_fines|current_membership|current_jugador_id|is_player|is_app_staff)\s*\(/,
  'Bloque 4.2 no puede reemplazar helpers heredados.',
);

assert.match(normalizedMigration, /default_amount numeric\(10,2\) null/);
assert.match(normalizedMigration, /pricing_mode in \('fixed', 'per_subject', 'unpriced'\)/);
assert.match(normalizedMigration, /default_amount > 0/);
assert.match(normalizedMigration, /pricing_mode = 'unpriced' and default_amount is null/);
assert.match(normalizedMigration, /applies_to_players or applies_to_staff/);
assert.match(normalizedMigration, /constraint fine_rules_club_code_key unique \(club_id, code\)/);
assert.match(normalizedMigration, /constraint fine_rules_club_sort_order_key unique \(club_id, sort_order\)/);
assert.match(normalizedMigration, /references public\.clubs\(id\) on delete restrict/);
assert.doesNotMatch(normalizedMigration, /references public\.[a-z_]+\(id\) on delete cascade/);
assert.match(normalizedMigration, /execute function public\.set_club_core_updated_at\(\)/);

assert.match(normalizedMigration, /alter table public\.fine_rules enable row level security/);
assert.match(
  normalizedMigration,
  /create policy "fines staff can read rules"[\s\S]*?for select[\s\S]*?to authenticated[\s\S]*?public\.is_app_staff\(\)[\s\S]*?public\.current_membership\(\)/,
);
assert.doesNotMatch(normalizedMigration, /create policy[^;]+for (insert|update|delete|all)/);
assert.match(normalizedMigration, /revoke all on table public\.fine_rules from public, anon, authenticated, service_role/);
assert.match(normalizedMigration, /grant select on table public\.fine_rules to authenticated/);
assert.match(normalizedMigration, /grant select, insert, update, delete on table public\.fine_rules to service_role/);
assert.doesNotMatch(
  normalizedMigration,
  /grant (insert|update|delete|all)[^;]* on table public\.fine_rules[^;]* to authenticated/,
  'authenticated no puede escribir el catalogo.',
);

const seedStart = normalizedMigration.indexOf('insert into public.fine_rules');
const seedEnd = normalizedMigration.indexOf('on conflict (club_id, code) do nothing', seedStart);
assert.ok(seedStart >= 0 && seedEnd > seedStart, 'No se localizo el seed conservador.');
const seedSection = normalizedMigration.slice(seedStart, seedEnd);

for (const [code, amount, mode, players, staff, collective, active] of expectedRules) {
  const tuplePattern = new RegExp(
    `\\('${code.toLowerCase()}'[^\\n]*?, ${amount === 'null' ? 'null' : amount.replace('.', '\\.')}, '${mode}', ${players}, ${staff}, ${collective}, ${active},`,
  );
  assert.match(seedSection, tuplePattern, `Contrato de seed incorrecto para ${code}.`);
}

const seededCodes = [...seedSection.matchAll(/\('([a-z0-9_]+)'/g)].map((match) => match[1].toUpperCase());
assert.equal(seededCodes.length, 23, `El seed debe contener 23 reglas; contiene ${seededCodes.length}.`);
assert.deepEqual(
  [...seededCodes].sort(),
  expectedRules.map(([code]) => code).sort(),
  'El seed debe contener exactamente los 23 codigos acordados.',
);
assert.match(normalizedMigration, /on conflict \(club_id, code\) do nothing/);
assert.match(normalizedMigration, /catalogo existente difiere del contrato 26\/27/);
assert.doesNotMatch(seedSection, /do update set/, 'El seed no puede sobreescribir reglas existentes.');

assert.doesNotMatch(
  normalizedMigration,
  /insert into public\.club_member_permissions/,
  'La migracion no puede asignar fines_manage.',
);
assert.doesNotMatch(executableMigration, /wellness_entries|rpe_entries/, 'PF no puede automatizarse.');
assert.doesNotMatch(executableMigration, /yellow[^;]*(sum|accum|acumul)|red[^;]*(sum|accum|acumul)/);

assert.match(normalizedVerifier, /create or replace function pg_temp\.verify_fine_rules\(\)/);
assert.match(normalizedVerifier, /select test_name, test_ok, details from pg_temp\.verify_fine_rules\(\); rollback;/);
assert.match(
  normalizedVerifier,
  /\('default_amount', 'numeric', 'yes', 10, 2\)/,
  'B_exact_columns debe exigir numeric con precision 10 y escala 2.',
);
assert.match(
  normalizedVerifier,
  /when actual_column\.column_name = 'default_amount' then actual_column\.numeric_precision/,
  'La precision numerica debe compararse especificamente para default_amount.',
);
assert.match(
  normalizedVerifier,
  /when actual_column\.column_name = 'default_amount' then actual_column\.numeric_scale/,
  'La escala numerica debe compararse especificamente para default_amount.',
);
assert.doesNotMatch(
  normalizedVerifier,
  /'default_amount', 'numeric\(10,2\)'/,
  'information_schema.data_type devuelve numeric, no numeric(10,2).',
);
for (const scenario of [
  'staff_reads_23_own_club_rules',
  'staff_cross_club_isolation',
  'player_direct_select_zero',
  'player_with_transient_fines_manage_still_zero',
  'viewer_direct_select_zero',
  'uid_without_membership_zero',
  'anon_select_denied',
  'service_role_crud_reversible',
  'authenticated_writes_denied',
]) {
  assert.ok(normalizedVerifier.includes(scenario), `Falta el escenario ${scenario}.`);
}
assert.doesNotMatch(normalizedVerifier, /from information_schema\.columns column\b/);

const assignmentCount = [...verifier.matchAll(/test_name\s*:=/g)].length;
const runtimeCheckCount = assignmentCount - 1 + expectedRules.length;
assert.equal(runtimeCheckCount, 51, `El verificador debe producir 51 checks; produciria ${runtimeCheckCount}.`);

console.log(`Club Core 20 fine rules SQL audit: OK (${expectedRules.length} rules, ${runtimeCheckCount} checks)`);
