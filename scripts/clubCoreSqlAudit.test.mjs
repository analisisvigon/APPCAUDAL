import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (name) => readFileSync(resolve(name), 'utf8');
const tables = read('supabase_club_core_01_tables.sql');
const functions = read('supabase_club_core_02_functions.sql');
const rls = read('supabase_club_core_03_rls.sql');
const initialClub = read('supabase_club_core_04_initial_club.sql');
const initialMembers = read('supabase_club_core_05_initial_members.sql');
const integrationTests = read('supabase_club_core_06_tests.sql');

for (const table of ['clubs', 'club_memberships', 'club_member_permissions']) {
  assert.match(tables, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(rls, new RegExp(`alter table public\\.${table} enable row level security`));
}

for (const role of ['owner', 'admin', 'staff', 'viewer']) assert.match(tables, new RegExp(`'${role}'`));
for (const permission of [
  'wellness_individual_read',
  'wellness_manage',
  'rpe_individual_read',
  'rpe_manage',
  'performance_aggregate_read',
]) assert.match(tables, new RegExp(`'${permission}'`));

assert.match(tables, /unique \(club_id, user_id\)/i);
assert.match(tables, /unique \(membership_id, permission_key\)/i);
assert.match(tables, /references public\.clubs\(id\) on delete restrict/i);
assert.match(functions, /security definer/gi);
assert.doesNotMatch(functions, /execute\s+format|execute\s+query/i);
assert.match(functions, /set search_path = pg_catalog/gi);
assert.match(functions, /pg_advisory_xact_lock/i);
assert.match(functions, /El club debe conservar al menos un owner activo/i);
assert.match(functions, /Un usuario no puede elevarse ni reactivarse/i);
assert.match(functions, /Un usuario no puede gestionar sus propios permisos/i);
assert.match(functions, /revoke all on function public\.lock_club_memberships\(uuid\) from public, anon, authenticated/i);

const clubPolicySection = rls.split('on public.club_memberships')[0];
assert.doesNotMatch(clubPolicySection, /on public\.clubs[\s\S]*for delete/i);
assert.match(initialClub, /C\.D\. Caudal/);
assert.match(initialClub, /ca0da100-0000-4000-8000-000000000001/);
assert.doesNotMatch(initialMembers, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
assert.match(initialMembers, /No se configuraron miembros/);
assert.match(integrationTests, /rollback;/i);
assert.match(integrationTests, /ultimo owner no se elimina/i);
assert.match(integrationTests, /usuario no se concede permisos/i);
assert.doesNotMatch(
  `${tables}\n${functions}\n${rls}`,
  /alter table public\.(partidos|jugadores|competitions|training_sessions|wellness_entries|rpe_entries)/i
);

console.log('clubCoreSqlAudit: all assertions passed');
