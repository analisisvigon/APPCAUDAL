import assert from 'node:assert/strict';
import fs from 'node:fs';

const auditUrl = new URL('../supabase_player_analysis_matches_remote_audit.sql', import.meta.url);
const sql = fs.readFileSync(auditUrl, 'utf8');

const withoutLineComments = sql.replace(/--[^\r\n]*/g, ' ');
const executableSql = withoutLineComments.replace(/'(?:''|[^'])*'/gs, "''");
const normalized = executableSql.replace(/\s+/g, ' ').trim();

assert.match(normalized, /\bbegin\s*;\s*set\s+transaction\s+read\s+only\s*;/i);
assert.match(normalized, /^begin\s*;\s*create\s+or\s+replace\s+function\s+pg_temp\./i);
assert.match(normalized, /\$audit\$\s*;\s*commit\s*;\s*begin\s*;\s*set\s+transaction\s+read\s+only\s*;/i);
assert.match(normalized, /rollback\s*;\s*$/i);
assert.equal((sql.match(/FINAL_RESULT_BEGIN/g) || []).length, 1, 'Debe existir un unico marcador de salida inicial');
assert.equal((sql.match(/FINAL_RESULT_END/g) || []).length, 1, 'Debe existir un unico marcador de salida final');

for (const forbidden of [
  /\binsert\b/i,
  /\bupdate\b/i,
  /\bdelete\b/i,
  /\bmerge\b/i,
  /\balter\b/i,
  /\bdrop\b/i,
  /\bgrant\b/i,
  /\brevoke\b/i,
  /\btruncate\b/i,
  /\bcreate\s+policy\b/i,
  /\bdrop\s+policy\b/i,
  /\benable\s+row\s+level\s+security\b/i,
  /\bdisable\s+row\s+level\s+security\b/i,
]) {
  assert.doesNotMatch(executableSql, forbidden, `SQL READ ONLY contiene patron prohibido: ${forbidden}`);
}

const createLines = executableSql
  .split(/\r?\n/)
  .filter((line) => /\bcreate\b/i.test(line));
assert.ok(createLines.length > 0, 'La auditoria debe declarar sus auxiliares pg_temp');
for (const line of createLines) {
  assert.match(
    line,
    /^\s*create\s+or\s+replace\s+function\s+pg_temp\.[a-z0-9_]+/i,
    `CREATE fuera de pg_temp: ${line.trim()}`,
  );
}

assert.doesNotMatch(executableSql, /\bcreate\s+(table|view|materialized|schema|index|trigger|extension)\b/i);
assert.doesNotMatch(executableSql, /\bsecurity\s+definer\b/i, 'Los auxiliares deben ser SECURITY INVOKER');

for (const dynamicQuery of sql.matchAll(/\$query\$([\s\S]*?)\$query\$/g)) {
  const queryBody = dynamicQuery[1].replace(/'(?:''|[^'])*'/gs, "''");
  for (const forbidden of [/\binsert\b/i, /\bupdate\b/i, /\bdelete\b/i, /\bmerge\b/i, /\balter\b/i, /\bdrop\b/i, /\bgrant\b/i, /\brevoke\b/i, /\btruncate\b/i]) {
    assert.doesNotMatch(queryBody, forbidden, `Consulta dinamica contiene DML/DDL: ${forbidden}`);
  }
}

for (const quoted of sql.matchAll(/'(?:''|[^'])*'/gs)) {
  const decoded = quoted[0].slice(1, -1).replace(/''/g, "'").trim();
  if (!/^(select|with)\b/i.test(decoded)) continue;
  for (const forbidden of [/\binsert\b/i, /\bupdate\b/i, /\bdelete\b/i, /\bmerge\b/i, /\balter\b/i, /\bdrop\b/i, /\bgrant\b/i, /\brevoke\b/i, /\btruncate\b/i]) {
    assert.doesNotMatch(decoded, forbidden, `SQL dinamico entre comillas contiene DML/DDL: ${forbidden}`);
  }
}

