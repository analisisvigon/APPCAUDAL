import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL('../supabase_club_core_19_fines_foundation.sql', import.meta.url),
  'utf8',
);
const verifier = fs.readFileSync(
  new URL('../supabase_club_core_19_fines_foundation_verify.sql', import.meta.url),
  'utf8',
);

const compact = (value) => value.toLowerCase().replace(/\s+/g, ' ');
const normalizedMigration = compact(migration);
const normalizedVerifier = compact(verifier);

assert.match(migration, /^-- APPCAUDAL - Bloque 4\.1/m);
assert.match(normalizedMigration, /begin;.*commit;/s, 'La migración debe ser transaccional.');
assert.match(normalizedMigration, /create table public\.club_seasons/);
assert.match(normalizedMigration, /create table public\.fine_subjects/);
assert.doesNotMatch(
  normalizedMigration,
  /create table public\.(fine_rules|fine_incidents|fines|fine_payments)/,
  'Bloque 4.1 no puede avanzar al catálogo ni a movimientos financieros.',
);

assert.match(
  normalizedMigration,
  /permission_key in \([^)]*'fines_manage'/,
  'La allowlist debe admitir fines_manage.',
);
for (const inheritedPermission of [
  'wellness_individual_read',
  'wellness_manage',
  'rpe_individual_read',
  'rpe_manage',
  'performance_aggregate_read',
]) {
  assert.ok(
    migration.includes(`'${inheritedPermission}'`),
    `Debe conservarse el permiso heredado ${inheritedPermission}.`,
  );
}

