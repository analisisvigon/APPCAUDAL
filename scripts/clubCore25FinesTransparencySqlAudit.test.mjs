import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../supabase_club_core_25_fines_transparency.sql', import.meta.url), 'utf8');
const verifySql = fs.readFileSync(new URL('../supabase_club_core_25_fines_transparency_verify.sql', import.meta.url), 'utf8');
const compact = (value) => value.toLowerCase().replace(/\s+/g, ' ');
const normalized = compact(sql);
const executable = compact(sql.replace(/--.*$/gm, ''));

assert.match(sql, /^-- APPCAUDAL - Multas: transparencia grupal sanitizada/m);
assert.match(normalized, /begin;.*commit;/s);

const publicRpcs = [
  'get_fines_transparency_summary()',
  'get_fines_transparency_subjects()',
  'get_fines_transparency_rules()',
  'get_fines_transparency_list(integer,integer)',
];
for (const signature of publicRpcs) {
  const name = signature.slice(0, signature.indexOf('('));
  assert.match(normalized, new RegExp(`create function public\\.${name}\\s*\\(`));
  assert.ok(normalized.includes(`grant execute on function public.${signature}`), `Falta grant de ${signature}.`);
  assert.ok(normalized.includes(`revoke all on function public.${signature}`), `Falta revoke de ${signature}.`);
}

assert.match(normalized, /create function public\.require_fines_transparency_club\(\)/);
assert.match(normalized, /from public\.current_membership\(\)/);
assert.match(normalized, /actor\.role not in \('owner', 'admin', 'staff', 'player'\)/);
assert.match(normalized, /actor\.role = 'player' and actor\.jugador_id is null/);
assert.match(normalized, /using errcode = '42501'/);
assert.match(normalized, /revoke all on function public\.require_fines_transparency_club\(\) from public, anon, authenticated, service_role/);
assert.doesNotMatch(normalized, /grant execute on function public\.require_fines_transparency_club/);

assert.equal((normalized.match(/security definer/g) || []).length, 5);
assert.equal((normalized.match(/set search_path = pg_catalog/g) || []).length, 5);
assert.equal((normalized.match(/language plpgsql/g) || []).length, 5);
assert.equal((normalized.match(/\bstable\b/g) || []).length, 5);
assert.match(normalized, /public\.resolve_fines_season\(actor_club_id, current_date, null\)/);
assert.equal((normalized.match(/fine\.club_id = actor_club_id/g) || []).length, 4);
assert.equal((normalized.match(/incident\.club_id = actor_club_id/g) || []).length, 4);

