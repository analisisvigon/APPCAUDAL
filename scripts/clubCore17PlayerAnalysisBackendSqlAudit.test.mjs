import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../supabase_club_core_17_player_analysis_backend.sql', import.meta.url), 'utf8').replaceAll('\r', '');
const verify = fs.readFileSync(new URL('../supabase_club_core_17_player_analysis_backend_verify.sql', import.meta.url), 'utf8').replaceAll('\r', '');

const stripSqlCommentsAndQuotedText = (source) => {
  let result = '';
  let index = 0;
  while (index < source.length) {
    if (source.startsWith('--', index)) {
      const end = source.indexOf('\n', index + 2);
      if (end < 0) break;
      result += '\n';
      index = end + 1;
    } else if (source.startsWith('/*', index)) {
      const end = source.indexOf('*/', index + 2);
      index = end < 0 ? source.length : end + 2;
      result += ' ';
    } else if (source[index] === "'") {
      index += 1;
      while (index < source.length) {
        if (source[index] === "'" && source[index + 1] === "'") index += 2;
        else if (source[index] === "'") { index += 1; break; }
        else index += 1;
      }
      result += "''";
    } else {
      result += source[index];
      index += 1;
    }
  }
  return result;
};

const assertBalanced = (source, label) => {
  const tags = [...source.matchAll(/\$[A-Za-z_][A-Za-z_0-9]*\$|\$\$/g)].map((match) => match[0]);
  const counts = new Map();
  for (const tag of tags) counts.set(tag, (counts.get(tag) || 0) + 1);
  for (const [tag, count] of counts) assert.equal(count % 2, 0, `${label}: ${tag} sin pareja`);
  const structural = stripSqlCommentsAndQuotedText(source).replace(/\$[A-Za-z_][A-Za-z_0-9]*\$|\$\$/g, ' ');
  let depth = 0;
  for (const character of structural) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    assert.ok(depth >= 0, `${label}: parentesis de cierre sin apertura`);
  }
  assert.equal(depth, 0, `${label}: parentesis no balanceados`);
};

const findBalancedCallEnd = (source, openIndex) => {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === "'") {
      index += 1;
      while (index < source.length) {
        if (source[index] === "'" && source[index + 1] === "'") index += 2;
        else if (source[index] === "'") break;
        else index += 1;
      }
      continue;
    }
    if (source[index] === '$') {
      const tag = source.slice(index).match(/^\$[A-Za-z_][A-Za-z_0-9]*\$|^\$\$/)?.[0];
      if (tag) {
        const close = source.indexOf(tag, index + tag.length);
        assert.ok(close >= 0, `Dollar quote ${tag} sin cierre dentro de JOIN/LATERAL`);
        index = close + tag.length - 1;
        continue;
      }
    }
    if (source[index] === '(') depth += 1;
    if (source[index] === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
};

