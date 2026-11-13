import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
assert.match(sql, /SESSION_DELETE_EXTERNAL_DEPENDENCY_OR_TRIGGER_REVIEW_REQUIRED/);
assert.match(sql, /where session_id=\$1',target\) using p_session_id/);
assert.ok(sql.indexOf('insert into public.planned_session_deletion_archive_v1') < sql.indexOf("execute format('delete from"));
assert.match(ui, /setLifecycleAction\('delete'\)/);
assert.match(ui, /onClick=\{lifecycleAction === 'delete' \? performDeletion : performLifecycle\}/);
assert.match(ui, /deletionReady && deletionAllowed/);
assert.match(ui, /deleteTarget.club_team_season_id !== contextId/);
assert.match(ui, /if \(editor\?\.id === deleteTarget.id && dirty\)/);
assert.match(ui, /scope !== deletionScopeRef.current/);

// Full definitions must preserve every byte of the old bodies after removing
// precisely the new transaction-scoped DELETE branch (no SQL is executed).
const normalized = (text) => text.replace(/\r\n/g, '\n').trim();
const md5 = (text) => createHash('md5').update(normalized(text)).digest('hex');
const functionBody = (text, name) => {
  const start = text.indexOf(`function public.${name}(`);
  assert.ok(start >= 0, name);
  return normalized(text.slice(start).split('$fn$')[1]);
};
assert.doesNotMatch(sql, /regexp_replace|execute\s+replace|pg_get_functiondef/i);
for (const [name, source, id] of [
  ['guard_planned_session_row', 'supabase_sessions_03a.sql', 'id'],
  ['guard_planned_session_player_roster', 'supabase_sessions_04a.sql', 'session_id'],
  ['guard_planned_session_audit', 'supabase_sessions_03a.sql', 'session_id'],
]) {
  const original = functionBody(readFileSync(source, 'utf8'), name);
  const revised = functionBody(sql, name);
  const exception = `  -- Unica excepcion nueva: DELETE acreditado para esta sesion y transaccion.\n` +
    `  if tg_op='DELETE' and public.planned_session_delete_authorized_v1(old.${id}) then\n` +
    `    return old;\n  end if;\n`;
  assert.equal(revised, original.replace(/\bbegin\n/, `begin\n${exception}`), `${name}: only authorized DELETE changes`);
  assert.ok(sql.includes(`'${md5(original)}'`), `${name}: original hash enforced before replacement`);
  assert.ok(verifier.includes(`'${md5(original)}'`) && verifier.includes(`'${md5(revised)}'`), `${name}: before/after hashes in verifier`);
}
assert.match(sql, /md5\(btrim\(replace\(p.prosrc/);
assert.ok(sql.indexOf('end $guards_preflight$') < sql.indexOf('create or replace function public.guard_planned_session_row'));
assert.match(sql, /begin;[\s\S]*do \$postflight\$[\s\S]*commit;\s*$/);
assert.match(sql, /Migración de borrado ya instalada o instalación parcial/);

const rpc = functionBody(sql, 'delete_planned_session_v1');
const retryOffset = rpc.indexOf('if not exists(select 1 from public.planned_training_sessions');
assert.ok(retryOffset > 0);
const beforeRetry = rpc.slice(0, retryOffset);
for (const pattern of [
  /auth.uid\(\) is null/, /can_write_club_team_season\(p_club_team_season_id\) is not true/,
  /season_status is distinct from 'open'/, /for update of se/, /m.is_active/, /for share of m/,
  /actor_role='staff'/, /p.club_team_season_id=p_club_team_season_id for share of p/,
]) assert.match(beforeRetry, pattern, 'retry cannot bypass current authorization');
assert.match(rpc, /revision=p_expected_revision and actor_user_id=auth.uid\(\)/);
assert.match(sql, /enable row level security;\s*revoke all on public.planned_session_deletion_archive_v1 from public,anon,authenticated,service_role/);
assert.match(sql, /snapshot:=jsonb_build_object\('session',to_jsonb\(saved\)\)/);
assert.match(sql, /jsonb_agg\(to_jsonb\(r\)\)/);
assert.match(sql, /before truncate[\s\S]*guard_planned_session_deletion_archive_v1/);

// The verifier evaluates the identical read-only catalog contract, before OR
// after installation, without invoking a missing function or reading snapshots.
const contract = functionBody(sql, 'planned_session_delete_contract_v1');
assert.ok(normalized(verifier).includes(contract));
for (const pattern of [
  /count\(\*\)=10 from actual_fk/, /c.child_columns=e.child_columns/,
  /c.parent_columns=e.parent_columns/, /c.confdeltype::text=e.delete_action/,
  /c.convalidated and not c.condeferrable/, /count\(\*\)=6 from actual_trigger/,
  /t.tgfoid=to_regprocedure/, /t.tgtype=31/, /t.tgqual is null and t.tgnargs=0/,
  /t.tgenabled in \('O','A'\)/, /not c.relhassubclass/, /from pg_rewrite/,
]) assert.match(contract, pattern);
assert.match(rpc, /planned_session_delete_contract_v1\(\) is not true/);
assert.ok(rpc.indexOf('planned_session_delete_contract_v1()') < rpc.indexOf('insert into public.planned_session_deletion_archive_v1'));
assert.match(functionBody(sql, 'planned_session_delete_ready_v1'), /planned_session_delete_contract_v1\(\)/);

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
assert.deepEqual(order, [availability, roster, dimensions, items,
  'planned_session_distributions', 'planned_session_board_seed_v11',
  'planned_session_date_change_authorizations', slots, 'planned_session_audit_events']);
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