assert.match(normalized, /returns table \( season_code text, total_fines bigint, active_fines bigint, unpaid_count bigint, partial_count bigint, paid_count bigint, cancelled_count bigint, overdue_count bigint, generated_total numeric\(14,2\), collected_total numeric\(14,2\), pending_total numeric\(14,2\) \)/);
assert.match(normalized, /current_date > data\.due_on and data\.pending_amount > 0/);
assert.match(normalized, /sum\(data\.generated_amount\) filter \( where data\.lifecycle_status = 'active'/);
assert.match(normalized, /sum\(data\.collected_amount\) filter \( where data\.lifecycle_status = 'active'/);
assert.match(normalized, /sum\(data\.pending_amount\) filter \( where data\.lifecycle_status = 'active'/);

assert.match(normalized, /create function public\.get_fines_transparency_subjects\(\)[\s\S]*?subject\.subject_type = 'player'/);
assert.match(normalized, /group by subject\.id, subject\.display_name/);
assert.match(normalized, /create function public\.get_fines_transparency_rules\(\)[\s\S]*?group by incident\.fine_rule_id, incident\.reason_snapshot/);
assert.match(normalized, /p_limit integer default 30, p_offset integer default 0/);
assert.match(normalized, /p_limit < 1 or p_limit > 100/);
assert.match(normalized, /begin actor_club_id := public\.require_fines_transparency_club\(\); if p_limit is null/, 'El control de acceso precede a la validación de paginación.');
assert.match(normalized, /order by incident\.occurred_on desc, fine\.created_at desc, fine\.id/);
assert.match(normalized, /incident\.note/);

const publicReturnDefinitions = [...sql.matchAll(/create function public\.get_fines_transparency_[\s\S]*?\n\)/g)].map((match) => match[0]).join('\n').toLowerCase();
for (const forbiddenOutput of ['club_id', 'subject_id', 'jugador_id', 'membership_id', 'auth uid', 'created_by', 'cancelled_by', 'fine_id', 'rule_id', 'incident_id']) {
  assert.equal(publicReturnDefinitions.includes(forbiddenOutput), false, `La salida pública expone ${forbiddenOutput}.`);
}

assert.doesNotMatch(executable, /\b(insert|update|delete|truncate)\s+(?:into\s+|from\s+)?public\./);
assert.doesNotMatch(executable, /(create|drop|alter) policy/);
assert.doesNotMatch(executable, /grant [^;]* on table/);
assert.doesNotMatch(executable, /role\s*=\s*'captain'|role\s+in\s*\([^)]*'captain'/);
assert.doesNotMatch(executable, /club_member_permissions|fines_manage|can_manage_fines/);
assert.doesNotMatch(executable, /fine_fund_expenses|pg_cron|cron\./);

const normalizedVerify = compact(verifySql);
const executableVerify = compact(verifySql.replace(/--.*$/gm, ''));
assert.match(normalizedVerify, /begin;.*rollback;/s);
assert.match(normalizedVerify, /create temporary table fines_transparency_results/);
assert.match(normalizedVerify, /public\.get_fines_transparency_summary\(\)/);
assert.match(normalizedVerify, /public\.get_fines_transparency_subjects\(\)/);
assert.match(normalizedVerify, /public\.get_fines_transparency_rules\(\)/);
assert.match(normalizedVerify, /public\.get_fines_transparency_list\(integer,integer\)/);
assert.match(normalizedVerify, /not pg_catalog\.has_function_privilege\('anon'/);
assert.match(normalizedVerify, /not pg_catalog\.has_function_privilege\('authenticated', helper\.oid, 'execute'\)/);
assert.match(normalizedVerify, /actual\.actual_columns = actual\.expected_columns/);
assert.match(normalizedVerify, /not pg_catalog\.has_table_privilege\('authenticated'.*'insert'\).*not pg_catalog\.has_table_privilege\('authenticated'.*'update'\).*not pg_catalog\.has_table_privilege\('authenticated'.*'delete'\)/s);
assert.match(normalizedVerify, /role_player_transparency_allowed/);
assert.match(normalizedVerify, /role_player_management_denied/);
assert.match(normalizedVerify, /role_player_manager_capability/);
assert.match(normalizedVerify, /role_player_manager_transparency_allowed/);
assert.match(normalizedVerify, /role_player_manager_management_reads_allowed/);
assert.match(normalizedVerify, /role_staff_transparency_allowed/);
assert.match(normalizedVerify, /role_staff_management_reads_allowed/);
assert.match(normalizedVerify, /role_viewer_fixture_fail_closed/);
assert.match(normalizedVerify, /role_viewer_transparency_denied/);
assert.match(normalizedVerify, /role_viewer_management_denied/);
assert.match(normalizedVerify, /role_viewer_direct_tables_zero/);
assert.match(normalizedVerify, /role_no_membership_denied/);
assert.match(normalizedVerify, /role_anon_denied/);
assert.match(normalizedVerify, /insert into auth\.users/);
assert.match(normalizedVerify, /insert into public\.club_memberships \( club_id, user_id, role, jugador_id, is_active \) values \( club_id_value, viewer_user_id, 'viewer', null, true \)/);
assert.match(normalizedVerify, /insert into public\.club_member_permissions \(membership_id, permission_key\) values \(viewer_membership_id, 'fines_manage'\)/);
assert.match(normalizedVerify, /jsonb_build_object\('sub', owner_user_id, 'role', 'authenticated'\)/);
assert.match(normalizedVerify, /transaction_viewer_fixture_scoped/);
assert.match(normalizedVerify, /checks_before_counter=%s; expected=32; total_output=33/);
assert.doesNotMatch(executableVerify, /update public\.club_memberships\b/, 'El verify 25 no puede mutar memberships reales para simular VIEWER.');
assert.doesNotMatch(executableVerify, /delete from public\.club_memberships\b/);
assert.equal((executableVerify.match(/insert into public\.club_memberships\b/g) || []).length, 1, 'Solo se permite la membership VIEWER transitoria.');
assert.doesNotMatch(executableVerify, /(update|delete from) auth\.users\b/);
assert.doesNotMatch(executableVerify, /disable trigger|drop trigger|alter function public\.guard_club_membership_mutation|grant [^;]*club_memberships/);
assert.doesNotMatch(normalizedVerify, /role\s*=\s*'captain'/);

console.log('Club Core 25 fines transparency SQL audit: fixture VIEWER transitoria y verifier de 33 checks validados.');
