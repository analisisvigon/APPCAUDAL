import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readSql = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const migration = readSql('supabase_club_core_40_multiclub_identity.sql');
const preflight = readSql('supabase_club_core_40_multiclub_identity_preflight.sql');
const postflight = readSql('supabase_club_core_40_multiclub_identity_postflight.sql');
const withoutComments = (sql) => sql.replace(/--[^\r\n]*/g, '');
const withoutLiterals = (sql) => sql.replace(/'(?:''|[^'])*'/g, "''");

assert.match(migration, /create function public\.my_access_contexts_v1\(\)/i);
assert.match(migration, /security definer\s+set search_path = pg_catalog/i);
assert.match(migration, /membership\.user_id = auth\.uid\(\)/i);
assert.match(migration, /membership\.is_active/i);
assert.match(migration, /relation\.club_id = membership\.club_id/i);
assert.match(migration, /public\.can_read_club_team_season\(relation\.id\)/i);
assert.match(migration, /membership\.role in \('owner', 'admin', 'staff'\)/i);
assert.match(migration, /revoke all on function public\.my_access_contexts_v1\(\) from public, anon, authenticated/i);
assert.match(migration, /grant execute on function public\.my_access_contexts_v1\(\) to authenticated/i);
assert.doesNotMatch(withoutComments(migration), /\b(create|alter|drop)\s+(policy|table)\b|\b(insert|update|delete)\s+(into|public\.|from)\b/i);
assert.doesNotMatch(withoutComments(migration), /\b(create|alter|drop)\s+function\s+public\.current_membership\b/i);

for (const [name, sql] of [['preflight', preflight], ['postflight', postflight]]) {
  assert.doesNotMatch(withoutLiterals(withoutComments(sql)), /\b(begin|commit|rollback|insert|update|delete|create|alter|drop|grant|revoke|execute|call)\b/i,
    `${name} debe seguir siendo de solo lectura`);
  assert.match(sql, /legacy_identity_definition_hash/i);
}

console.log('clubCore40MulticlubIdentitySqlAudit tests: OK');
