import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../supabase_club_core_28_physio_treatments.sql', import.meta.url), 'utf8');
const verify = fs.readFileSync(new URL('../supabase_club_core_28_physio_treatments_verify.sql', import.meta.url), 'utf8');
const compact = (value) => value.toLowerCase().replace(/\s+/g, ' ').trim();
const executable = (value) => compact(value.replace(/--.*$/gm, ''));
const normalized = compact(migration);
const normalizedVerify = compact(verify);
const executableMigration = executable(migration);

assert.match(migration, /^-- APPCAUDAL - Club Core 28 - Fisio V1\./m);
assert.match(normalized, /begin;[\s\S]*commit;$/);
assert.match(normalized, /create table public\.physio_treatments/);
for (const column of [
  'id uuid primary key', 'club_id uuid not null', 'player_id uuid not null', 'treatment_date date not null',
  'body_area text not null', 'reason text not null', 'treatment_types text\[\] not null', 'case_type text not null',
  'availability_status text not null', 'duration_minutes integer null', 'notes text null',
  'performed_by_user_id uuid not null', 'performed_by_name_snapshot text null',
  'created_at timestamptz not null', 'updated_at timestamptz not null',
]) assert.match(normalized, new RegExp(column.replace(/[\[\]]/g, '\\$&')), `Falta columna ${column}`);

assert.match(normalized, /physio_treatments_player_id_fkey foreign key \(player_id\) references public\.jugadores\(id\) on delete restrict/);
assert.match(normalized, /physio_treatments_club_id_fkey foreign key \(club_id\) references public\.clubs\(id\) on delete restrict/);
assert.match(normalized, /physio_treatments_performed_by_user_id_fkey foreign key \(performed_by_user_id\) references auth\.users\(id\) on delete restrict/);
assert.match(normalized, /case_type in \('new', 'follow_up'\)/);
assert.match(normalized, /availability_status in \('available', 'limited', 'unavailable'\)/);
assert.match(normalized, /duration_minutes is null or duration_minutes > 0/);
assert.match(normalized, /cardinality\(treatment_types\) >= 1/);
for (const area of ['head_neck', 'shoulder', 'wrist_hand', 'groin_adductor', 'hamstrings', 'ankle', 'other']) assert.ok(normalized.includes(`'${area}'`), `Falta zona ${area}`);
for (const treatment of ['massage_release', 'manual_therapy', 'mobility', 'cryotherapy', 'electrotherapy', 'active_work', 'assessment', 'other']) assert.ok(normalized.includes(`'${treatment}'`), `Falta tratamiento ${treatment}`);

for (const index of ['physio_treatments_club_date_idx', 'physio_treatments_club_player_date_idx', 'physio_treatments_club_performer_date_idx']) assert.match(normalized, new RegExp(`create index ${index}`));

assert.match(normalized, /create function public\.guard_physio_treatment_integrity\(\)[\s\S]*security definer[\s\S]*set search_path = pg_catalog/);
assert.match(normalized, /new\.id := pg_catalog\.gen_random_uuid\(\)/);
assert.match(normalized, /new\.club_id := actor_club_id/);
assert.match(normalized, /new\.performed_by_user_id := actor_user_id/);
assert.match(normalized, /new\.performed_by_name_snapshot := actor_name/);
assert.match(normalized, /new\.created_at := pg_catalog\.clock_timestamp\(\)/);
assert.match(normalized, /new\.updated_at := new\.created_at/);
assert.match(normalized, /new\.updated_at := pg_catalog\.clock_timestamp\(\)/);
assert.match(normalized, /protected audit fields are immutable/);
assert.match(normalized, /count\(\*\)::integer[\s\S]*array_agg\(club\.id order by club\.id\)/);
assert.match(normalized, /club_count <> 1 or canonical_club_id is distinct from actor_club_id/);
assert.match(normalized, /player\.active_in_squad/);

assert.match(normalized, /create function public\.get_physio_player_summary\(\)/);
assert.match(normalized, /language plpgsql stable security definer set search_path = pg_catalog/);
assert.match(normalized, /count\(distinct treatment\.treatment_date\)::bigint/);
assert.match(normalized, /max\(treatment\.treatment_date\)/);
assert.match(normalized, /jsonb_build_object\( 'body_area', counted\.body_area, 'treatment_count', counted\.treatment_count \)/);
assert.match(normalized, /count\(\*\) filter \(where treatment\.case_type = 'new'\)/);
assert.match(normalized, /count\(\*\) filter \(where treatment\.case_type = 'follow_up'\)/);

assert.match(normalized, /alter table public\.physio_treatments enable row level security/);
for (const policy of ['physio_staff_select', 'physio_staff_insert', 'physio_staff_update']) assert.match(normalized, new RegExp(`create policy ${policy}`));
assert.equal((normalized.match(/create policy physio_staff_/g) || []).length, 3);
assert.doesNotMatch(executableMigration, /create policy [^;]+ for delete/);
assert.match(normalized, /public\.is_app_staff\(\)/);
assert.match(normalized, /from public\.current_membership\(\) membership/);
assert.match(normalized, /and performed_by_user_id = auth\.uid\(\)/);
assert.match(normalized, /grant select, insert, update on table public\.physio_treatments to authenticated, service_role/);
assert.doesNotMatch(executableMigration, /grant delete on table public\.physio_treatments/);
assert.match(normalized, /grant execute on function public\.get_physio_player_summary\(\) to authenticated/);

assert.match(normalizedVerify, /begin;[\s\S]*rollback;$/);
assert.doesNotMatch(executable(verify), /(^|;) commit;/);
for (const check of [
  'SCHEMA_table_exists', 'SCHEMA_exact_columns', 'SCHEMA_foreign_keys_restrict', 'SCHEMA_catalog_checks',
  'SCHEMA_three_query_indexes', 'RLS_exact_staff_policies_no_delete', 'GRANTS_authenticated_crud_without_delete',
  'TRIGGER_security_and_acl', 'SUMMARY_security_and_acl', 'STAFF_insert_derives_audit_fields',
  'STAFF_update_editable_and_touches_updated_at', 'SUMMARY_treatments_days_last_date_cases_areas',
  'TRIGGER_protected_fields_immutable', 'RLS_cross_club_insert_denied', 'CHECK_duration_positive_or_null',
  'CHECK_closed_catalogs_and_reason', 'STAFF_physical_delete_denied', 'ROLE_viewer_denied', 'ROLE_player_denied', 'ROLE_anon_denied',
]) assert.ok(verify.includes(`'${check}'`), `Verifier sin ${check}`);
assert.match(normalizedVerify, /3 treatments, 2 distinct days/);
assert.match(normalizedVerify, /delete from public\.physio_treatments/);

console.log('Club Core 28: esquema, catálogos, trigger, single-club, RLS, resumen y verifier transaccional validados.');