assert.doesNotMatch(
  normalizedMigration,
  /role\s*(=|in)\s*[^;\n]*'captain'/,
  'Captain no puede convertirse en role.',
);
assert.doesNotMatch(
  normalizedMigration,
  /create( or replace)? function public\.(current_membership|current_jugador_id|is_player|is_app_staff)\s*\(/,
  'Los helpers PLAYER heredados deben permanecer intactos.',
);

assert.match(
  normalizedMigration,
  /create function public\.can_manage_fines\(\) returns boolean language sql stable security invoker set search_path = pg_catalog/,
);
for (const identityDependency of [
  'public.is_app_staff()',
  'public.is_player()',
  'public.current_membership()',
  'public.has_club_permission',
  "'fines_manage'",
]) {
  assert.ok(migration.includes(identityDependency), `Falta ${identityDependency} en el helper.`);
}
assert.match(
  normalizedMigration,
  /revoke all on function public\.can_manage_fines\(\) from public, anon, authenticated, service_role;/,
);
assert.match(
  normalizedMigration,
  /grant execute on function public\.can_manage_fines\(\) to authenticated, service_role;/,
);

for (const table of ['club_seasons', 'fine_subjects']) {
  assert.match(normalizedMigration, new RegExp(`alter table public\\.${table} enable row level security;`));
  assert.match(
    normalizedMigration,
    new RegExp(`revoke all on table public\\.${table}[\\s\\S]*?from public, anon, authenticated, service_role;`),
  );
}
assert.match(
  normalizedMigration,
  /create policy "fines staff can read subjects"[\s\S]*?public\.is_app_staff\(\)/,
);
assert.doesNotMatch(
  normalizedMigration,
  /create policy "[^"]*player[^"]*"[\s\S]*?on public\.fine_subjects/,
  'No puede abrirse fine_subjects directamente a PLAYER.',
);
assert.doesNotMatch(
  normalizedMigration,
  /grant (select|insert|update|delete|all)[^;]* on table public\.(club_seasons|fine_subjects)[^;]* to (public|anon)/,
  'PUBLIC/anon no pueden recibir grants.',
);

assert.match(normalizedMigration, /constraint club_seasons_date_order_check check \(starts_on <= ends_on\)/);
assert.match(normalizedMigration, /constraint club_seasons_club_code_key unique \(club_id, code\)/);
assert.match(normalizedMigration, /create unique index club_seasons_one_active_per_club_uidx[\s\S]*?where is_active;/);
assert.match(normalizedMigration, /constraint fine_subjects_identity_check check/);
assert.match(normalizedMigration, /subject_type = 'player'[\s\S]*?jugador_id is not null[\s\S]*?staff_membership_id is null/);
assert.match(normalizedMigration, /subject_type = 'staff'[\s\S]*?staff_membership_id is not null[\s\S]*?jugador_id is null/);
assert.match(normalizedMigration, /create unique index fine_subjects_club_player_uidx/);
assert.match(normalizedMigration, /create unique index fine_subjects_club_staff_uidx/);

for (const reference of [
  /references public\.clubs\(id\) on delete restrict/,
  /references public\.jugadores\(id\) on delete restrict/,
  /references public\.club_memberships\(id\) on delete restrict/,
]) {
  assert.match(normalizedMigration, reference, 'Las identidades financieras deben usar FK conservadora.');
}
assert.doesNotMatch(
  normalizedMigration,
  /references public\.[a-z_]+\(id\) on delete cascade/,
  'No puede existir CASCADE destructivo en las nuevas FKs.',
);

assert.match(normalizedMigration, /create function public\.guard_fine_subject_identity\(\)/);
assert.match(normalizedMigration, /pg_catalog\.count\(\*\) = 1/);
assert.match(normalizedMigration, /new\.club_id is distinct from canonical_club_id/);
assert.match(normalizedMigration, /staff_club_id is distinct from new\.club_id/);
assert.match(normalizedMigration, /player\.active_in_squad/);
assert.match(normalizedMigration, /new\.display_name := canonical_player_name/);

assert.match(normalizedMigration, /'2026'[\s\S]*?'2026\/2027'[\s\S]*?date '2026-07-01'[\s\S]*?date '2027-06-30'/);
assert.match(normalizedMigration, /on conflict \(club_id, code\) do nothing/);
assert.match(normalizedMigration, /cross join public\.jugadores player[\s\S]*?where player\.active_in_squad/);
assert.match(normalizedMigration, /on conflict \(club_id, jugador_id\) where subject_type = 'player' do nothing/);
const subjectSeedSection = normalizedMigration.slice(
  normalizedMigration.indexOf('-- public.jugadores es la plantilla propia'),
  normalizedMigration.indexOf('do $postconditions$'),
);
assert.doesNotMatch(
  subjectSeedSection,
  /'staff'/,
  'No debe sembrarse STAFF sin fuente fiable de display_name.',
);

assert.match(normalizedVerifier, /create or replace function pg_temp\.verify_fines_foundation\(\)/);
assert.match(normalizedVerifier, /select test_name, test_ok, details from pg_temp\.verify_fines_foundation\(\); rollback;/);
assert.match(normalizedVerifier, /rollback_player_permission_test/);
assert.match(normalizedVerifier, /viewer_with_transient_permission_denied/);
assert.match(normalizedVerifier, /cross_club_player_rejected/);
assert.match(normalizedVerifier, /player_without_auth_is_subject/);
assert.match(normalizedVerifier, /no_destructive_cascade/);
assert.doesNotMatch(
  normalizedVerifier,
  /from information_schema\.columns column\b/,
  'El verificador no debe usar la palabra reservada COLUMN como alias de tabla.',
);
assert.match(
  normalizedVerifier,
  /from information_schema\.columns actual_column\b/,
  'El inventario de columnas debe usar un alias SQL inequívoco.',
);

const verificationCount = [...verifier.matchAll(/test_name\s*:=\s*'/g)].length;
assert.ok(verificationCount >= 36, `El verificador debe tener al menos 36 comprobaciones; tiene ${verificationCount}.`);

console.log(`Club Core 19 fines foundation SQL audit: OK (${verificationCount} checks)`);
