import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationUrl = new URL('../supabase_club_core_16_player_sports_backend_lockdown.sql', import.meta.url);
const verifyUrl = new URL('../supabase_club_core_16_player_sports_backend_lockdown_verify.sql', import.meta.url);
const migration = fs.readFileSync(migrationUrl, 'utf8').replaceAll('\r', '');
const verify = fs.readFileSync(verifyUrl, 'utf8').replaceAll('\r', '');

function assertBalancedSqlStructure(source, label) {
  const dollarTags = [...source.matchAll(/\$[A-Za-z_][A-Za-z_0-9]*\$|\$\$/g)]
    .map((match) => match[0]);
  const tagCounts = new Map();
  for (const tag of dollarTags) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
  for (const [tag, count] of tagCounts) {
    assert.equal(count % 2, 0, `${label}: delimitador ${tag} sin pareja`);
  }

  const structural = stripSqlCommentsAndQuotedText(source)
    .replace(/\$[A-Za-z_][A-Za-z_0-9]*\$|\$\$/g, ' ');
  let depth = 0;
  for (const character of structural) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    assert.ok(depth >= 0, `${label}: parentesis de cierre sin apertura`);
  }
  assert.equal(depth, 0, `${label}: parentesis no balanceados`);
}

function stripSqlCommentsAndQuotedText(source) {
  let result = '';
  let index = 0;
  while (index < source.length) {
    if (source.startsWith('--', index)) {
      const end = source.indexOf('\n', index + 2);
      if (end === -1) return result;
      result += '\n';
      index = end + 1;
      continue;
    }
    if (source.startsWith('/*', index)) {
      let depth = 1;
      index += 2;
      while (index < source.length && depth > 0) {
        if (source.startsWith('/*', index)) {
          depth += 1;
          index += 2;
        } else if (source.startsWith('*/', index)) {
          depth -= 1;
          index += 2;
        } else index += 1;
      }
      result += ' ';
      continue;
    }
    if (source[index] === "'") {
      index += 1;
      while (index < source.length) {
        if (source[index] === "'" && source[index + 1] === "'") index += 2;
        else if (source[index] === "'") {
          index += 1;
          break;
        } else index += 1;
      }
      result += ' ';
      continue;
    }
    result += source[index];
    index += 1;
  }
  return result;
}