for (const helper of [
  'pg_temp.player_audit_safe_json',
  'pg_temp.player_audit_distinct_values',
  'pg_temp.player_audit_visibility',
  'pg_temp.player_audit_identity',
  'pg_temp.player_audit_video_domains',
]) {
  assert.ok(sql.includes(helper), `Falta auxiliar temporal ${helper}`);
}

for (const table of [
  'public.club_memberships',
  'public.jugadores',
  'public.partido_estadisticas_jugador',
  'public.partido_eventos_gol',
  'public.match_quick_events',
  'public.partidos',
  'public.partido_alineacion_slots',
  'public.partido_eventos_sistema',
  'public.partido_snapshots_tacticos',
  'public.partido_snapshot_tactico_slots',
  'public.partido_eventos_post',
  'public.competitions',
  'public.partido_convocados',
  'public.partido_notas_individuales_pre',
]) {
  assert.ok(sql.includes(table), `Falta tabla obligatoria ${table}`);
}

for (const uid of [
  '350615a9-b068-450a-b867-da30a59b9082',
  '2e0146e9-e9fc-45ad-b055-edc138a85f7e',
  'f7f5aaeb-e82b-4e6b-8920-694bc32cb6c7',
]) {
  assert.ok(sql.includes(uid), `Falta identidad temporal de auditoria ${uid}`);
}

for (const scenario of ['BORJA_PLAYER', 'UID_WITHOUT_MEMBERSHIP', 'ANON', 'STAFF_OWNER']) {
  assert.ok(sql.includes(scenario), `Falta escenario ${scenario}`);
}

const finalStart = sql.indexOf('-- FINAL_RESULT_BEGIN');
const finalEnd = sql.indexOf('-- FINAL_RESULT_END');
assert.ok(finalStart >= 0 && finalEnd > finalStart, 'Marcadores de salida invalidos');
const finalBlock = sql.slice(finalStart, finalEnd);
assert.match(finalBlock, /with\s+recursive/i);
assert.match(finalBlock, /select[\s\S]+from numbered_checks numbered[\s\S]+order by test_order\s*;/i);

for (const outputColumn of [
  'test_order',
  'category',
  'scenario',
  'object_name',
  'check_name',
  'expected',
  'observed',
  'risk_level',
  'test_ok',
  'details',
]) {
  assert.ok(finalBlock.includes(outputColumn), `Falta columna final ${outputColumn}`);
}

assert.match(sql, /NO_PUBLICATION_FIELD_FOUND/);
assert.match(sql, /potentially_signed_count/);
assert.match(sql, /name_only_rows/);
assert.match(sql, /PLAYER_ID_COVERAGE/);
assert.match(sql, /staff_guard_detected/);
assert.match(sql, /pg_catalog\.aclexplode/);
assert.match(sql, /pg_catalog\.pg_policy/);
assert.match(sql, /set local role %I/);
assert.match(sql, /request\.jwt\.claim\.sub/);

