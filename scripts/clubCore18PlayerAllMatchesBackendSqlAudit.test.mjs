import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL('../supabase_club_core_18_player_all_matches_backend.sql', import.meta.url),
  'utf8',
).replaceAll('\r', '');
const verify = fs.readFileSync(
  new URL('../supabase_club_core_18_player_all_matches_backend_verify.sql', import.meta.url),
  'utf8',
).replaceAll('\r', '');
const migration16 = fs.readFileSync(
  new URL('../supabase_club_core_16_player_sports_backend_lockdown.sql', import.meta.url),
  'utf8',
).replaceAll('\r', '');
const migration17 = fs.readFileSync(
  new URL('../supabase_club_core_17_player_analysis_backend.sql', import.meta.url),
  'utf8',
).replaceAll('\r', '');

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

  const structural = stripSqlCommentsAndQuotedText(source)
    .replace(/\$[A-Za-z_][A-Za-z_0-9]*\$|\$\$/g, ' ');
  let depth = 0;
  for (const character of structural) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    assert.ok(depth >= 0, `${label}: parentesis de cierre sin apertura`);
  }
  assert.equal(depth, 0, `${label}: parentesis no balanceados`);
};

const extractFunction = (source, name) => {
  const startPattern = new RegExp(
    `create(?: or replace)? function public\\.${name}\\s*\\(`,
    'i',
  );
  const start = source.search(startPattern);
  assert.ok(start >= 0, `No se encontro la definicion local de ${name}`);
  const end = source.indexOf('\n$function$;', start);
  assert.ok(end > start, `No se encontro el cierre de ${name}`);
  return source.slice(start, end + '\n$function$;'.length);
};

assertBalanced(migration, 'Migracion 18');
assertBalanced(verify, 'Verificador 18');

assert.match(migration, /^-- BLOQUE 2\.7D[\s\S]*?\nbegin;/i);
assert.match(migration, /\ncommit;\s*$/i);
assert.equal((migration.match(/^begin;$/gim) || []).length, 1);
assert.equal((migration.match(/^commit;$/gim) || []).length, 1);

const migrationStructural = stripSqlCommentsAndQuotedText(migration);
for (const forbidden of [
  /\balter\s+table\b/i,
  /\bcreate\s+policy\b/i,
  /\bdrop\s+policy\b/i,
  /\benable\s+row\s+level\s+security\b/i,
  /\bdisable\s+row\s+level\s+security\b/i,
  /\bforce\s+row\s+level\s+security\b/i,
  /\b(?:insert|update|delete|merge|truncate)\b/i,
]) assert.doesNotMatch(migrationStructural, forbidden);

const targets = [
  {
    name: 'get_my_player_matches',
    signature: 'public.get_my_player_matches()',
    args: '',
    source: migration16,
    currentJugador: false,
  },
  {
    name: 'get_my_player_analysis_overview',
    signature: 'public.get_my_player_analysis_overview(text,text)',
    args: 'text,text',
    source: migration17,
    currentJugador: true,
  },
  {
    name: 'get_my_player_analysis_live_stats',
    signature: 'public.get_my_player_analysis_live_stats(text,text,text)',
    args: 'text,text,text',
    source: migration17,
    currentJugador: true,
  },
  {
    name: 'get_my_player_production_actions',
    signature: 'public.get_my_player_production_actions(text,text)',
    args: 'text,text',
    source: migration17,
    currentJugador: true,
  },
  {
    name: 'get_my_player_match_history',
    signature: 'public.get_my_player_match_history(text,text,integer,integer)',
    args: 'text,text,integer,integer',
    source: migration17,
    currentJugador: true,
  },
];