function extractFunction(source, signaturePattern) {
  const match = source.match(new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+${signaturePattern}[\\s\\S]*?\\n\\$function\\$;`,
    'i',
  ));
  assert.ok(match, `Falta funcion ${signaturePattern}`);
  return match[0];
}

const targetTables = [
  'partido_estadisticas_jugador',
  'partido_eventos_gol',
  'match_quick_events',
  'partidos',
  'partido_alineacion_slots',
  'partido_eventos_sistema',
  'partido_snapshots_tacticos',
  'partido_snapshot_tactico_slots',
  'partido_eventos_post',
  'competitions',
  'partido_convocados',
  'partido_notas_individuales_pre',
];

assertBalancedSqlStructure(migration, 'Migracion 16');
assertBalancedSqlStructure(verify, 'Verificador 16');
for (const source of [migration, verify]) {
  assert.doesNotMatch(
    source,
    /\bpg_catalog\.(?:coalesce|nullif|greatest|least)\s*\(/i,
    'COALESCE/NULLIF/GREATEST/LEAST no deben cualificarse como funciones pg_catalog',
  );
  assert.doesNotMatch(
    source,
    /\)\s*::\s*[a-z_][a-z0-9_.]*(?:\s*\[\s*\])?\s*filter\s*\(/gi,
    'FILTER debe aplicarse antes de castear el resultado agregado',
  );
}

assert.match(migration, /^-- BLOQUE 2\.6A[\s\S]*?\nbegin;/i);
assert.match(migration, /\ncommit;\s*$/i);
assert.equal((migration.match(/^begin;$/gim) || []).length, 1, 'Migracion: una sola transaccion superior');
assert.equal((migration.match(/^commit;$/gim) || []).length, 1, 'Migracion: un solo COMMIT superior');
assert.doesNotMatch(stripSqlCommentsAndQuotedText(migration), /\brollback\b/i);

for (const table of targetTables) {
  assert.ok(migration.includes(`'${table}'`), `Migracion: falta tabla ${table}`);
  assert.ok(verify.includes(`public.${table}`), `Verificador: falta tabla public.${table}`);
}

assert.match(migration, /add column if not exists player_visible boolean not null default false/i);
assert.match(migration, /alter column player_visible set default false[\s\S]*alter column player_visible set not null/i);
assert.doesNotMatch(migration, /set\s+player_visible\s*=\s*true/i);
assert.match(migration, /Nunca se deriva de status, marcador ni delegated_data_status/i);

for (const command of ['select', 'insert', 'update', 'delete']) {
  assert.match(
    migration,
    new RegExp(`create policy player_sports_staff_${command}[\\s\\S]*?public\\.is_app_staff\\(\\)`, 'i'),
    `Falta policy STAFF ${command}`,
  );
}
assert.match(migration, /drop policy %I on public\.%I/i);
assert.match(migration, /revoke all privileges on table public\.%I from public, anon, authenticated, service_role/i);
assert.match(migration, /grant select, insert, update, delete on table public\.%I to authenticated, service_role/i);
assert.doesNotMatch(migration, /create policy[\s\S]{0,220}(?:using|with check)\s*\(\s*true\s*\)/i);
assert.doesNotMatch(migration, /create policy[\s\S]{0,160}\bto\s+(?:anon|public)\b/i);

const matchesRpc = extractFunction(migration, 'public\\.get_my_player_matches\\(\\)');
const analysisRpc = extractFunction(migration, 'public\\.get_my_player_analysis_summary\\(\\)');

for (const [name, body] of [
  ['get_my_player_matches', matchesRpc],
  ['get_my_player_analysis_summary', analysisRpc],
]) {
  assert.match(body, /language plpgsql[\s\S]*?stable[\s\S]*?security definer[\s\S]*?set search_path = pg_catalog/i);
  assert.match(body, /public\.current_membership\(\)/i);
  assert.match(body, /public\.is_player\(\)/i);
  assert.doesNotMatch(body, /\bp_(?:jugador|user|membership|partido)_id\b/i, `${name} no puede aceptar IDs externos`);
  assert.doesNotMatch(body, /\bexecute\b/i, `${name} no debe usar SQL dinamico`);
}

for (const output of [
  'partido_id uuid',
  'match_date text',
  'opponent text',
  'opponent_crest text',
  'is_home boolean',
  'home_team text',
  'away_team text',
  'home_score text',
  'away_score text',
  'stadium text',
  'competition_key text',
  'competition_name text',
  'competition_logo_url text',
  'match_round text',
  'timeline jsonb',
]) assert.ok(matchesRpc.includes(output), `Falta salida segura de partidos: ${output}`);

assert.match(matchesRpc, /where match_row\.player_visible/i);
assert.match(matchesRpc, /membership_club_id is distinct from supported_club_id/i);
for (const eventType of ['Gol a favor', 'Gol en contra', 'Amarilla', 'Roja']) {
  assert.ok(matchesRpc.includes(eventType), `Falta evento permitido ${eventType}`);
}
for (const forbiddenSource of [
  'match_quick_events',
  'partido_eventos_sistema',
  'partido_snapshots_tacticos',
  'partido_snapshot_tactico_slots',
  'partido_eventos_post',
  'partido_convocados',
  'partido_notas_individuales_pre',
  'post_video_link',
]) assert.ok(!matchesRpc.includes(forbiddenSource), `Partidos RPC toca fuente prohibida ${forbiddenSource}`);
assert.ok(
  matchesRpc.includes("^https://(youtu[.]be|youtube[.]com|www[.]youtube[.]com|m[.]youtube[.]com)(/|$)"),
  'Falta allowlist HTTPS exacta para hosts YouTube',
);

for (const output of [
  'jugador_id uuid', 'matches bigint', 'minutes numeric', 'starts bigint',
  'bench_entries bigint', 'goals bigint', 'goals_coverage text', 'assists bigint',
  'assists_coverage text', 'yellow_cards numeric', 'red_cards bigint',
]) assert.ok(analysisRpc.includes(output), `Falta metrica PLAYER: ${output}`);
assert.match(analysisRpc, /goal\.scorer_id = own_jugador_id/i);
assert.match(analysisRpc, /goal\.assistant_id = own_jugador_id/i);
assert.match(analysisRpc, /unresolved_scorers[\s\S]*?'PARTIAL'/i);
assert.doesNotMatch(analysisRpc, /lower\([^)]*(?:scorer|assistant|player_name)[^)]*\)\s*=/i, 'Legacy por nombre no puede atribuirse al PLAYER');
assert.doesNotMatch(analysisRpc, /partido_snapshot|partido_eventos_sistema|\bsystem\b/i, 'Distribucion posicional no fiable queda fuera de 2.6A');

for (const signature of [
  'public.delete_match_system_change_with_snapshot(uuid)',
  'public.mutate_match_goal_atomic(text,uuid,uuid,jsonb,jsonb)',
  'public.save_match_print_plan_atomic(uuid,jsonb)',
  'public.set_delegated_match_status(uuid,text)',
]) assert.ok(migration.includes(signature), `Falta mutadora confirmada ${signature}`);

assert.match(migration, /procedure\.prorettype <> 'pg_catalog\.trigger'::regtype/i);
assert.match(migration, /guarded_source := staff_guard \|\| original_source \|\| E'\\nend;'/i);
assert.match(migration, /pg_catalog\.pg_get_functiondef\(function_target\.oid\)/i);
assert.match(migration, /after_source is distinct from guarded_source/i);
assert.match(migration, /after_owner is distinct from function_target\.proowner/i);
assert.match(migration, /after_security_definer is distinct from function_target\.prosecdef/i);
assert.match(migration, /after_volatility is distinct from function_target\.provolatile/i);
assert.match(migration, /after_config is distinct from function_target\.proconfig/i);
for (const guardPart of [
  "coalesce(auth.role(), '''') <> ''service_role''",
  "session_user <> ''service_role''",
  'not public.is_app_staff()',
  "errcode = ''42501''",
  "message = ''STAFF_ONLY''",
]) assert.ok(migration.includes(guardPart), `Falta guard: ${guardPart}`);

assert.match(migration, /alter function public\.get_my_player_matches\(\) owner to postgres/i);
assert.match(migration, /alter function public\.get_my_player_analysis_summary\(\) owner to postgres/i);
assert.match(migration, /grant execute on function public\.get_my_player_matches\(\)[\s\S]*?to authenticated, service_role/i);
assert.match(migration, /grant execute on function public\.get_my_player_analysis_summary\(\)[\s\S]*?to authenticated, service_role/i);

assert.equal((verify.match(/FINAL_RESULT_BEGIN/g) || []).length, 1);
assert.equal((verify.match(/FINAL_RESULT_END/g) || []).length, 1);
assert.match(verify, /begin;\s*set transaction read only;/i);
assert.match(verify, /rollback;\s*$/i);
for (const scenario of ['BORJA_PLAYER', 'UID_WITHOUT_MEMBERSHIP', 'ANON', 'STAFF_OWNER']) {
  assert.ok(verify.includes(scenario), `Falta escenario ${scenario}`);
}
for (const helper of ['sports_table_count', 'sports_rpc_json', 'sports_mutator_probe']) {
  assert.match(verify, new RegExp(`create or replace function pg_temp\\.${helper}`, 'i'));
}
for (const category of [
  'DIRECT_TABLE_ACCESS', 'RLS_POLICY', 'TABLE_GRANT', 'MATCH_PUBLICATION',
  'PLAYER_RPC_CONTRACT', 'PLAYER_MATCHES_RPC', 'PLAYER_ANALYSIS_RPC',
  'MUTATING_RPC_GUARD', 'MUTATING_RPC_FUNCTIONAL',
]) assert.ok(verify.includes(category), `Falta categoria ${category}`);

const verifierExecutable = stripSqlCommentsAndQuotedText(verify);
for (const forbidden of [
  /\binsert\b/i, /\bupdate\b/i, /\bdelete\b/i, /\bmerge\b/i,
  /\balter\b/i, /\bdrop\b/i, /\bgrant\b/i, /\brevoke\b/i,
  /\btruncate\b/i, /\bcreate\s+(?:table|view|schema|index|trigger|policy)\b/i,
]) assert.doesNotMatch(verifierExecutable, forbidden, `Verificador contiene escritura persistente: ${forbidden}`);

assert.doesNotMatch(migration, /\b(?:import|require)\b[\s\S]*?(?:react|src\/)/i);
assert.doesNotMatch(verify, /\b(?:import|require)\b[\s\S]*?(?:react|src\/)/i);

console.log('clubCore16PlayerSportsBackendSqlAudit.test.mjs: OK');