const auditLateralJoins = (source) => {
  const clauses = [];
  const joinPattern = /\b(left|cross)\s+join\s+lateral\s+([a-z_][a-z0-9_.]*)\s*\(/gi;
  for (const match of source.matchAll(joinPattern)) {
    const openIndex = match.index + match[0].lastIndexOf('(');
    const closeIndex = findBalancedCallEnd(source, openIndex);
    assert.ok(closeIndex > openIndex, `Llamada LATERAL sin parentesis balanceados: ${match[0]}`);
    const tail = source.slice(closeIndex + 1);
    const aliasMatch = tail.match(/^\s+(?:as\s+)?([a-z_][a-z0-9_$]*)(?:\s+(on)\b)?/i);
    assert.ok(aliasMatch, `JOIN LATERAL sin alias tras ${match[2]}`);
    const clause = { joinType: match[1].toLowerCase(), functionName: match[2], hasOn: Boolean(aliasMatch[2]) };
    if (clause.joinType === 'left') assert.ok(clause.hasOn, `LEFT JOIN LATERAL sin ON: ${clause.functionName}`);
    if (clause.joinType === 'cross') assert.equal(clause.hasOn, false, `CROSS JOIN LATERAL no admite ON: ${clause.functionName}`);
    clauses.push(clause);
  }
  return clauses;
};

const extractFunction = (signaturePattern) => {
  const match = migration.match(new RegExp(
    `create\\s+function\\s+public\\.${signaturePattern}[\\s\\S]*?\\n\\$function\\$;`,
    'i',
  ));
  assert.ok(match, `Falta ${signaturePattern}`);
  return match[0];
};

assertBalanced(migration, 'Migracion 17');
assertBalanced(verify, 'Verificador 17');
const allJoinClauses = verify.match(/\b(?:(?:left|cross)\s+)?join(?:\s+lateral)?\b/gi) || [];
const lateralJoinClauses = auditLateralJoins(verify);
assert.equal(allJoinClauses.length, 18, 'El inventario estructural debe revisar los 18 JOIN del verificador');
assert.equal(lateralJoinClauses.length, 7, 'El inventario debe revisar los siete JOIN LATERAL, incluido el SQL dinamico');
assert.equal(lateralJoinClauses.filter(({ joinType }) => joinType === 'left').length, 3);
assert.equal(lateralJoinClauses.filter(({ joinType }) => joinType === 'cross').length, 4);
for (const source of [migration, verify]) {
  assert.doesNotMatch(source, /\bpg_catalog\.(?:coalesce|nullif|greatest|least)\s*\(/i);
  assert.doesNotMatch(source, /\)\s*::\s*[a-z_][a-z0-9_.]*(?:\s*\[\s*\])?\s*filter\s*\(/i);
}

assert.match(migration, /^-- BLOQUE 2\.7C[\s\S]*?\nbegin;/i);
assert.match(migration, /\ncommit;\s*$/i);
assert.equal((migration.match(/^begin;$/gim) || []).length, 1);
assert.equal((migration.match(/^commit;$/gim) || []).length, 1);
assert.doesNotMatch(stripSqlCommentsAndQuotedText(migration), /\brollback\b/i);

const rpcDefinitions = [
  ['get_my_player_analysis_overview\\s*\\(\\s*p_competition_scope text default \'season\',\\s*p_venue text default \'all\'\\s*\\)', 'text,text'],
  ['get_my_player_analysis_live_stats\\s*\\(\\s*p_competition_scope text default \'season\',\\s*p_venue text default \'all\',\\s*p_window text default \'last_5_event_matches\'\\s*\\)', 'text,text,text'],
  ['get_my_player_production_actions\\s*\\(\\s*p_competition_scope text default \'season\',\\s*p_venue text default \'all\'\\s*\\)', 'text,text'],
  ['get_my_player_match_history\\s*\\(\\s*p_competition_scope text default \'season\',\\s*p_venue text default \'all\',\\s*p_limit integer default 25,\\s*p_offset integer default 0\\s*\\)', 'text,text,integer,integer'],
];

const functions = rpcDefinitions.map(([pattern, args]) => [extractFunction(pattern), args]);
assert.equal((migration.match(/create function public\.get_my_player_/gi) || []).length, 4);
assert.doesNotMatch(migration, /create\s+function\s+public\.get_my_player_position_distribution/i);

for (const [body, args] of functions) {
  assert.match(body, /language plpgsql[\s\S]*?stable[\s\S]*?security definer[\s\S]*?set search_path = pg_catalog/i);
  for (const identity of ['auth.uid()', 'public.current_membership()', 'public.current_jugador_id()', 'public.is_player()']) {
    assert.ok(body.includes(identity), `Falta identidad ${identity}`);
  }
  assert.match(body, /player_visible/i);
  assert.doesNotMatch(body, /\bexecute\b/i);
  assert.doesNotMatch(body, /\bp_(?:jugador|user|membership|partido)_id\b/i);
  assert.match(migration, new RegExp(`alter function public\\.[a-z0-9_]+\\(${args}\\) owner to postgres`, 'i'));
  assert.match(migration, new RegExp(`revoke all on function public\\.[a-z0-9_]+\\(${args}\\)[\\s\\S]*?from public, anon, authenticated, service_role`, 'i'));
  assert.match(migration, new RegExp(`grant execute on function public\\.[a-z0-9_]+\\(${args}\\)[\\s\\S]*?to authenticated, service_role`, 'i'));
}

const overview = functions[0][0];
const live = functions[1][0];
const production = functions[2][0];
const history = functions[3][0];

for (const field of [
  'competition_scope text', 'venue text', 'match_records integer', 'matches_played integer',
  'minutes integer', 'possible_minutes integer', 'minutes_per_match numeric', 'starts integer',
  'bench_entries integer', 'participation_percentage numeric', 'goals integer',
  'goals_coverage text', 'assists integer', 'assists_coverage text',
  'goal_contributions integer', 'goal_contributions_coverage text', 'goals_per_90 numeric',
  'assists_per_90 numeric', 'goal_contributions_per_90 numeric', 'yellow_cards integer', 'red_cards integer',
]) assert.ok(overview.includes(field), `Overview sin ${field}`);
assert.match(overview, /pg_catalog\.count\(\*\) \* 90/i);
assert.match(overview, /own_row\.played_minutes > 0 or own_row\.normalized_role = 'titular'/i);
assert.match(overview, /goal\.type = 'Gol a favor'/i);
assert.match(overview, /goal\.scorer_id = own_jugador_id/i);
assert.match(overview, /goal\.assistant_id = own_jugador_id/i);
assert.doesNotMatch(overview, /goal\.(?:scorer|assistant)\s*=\s*own_player_name/i);

for (const effect of [
  "in ('gol', 'tiro', 'tiro_puerta')", "in ('gol', 'tiro_puerta')", "= 'centro'",
  "= 'perdida'", "= 'robo'", "= 'falta_realizada'", "= 'falta_recibida'",
]) assert.ok(live.includes(effect), `Live sin efecto ${effect}`);
for (const guard of [
  "event.jugador_id = own_jugador_id", "event.equipo = 'caudal'", 'event.reviewed is true',
  "match_row.delegated_data_status = 'Validado'", 'ranked.recency <= 3', 'ranked.recency <= 5',
]) assert.ok(live.includes(guard), `Live sin guard ${guard}`);
for (const ownEventType of ['gol', 'tiro', 'tiro_puerta', 'regate', 'centro', 'perdida', 'robo', 'recuperacion', 'falta_realizada', 'falta_recibida']) {
  assert.ok(live.includes(`'${ownEventType}'`), `Live no reconoce evento PLAYER ${ownEventType}`);
}

assert.match(production, /goal\.type = 'Gol a favor'/i);
assert.match(production, /goal\.scorer_id = own_jugador_id or goal\.assistant_id = own_jugador_id/i);
assert.ok(production.includes("^https://(youtu[.]be|youtube[.]com|www[.]youtube[.]com|m[.]youtube[.]com)(/|$)"));
for (const forbidden of ['partido_id uuid', 'event_id', 'scorer_id uuid', 'assistant_id uuid', 'notes', 'description', 'post_video_link']) {
  const returnsSection = production.slice(production.indexOf('returns table'), production.indexOf('language plpgsql'));
  assert.ok(!returnsSection.toLowerCase().includes(forbidden), `Produccion expone ${forbidden}`);
}
for (const category of ['Juego combinativo', 'Juego directo', 'Transición', 'ABP', 'Pie derecho', 'Pie izquierdo', 'Cabeza']) {
  assert.ok(production.includes(category), `Produccion sin catalogo ${category}`);
}

assert.match(history, /p_limit is null or p_limit < 1 or p_limit > 50/i);
assert.match(history, /p_offset is null or p_offset < 0/i);
assert.match(history, /stats\.jugador_id = own_jugador_id/i);
assert.match(history, /goal\.type = 'Gol a favor'/i);
assert.doesNotMatch(history, /stats\.player_name\s*=\s*own_player_name/i);

for (const allow of ['season', 'all', 'league', 'copa_rfef', 'playoff', 'friendly']) {
  for (const body of [overview, live, production, history]) assert.ok(body.includes(`'${allow}'`), `${allow} falta en RPC`);
}
for (const venue of ['all', 'home', 'away']) {
  for (const body of [overview, live, production, history]) assert.ok(body.includes(`'${venue}'`), `${venue} falta en RPC`);
}
assert.equal((migration.match(/errcode = '22023'/g) || []).length, 11);

for (const body of functions.map(([definition]) => definition)) {
  const returnsSection = body.slice(body.indexOf('returns table'), body.indexOf('language plpgsql'));
  assert.doesNotMatch(returnsSection, /\b(jugador_id|user_id|membership_id|partido_id|event_id|scorer_id|assistant_id|snapshot_id|slot_id|rating|injured|notes|description|post_video_link)\b/i);
}

assert.match(migration, /get_my_player_position_distribution[\s\S]*?revisar antes de reemplazar/i);
assert.match(migration, /posiciones debe permanecer fail-closed/i);
assert.doesNotMatch(migration, /create\s+(?:or\s+replace\s+)?function\s+public\.(?:get_my_player_profile|get_my_player_analysis_summary|get_my_player_matches)/i);
assert.doesNotMatch(stripSqlCommentsAndQuotedText(migration), /\b(?:alter table|create policy|drop policy|grant .+ on table|revoke .+ on table)\b/i);

assert.equal((verify.match(/FINAL_RESULT_BEGIN/g) || []).length, 1);
assert.equal((verify.match(/FINAL_RESULT_END/g) || []).length, 1);
assert.match(verify, /begin;\s*set transaction read only;/i);
assert.match(verify, /rollback;\s*$/i);
for (const scenario of ['BORJA_PLAYER', 'UID_WITHOUT_MEMBERSHIP', 'ANON', 'STAFF']) assert.ok(verify.includes(scenario));
for (const category of [
  'RPC_CONTRACT', 'RPC_BODY_SECURITY', 'OUTPUT_PRIVACY', 'SEMANTIC_GUARD',
  'FUNCTIONAL_IDENTITY', 'VALID_FILTERS', 'INVALID_FILTERS', 'RECONCILIATION',
  'RUNTIME_PRIVACY', 'DIRECT_TABLE_ACCESS', 'CROSS_PLAYER', 'POSITION_FAIL_CLOSED',
]) assert.ok(verify.includes(category), `Verificador sin ${category}`);
assert.match(verify, /generate_series\(0, 4950, 50\)/i);
assert.match(verify, /one aggregate row \(actions\/history may be empty arrays\)/i);

const verifierExecutable = stripSqlCommentsAndQuotedText(verify);
for (const forbidden of [
  /\binsert\b/i, /\bupdate\b/i, /\bdelete\b/i, /\bmerge\b/i, /\balter\b/i,
  /\bdrop\b/i, /\bgrant\b/i, /\brevoke\b/i, /\btruncate\b/i,
  /\bcreate\s+(?:table|view|schema|index|trigger|policy)\b/i,
]) assert.doesNotMatch(verifierExecutable, forbidden, `Verificador con escritura persistente ${forbidden}`);
assert.doesNotMatch(verifierExecutable, /\bsecurity\s+definer\b/i);

console.log('clubCore17PlayerAnalysisBackendSqlAudit.test.mjs: OK');
