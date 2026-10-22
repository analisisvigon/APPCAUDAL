import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const migration = read('supabase_multiclub_02_scoped_reads.sql');
const preflight = read('supabase_multiclub_02_scoped_reads_preflight.sql');
const postflight = read('supabase_multiclub_02_scoped_reads_postflight.sql');
const code = (sql) => sql.replace(/--[^\r\n]*/g, '').replace(/'(?:''|[^'])*'/g, "''");

for (const name of ['my_cts_matches_v1', 'my_cts_roster_links_v1']) {
  assert.match(migration, new RegExp(`create function public\\.${name}\\(p_club_team_season_id uuid\\)`, 'i'));
  assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\(uuid\\) from public, anon, authenticated`, 'i'));
  assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\(uuid\\) to authenticated`, 'i'));
}
assert.equal((migration.match(/auth\.uid\(\) is not null/g) || []).length, 2);
assert.equal((migration.match(/public\.can_read_club_team_season\(p_club_team_season_id\)/g) || []).length, 2);
assert.match(migration, /match_row\.club_team_season_id = p_club_team_season_id/);
assert.match(migration, /membership\.club_team_season_id = p_club_team_season_id/);
assert.match(migration, /membership\.voided_at is null/);
assert.match(migration, /case when ficha\.ficha_count = 1 then ficha\.ficha_ids\[1\]/);
assert.doesNotMatch(code(migration), /\b(create|alter|drop)\s+(table|policy)\b|\b(insert|update|delete)\s+(into|public\.|from)\b/i);

for (const sql of [preflight, postflight]) {
  assert.doesNotMatch(code(sql), /\b(begin|commit|rollback|insert|update|delete|create|alter|drop|grant|revoke|execute|call)\b/i);
  assert.match(sql, /legacy_identity_definition_hash/);
}

console.log('multiclub02ScopedReadsSqlAudit tests: OK');
