import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(
  new URL('../supabase_player_my_performance_read_verify.sql', import.meta.url),
  'utf8',
);

assert.match(sql, /^begin;/m);
assert.match(sql, /^rollback;/m);
assert.match(sql, /create or replace function pg_temp\.verify_my_performance_reads\(\)/i);
assert.doesNotMatch(sql, /\b(?:insert\s+into|update\s+public\.|delete\s+from|alter\s+table|drop\s+|grant\s+|revoke\s+)\b/i);
assert.match(sql, /BORJA_PLAYER/);
assert.match(sql, /UID_WITHOUT_MEMBERSHIP/);
assert.match(sql, /ANON/);
assert.match(sql, /STAFF/);
assert.match(sql, /other_player_rows/);
assert.match(sql, /jairo_rows/);
assert.match(sql, /performance_player_select_own/);
assert.match(sql, /set local role authenticated/i);
assert.match(sql, /set local role anon/i);

console.log('Player performance SQL verifier: solo lecturas funcionales y rollback validados.');
