import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql = readFileSync('supabase_sessions_delete_v1.sql', 'utf8');
const verifier = readFileSync('supabase_sessions_delete_v1_verify.sql', 'utf8');
const ui = readFileSync('src/components/training/PlannedSessionsSection.jsx', 'utf8');
const source04a = readFileSync('supabase_sessions_04a.sql', 'utf8');
const oldState = readFileSync('src/data/plannedSessionsStore.js', 'utf8');
assert.match(oldState, /SESSION_RETIREMENT_BACKEND_VERIFIED = false/, 'anulación no se habilita por accidente');
assert.match(source04a, /planned_session_player_availability_roster_fkey[\s\S]*?on delete restrict/);
assert.doesNotMatch(sql, /disable\s+(?:trigger|row level security)|drop\s+(?:trigger|constraint)|session_replication_role|on delete cascade/i);
assert.doesNotMatch(verifier.replace(/--[^\n]*/g, ''), /\b(?:insert|update|delete|alter|create|drop)\s+(?:into|from|table|function)\b/i);
assert.match(sql, /planned_session_04b_lock\(p_session_id,p_expected_revision\)/);
assert.match(sql, /ctx.cts_id is distinct from p_club_team_season_id/);
assert.match(sql, /p_confirm is distinct from true/);
assert.match(sql, /a.transaction_id=txid_current\(\)/);
assert.match(sql, /a.actor_user_id=auth.uid\(\)/);
assert.match(sql, /revoke all on function public.planned_session_delete_authorized_v1\(uuid\) from public,anon,authenticated,service_role/);
assert.match(sql, /to_jsonb\(saved\)->>'retired_at' is not null/);
assert.match(sql, /SESSION_DELETE_EXTERNAL_DEPENDENCY/);
assert.match(sql, /SESSION_DELETE_TRIGGER_REVIEW_REQUIRED/);
assert.match(sql, /where session_id=\$1',target\) using p_session_id/);
assert.ok(sql.indexOf('insert into public.planned_session_deletion_archive_v1') < sql.indexOf("execute format('delete from"));
assert.match(ui, /setLifecycleAction\('delete'\)/);
assert.match(ui, /onClick=\{lifecycleAction === 'delete' \? performDeletion : performLifecycle\}/);
assert.match(ui, /deletionReady && deletionAllowed/);
assert.match(ui, /deleteTarget.club_team_season_id !== contextId/);
assert.match(ui, /if \(editor\?\.id === deleteTarget.id && dirty\)/);
assert.match(ui, /scope !== deletionScopeRef.current/);

// Dependency-graph simulation using the actual migration's explicit table order.
// This checks RESTRICT ordering and isolation, not PostgreSQL trigger execution.
const orderText = sql.match(/ordered_tables constant text\[\] := array\[([\s\S]*?)\];/)[1];
const order = [...orderText.matchAll(/'([^']+)'/g)].map((match) => match[1]);
const root = 'planned_training_sessions';
const roster = 'planned_session_player_roster';
const availability = 'planned_session_player_availability';
const slots = 'planned_session_slots';
const items = 'planned_session_items';
const dimensions = 'planned_session_exercise_dimensions_v12';
for (const scenario of ['empty', 'roster', 'availability_first_team', 'library_items']) {
  const data = Object.fromEntries([...order, root, 'players_database', 'training_tasks'].map((table) => [table, []]));
  data[root] = [{ session_id: 'target' }, { session_id: 'other' }];
  data.players_database = [{ id: 'global-player' }];
  data.training_tasks = [{ id: 'library-original' }];
  for (const table of order) data[table].push({ session_id: 'other' });
  if (scenario !== 'empty') data[roster].push({ session_id: 'target', player_id: 'global-player' });
  if (scenario === 'availability_first_team') data[availability].push({ session_id: 'target', status: 'first_team' });
  if (scenario === 'library_items') {
    data[slots].push({ session_id: 'target' });
    data[items].push({ session_id: 'target', source_task_id: 'library-original' });
    data[dimensions].push({ session_id: 'target' });
  }
  data.planned_session_audit_events.push({ session_id: 'target', revision: 4 });
  const before = structuredClone(data);
  const archive = Object.fromEntries(Object.entries(data).map(([table, rows]) =>
    [table, rows.filter((row) => row.session_id === 'target')]));
  for (const table of [...order, root]) {
    if (table === roster) assert.ok(!data[availability].some((row) => row.session_id === 'target'), 'RESTRICT disponibilidad -> plantilla');
    if (table === slots) for (const child of [items, dimensions])
      assert.ok(!data[child].some((row) => row.session_id === 'target'), 'hijos de ejercicios antes que franjas');
    if (table === root) for (const child of order)
      assert.ok(!data[child].some((row) => row.session_id === 'target'));
    data[table] = data[table].filter((row) => row.session_id !== 'target');
  }
  assert.deepEqual(data.players_database, before.players_database);
  assert.deepEqual(data.training_tasks, before.training_tasks);
  for (const table of [...order, root]) {
    assert.deepEqual(data[table], before[table].filter((row) => row.session_id === 'other'));
    assert.deepEqual(archive[table], before[table].filter((row) => row.session_id === 'target'));
  }
}
console.log('session deletion SQL/UI audit and RESTRICT graph simulations: OK (SQL not executed)');