const informationSchemaColumnArrays = [
  ...sql.matchAll(/array_agg\(\s*column_row\.column_name(?<cast>\s*::\s*text)?/gi),
];
assert.equal(informationSchemaColumnArrays.length, 6, 'Deben auditarse las seis agregaciones de column_name');
for (const match of informationSchemaColumnArrays) {
  assert.ok(match.groups?.cast, 'Todo array_agg de information_schema.columns.column_name debe convertir cada elemento a text');
}
assert.doesNotMatch(
  sql,
  /array_agg\(\s*column_row\.column_name(?!\s*::\s*text)/i,
  'No puede reconstruirse information_schema.sql_identifier[] desde column_name',
);

const aggregateFilterMatches = [...sql.matchAll(/\bfilter\s*\(/gi)];
assert.equal(aggregateFilterMatches.length, 41, 'Deben revisarse todos los FILTER del auditor remoto');
const aggregateFilterCounts = { count: 0, arrayAgg: 0 };
for (const filterMatch of aggregateFilterMatches) {
  const prefix = sql.slice(0, filterMatch.index).trimEnd();
  assert.equal(
    prefix.at(-1),
    ')',
    `FILTER no esta ligado directamente a una llamada de agregado cerca de ${filterMatch.index}`,
  );
  const aggregateContext = prefix.slice(-400);
  const directAggregate = aggregateContext.match(
    /(?:(?<count>\bcount\s*\(\s*\*\s*\))|(?<arrayAgg>\bpg_catalog\.array_agg\s*\([^)]*\)))\s*$/i,
  );
  assert.ok(
    directAggregate,
    `FILTER no sigue directamente a uno de los agregados auditados cerca de ${filterMatch.index}`,
  );
  aggregateFilterCounts[directAggregate.groups?.count ? 'count' : 'arrayAgg'] += 1;
}
assert.deepEqual(
  aggregateFilterCounts,
  { count: 39, arrayAgg: 2 },
  'El inventario FILTER debe conservar 39 count(*) y dos array_agg',
);
assert.doesNotMatch(
  sql,
  /\)\s*::\s*[a-z_][a-z0-9_.]*(?:\s*\[\s*\])?\s*filter\s*\(/gi,
  'El cast del resultado agregado debe aparecer despues de FILTER, nunca entre el agregado y FILTER',
);
assert.doesNotMatch(
  sql,
  /column_row\.column_name(?!\s*::\s*text)\s*(?:~\*|~|like\b|ilike\b)/gi,
  'column_name de information_schema debe convertirse a text antes de regex/LIKE/ILIKE',
);
assert.match(
  sql,
  /\(\s*pg_catalog\.array_agg\(column_row\.column_name::text\s+order\s+by\s+column_row\.ordinal_position\)\s*filter\s*\(\s*where\s+column_row\.column_name::text\s*~\*[\s\S]*?\)\s*\)::text\[\]/i,
  'El array de campos de publicacion debe aplicar FILTER antes del cast text[]',
);
assert.match(
  sql,
  /'state_like_columns',\s*coalesce\(\s*\(\s*pg_catalog\.array_agg\(column_row\.column_name::text\s+order\s+by\s+column_row\.ordinal_position\)\s*filter\s*\(\s*where\s+column_row\.column_name::text\s*~\*[\s\S]*?\)\s*\)::text\[\],\s*array\[\]::text\[\]/i,
  'El array de campos de estado debe aplicar FILTER y cast antes de COALESCE',
);
assert.doesNotMatch(
  sql,
  /\bpg_catalog\.(?:greatest|least)\s*\(/i,
  'GREATEST/LEAST son construcciones especiales y no deben cualificarse como funciones de pg_catalog',
);
const greatestLeastMatches = [...sql.matchAll(/\b(?:greatest|least)\s*\(/gi)];
assert.equal(greatestLeastMatches.length, 1, 'Debe inventariarse el unico GREATEST/LEAST del auditor');
assert.match(
  sql,
  /\bgreatest\(visible_rows\s*-\s*subject_rows,\s*0::bigint\)/i,
  'Los contadores de visibilidad deben normalizar GREATEST a bigint',
);
assert.doesNotMatch(
  sql,
  /\b(?:greatest|least)\s*\([^)]*,\s*[+-]?\d+\s*\)/gi,
  'Los literales numericos de GREATEST/LEAST deben llevar un tipo explicito',
);
assert.doesNotMatch(
  sql,
  /\b(?:max|min)\s*\(\s*(?:[a-z_][a-z0-9_]*\.)?[a-z_][a-z0-9_]*_id\s*\)/gi,
  'No puede aplicarse max/min a identificadores UUID',
);
const minMaxAggregates = [
  ...sql.matchAll(/\b(?<aggregate>max|min)\s*\(\s*(?<argument>[a-z_][a-z0-9_.]*)\s*\)/gi),
].map((match) => `${match.groups.aggregate.toLowerCase()}(${match.groups.argument.toLowerCase()})`);
assert.deepEqual(
  minMaxAggregates,
  ['min(date)', 'max(date)'],
  'Solo se permiten los min/max no UUID inventariados',
);
assert.match(
  sql,
  /'membership_role',\s*\(select\s+membership\.role\s+from\s+public\.current_membership\(\)\s+membership\)/i,
  'membership_role debe obtenerse mediante la misma subconsulta escalar 0/1',
);
assert.match(
  sql,
  /'membership_jugador_id',\s*\(select\s+membership\.jugador_id\s+from\s+public\.current_membership\(\)\s+membership\)/i,
  'membership_jugador_id debe obtenerse mediante una subconsulta escalar 0/1',
);
assert.match(
  sql,
  /'profile_jugador_id',\s*\(select\s+profile\.jugador_id\s+from\s+public\.get_my_player_profile\(\)\s+profile\)/i,
  'profile_jugador_id debe obtenerse mediante una subconsulta escalar 0/1',
);
assert.doesNotMatch(
  sql,
  /\bcount\s*\([^)]*\)\s*[+*/-]\s*[+-]?\d+(?!\s*::\s*bigint)/gi,
  'La aritmetica entre count(*) y literales debe normalizar explicitamente el tipo',
);
assert.doesNotMatch(
  sql,
  /(?:\b(?:visible_rows|subject_rows|contrast_rows|non_subject_rows|baseline_rows|uuid_fk_count)|::bigint)\s*(?:=|<>|>=|<=|>|<)\s*[01](?!\s*::\s*bigint)/gi,
  'Las comparaciones de contadores bigint con 0/1 deben tipar tambien el literal',
);
const visibilityHelper = sql.match(
  /create\s+or\s+replace\s+function\s+pg_temp\.player_audit_visibility\([\s\S]*?\n\$audit\$;/i,
)?.[0];
assert.ok(visibilityHelper, 'Debe poder auditarse el helper FUNCTIONAL_SELECT');
const visibilityCounts = [...visibilityHelper.matchAll(/\bcount\s*\(\s*\*\s*\)/gi)];
const typedVisibilityCounts = [
  ...visibilityHelper.matchAll(
    /\bcount\s*\(\s*\*\s*\)(?:\s*::\s*bigint|\s*filter\s*\([\s\S]*?\)\s*::\s*bigint)/gi,
  ),
];
assert.equal(visibilityCounts.length, 7, 'Deben inventariarse los siete count(*) del helper de visibilidad');
assert.equal(
  typedVisibilityCounts.length,
  visibilityCounts.length,
  'Todo count(*) que alimenta las salidas bigint de FUNCTIONAL_SELECT debe tiparse como bigint',
);
assert.doesNotMatch(
  sql,
  /coalesce\(\s*(?:\([^)]*\)::bigint|[a-z_][a-z0-9_.]*(?:_rows|_count))\s*,\s*0\s*\)/gi,
  'Los fallbacks de contadores bigint en COALESCE deben usar 0::bigint',
);
assert.match(
  sql,
  /coalesce\(pg_catalog\.array_length\([^)]*\),\s*0::integer\)\s*>\s*0::integer/i,
  'array_length y sus literales deben conservar el tipo integer',
);
const sumMatches = [...sql.matchAll(/\bsum\s*\(/gi)];
assert.equal(sumMatches.length, 3, 'Deben inventariarse los tres SUM del auditor');
for (const sumMatch of sumMatches) {
  const sumContext = sql.slice(sumMatch.index, sumMatch.index + 500);
  assert.match(sumContext, /0::numeric/i, `SUM sin normalizacion numeric cerca de ${sumMatch.index}`);
}
for (const operatorPattern of [/@>/g, /<@/g, /&&/g]) {
  const occurrences = [...sql.matchAll(operatorPattern)];
  for (const occurrence of occurrences) {
    const context = sql.slice(Math.max(0, occurrence.index - 180), occurrence.index + 180);
    assert.match(context, /text\[\]/i, `Comparacion de arrays sin normalizacion text[] cerca de ${occurrence.index}`);
  }
}
assert.match(sql, /column_row\.column_name::text\s*=\s*any\(timeline\.required_columns::text\[\]\)/i);
assert.match(sql, /column_row\.column_name::text\s*=\s*any\(metric\.required_columns::text\[\]\)/i);

console.log('playerAnalysisMatchesRemoteAudit.test.mjs: OK');