assert.equal(targets.length, 5);
assert.match(migration, /old_predicate constant text := 'where match_row\.player_visible'/i);
assert.match(migration, /new_predicate constant text := 'where true'/i);
assert.match(migration, /old_predicate_count <> 1/i);
assert.match(migration, /pg_catalog\.replace\(\s*original_source,\s*old_predicate,\s*new_predicate/i);
assert.match(migration, /pg_catalog\.replace\(transformed_source, new_predicate, old_predicate\)[\s\S]*?original_source/i);
assert.match(migration, /pg_catalog\.to_jsonb\(function_after\)[\s\S]*?- array\['prosrc', 'proargdefaults'\]/i);
assert.match(migration, /pg_catalog\.to_jsonb\(function_before\)[\s\S]*?- array\['prosrc', 'proargdefaults'\]/i);
assert.match(migration, /pg_catalog\.pg_get_function_arguments\(function_after\.oid\)[\s\S]*?original_function_arguments/i);

for (const target of targets) {
  const body = extractFunction(target.source, target.name);
  assert.equal(
    (body.match(/where match_row\.player_visible/g) || []).length,
    1,
    `${target.name}: la referencia desplegada debe tener un solo predicado legado`,
  );
  const transformed = body.replace('where match_row.player_visible', 'where true');
  assert.ok(!transformed.includes('player_visible'), `${target.name}: la transformacion deja player_visible`);
  assert.equal(
    transformed.replace('where true', 'where match_row.player_visible'),
    body,
    `${target.name}: la transformacion local no es reversible`,
  );

  for (const identity of ['public.current_membership()', 'public.is_player()', 'supported_club_id']) {
    assert.ok(transformed.includes(identity), `${target.name}: falta identidad ${identity}`);
  }
  if (target.currentJugador) {
    assert.ok(transformed.includes('auth.uid()'), `${target.name}: falta auth.uid()`);
    assert.ok(
      transformed.includes('public.current_jugador_id()'),
      `${target.name}: falta current_jugador_id()`,
    );
  }

  assert.doesNotMatch(transformed, /select\s+\*\s+from\s+public\.partidos/i);
  assert.match(
    migration,
    new RegExp(`alter function public\\.${target.name}\\(${target.args}\\) owner to postgres`, 'i'),
  );
  assert.match(
    migration,
    new RegExp(
      `revoke all on function public\\.${target.name}\\(${target.args}\\)[\\s\\S]*?from public, anon, authenticated, service_role`,
      'i',
    ),
  );
  assert.match(
    migration,
    new RegExp(
      `grant execute on function public\\.${target.name}\\(${target.args}\\)[\\s\\S]*?to authenticated, service_role`,
      'i',
    ),
  );
  assert.ok(migration.includes(`'${target.signature}'`), `Falta inventario ${target.signature}`);
}

const matches = extractFunction(migration16, 'get_my_player_matches')
  .replace('where match_row.player_visible', 'where true');
for (const output of [
  'partido_id uuid', 'match_date text', 'opponent text', 'opponent_crest text',
  'is_home boolean', 'home_team text', 'away_team text', 'home_score text',
  'away_score text', 'stadium text', 'competition_key text', 'competition_name text',
  'competition_logo_url text', 'match_round text', 'timeline jsonb',
]) assert.ok(matches.includes(output), `Matches sin output ${output}`);
for (const forbidden of [
  'post_video_link', 'partido_eventos_post', 'match_quick_events',
  'partido_alineacion_slots', 'partido_eventos_sistema',
  'partido_snapshots_tacticos', 'partido_snapshot_tactico_slots',
]) assert.ok(!matches.includes(forbidden), `Matches expone fuente prohibida ${forbidden}`);
for (const eventType of ['Gol a favor', 'Gol en contra', 'Amarilla', 'Roja']) {
  assert.ok(matches.includes(eventType), `Timeline sin ${eventType}`);
}
assert.ok(matches.includes("^https://(youtu[.]be|youtube[.]com|www[.]youtube[.]com|m[.]youtube[.]com)(/|$)"));

const live = extractFunction(migration17, 'get_my_player_analysis_live_stats')
  .replace('where match_row.player_visible', 'where true');
assert.ok(live.includes('event.reviewed is true'));
assert.ok(live.includes("match_row.delegated_data_status = 'Validado'"));
assert.ok(live.includes('event.jugador_id = own_jugador_id'));

const production = extractFunction(migration17, 'get_my_player_production_actions')
  .replace('where match_row.player_visible', 'where true');
assert.ok(production.includes('goal.scorer_id = own_jugador_id or goal.assistant_id = own_jugador_id'));
assert.doesNotMatch(production, /goal\.(?:scorer|assistant)\s*=\s*own_player_name/i);
assert.ok(production.includes("^https://(youtu[.]be|youtube[.]com|www[.]youtube[.]com|m[.]youtube[.]com)(/|$)"));

assert.doesNotMatch(migration, /get_my_player_profile\s*\(/i);
assert.doesNotMatch(migration, /get_my_player_analysis_summary\s*\(/i);
assert.match(migration, /get_my_player_position_distribution\(text,text\)[\s\S]*?remain fail-closed|posiciones debe permanecer fail-closed/i);

assert.match(verify, /^-- BLOQUE 2\.7D[\s\S]*?\nbegin;/i);
assert.match(verify, /\nrollback;\s*$/i);
assert.equal((verify.match(/^begin;$/gim) || []).length, 1);
assert.equal((verify.match(/^rollback;$/gim) || []).length, 1);
assert.equal((verify.match(/create or replace function pg_temp\./gi) || []).length, 2);
assert.doesNotMatch(verify, /create or replace function public\./i);

const verifyStructural = stripSqlCommentsAndQuotedText(verify);
for (const forbidden of [
  /\balter\b/i,
  /\bdrop\b/i,
  /\bgrant\b/i,
  /\brevoke\b/i,
  /\b(?:insert|update|delete|merge|truncate)\b/i,
  /\bcreate\s+(?:table|policy|view|schema|index)\b/i,
]) assert.doesNotMatch(verifyStructural, forbidden);

assert.equal(
  (verify.match(/^select\s*$/gim) || []).length,
  1,
  'El verificador debe tener un unico SELECT top-level visible',
);
assert.match(verify, /player_visible_false_rows > 0[\s\S]*?jsonb_array_length\(matches_result\.result\) > 0/i);
assert.match(verify, /ALL_STAFF_MATCHES/i);
assert.match(verify, /TIMELINE_AND_VIDEO_ALLOWLIST/i);
assert.match(verify, /Overview <-> History/i);
assert.match(verify, /UUID_ONLY_REAL_ACTIONS/i);
assert.match(verify, /POSITIONS_ABSENT/i);
for (const scenario of ['BORJA_PLAYER', 'UID_WITHOUT_MEMBERSHIP', 'ANON', 'STAFF']) {
  assert.ok(verify.includes(`'${scenario}'`), `Verificador sin escenario ${scenario}`);
}
for (const table of [
  'public.partidos',
  'public.partido_estadisticas_jugador',
  'public.partido_eventos_gol',
  'public.match_quick_events',
  'public.partido_alineacion_slots',
  'public.partido_eventos_sistema',
  'public.partido_snapshots_tacticos',
  'public.partido_snapshot_tactico_slots',
]) assert.ok(verify.includes(`'${table}'`), `Verificador sin tabla ${table}`);

console.log('Bloque 2.7D: auditoria SQL local OK');
