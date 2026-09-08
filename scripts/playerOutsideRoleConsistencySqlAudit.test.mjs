import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL('../supabase_player_outside_role_consistency.sql', import.meta.url),
  'utf8',
);
const atomic = fs.readFileSync(
  new URL('../supabase_match_squad_lineup_atomic.sql', import.meta.url),
  'utf8',
);
const publicationGate = fs.readFileSync(
  new URL('../supabase_player_match_publication_gate.sql', import.meta.url),
  'utf8',
);
const realDeployedHistoryShape = `
history AS (
  select scoped.*, stats.role,
    case when stats.minutes is not null then stats.minutes else 0 end as played_minutes
  from public.partido_estadisticas_jugador stats
  join scoped_matches scoped on scoped.id = stats.partido_id
  where stats.jugador_id = own_jugador_id
)`;
const realDeployedSummaryShape = `
from public.partido_estadisticas_jugador stats
join public.partidos match_row on match_row.id = stats.partido_id
cross join lateral (
  select pg_catalog.to_jsonb(match_row) as match_json
) serialized
where public.is_player_match_publishable(
  match_json ->> 'status',
  match_json ->> 'date'
)
  and stats.jugador_id = own_jugador_id
  and pg_catalog.lower(coalesce(stats.role, '')) = 'titular'`;

const recognizesRealDeployedHistory = (source) => (
  /history\s+as\s*\(/i.test(source)
  && /from\s+public\.partido_estadisticas_jugador\s+stats/i.test(source)
  && /join\s+scoped_matches\s+scoped/i.test(source)
  && /stats\.role/i.test(source)
  && /played_minutes/i.test(source)
);
assert.equal(recognizesRealDeployedHistory(realDeployedHistoryShape), true, 'la guarda estructural reconoce el cuerpo real sin depender de sus saltos');
const recognizesRealDeployedSummary = (source) => (
  /from\s+public\.partido_estadisticas_jugador\s+stats/i.test(source)
  && /join\s+public\.partidos\s+match_row/i.test(source)
  && /public\.is_player_match_publishable\s*\(/i.test(source)
  && /stats\.jugador_id\s*=\s*own_jugador_id/i.test(source)
  && /stats\.role/i.test(source)
);
assert.equal(recognizesRealDeployedSummary(realDeployedSummaryShape), true, 'la guarda estructural reconoce el summary real sin depender de sus saltos');

const canonicalHistoryProjection = ({ isStarter, isCalled, minutes }) => ({
  role: isStarter ? 'Titular' : isCalled ? 'Suplente' : 'Fuera',
  minutes: !isStarter && !isCalled ? null : Number(minutes || 0),
  countsAsPlayed: (isStarter || isCalled) && (isStarter || Number(minutes || 0) > 0),
  countsAsBenchEntry: !isStarter && isCalled && Number(minutes || 0) > 0,
});

assert.deepEqual(canonicalHistoryProjection({ isStarter: true, isCalled: true, minutes: 77 }), {
  role: 'Titular', minutes: 77, countsAsPlayed: true, countsAsBenchEntry: false,
}, 'A: titular con 77 minutos');
assert.deepEqual(canonicalHistoryProjection({ isStarter: false, isCalled: true, minutes: 18 }), {
  role: 'Suplente', minutes: 18, countsAsPlayed: true, countsAsBenchEntry: true,
}, 'B: suplente que juega 18 minutos');
assert.deepEqual(canonicalHistoryProjection({ isStarter: false, isCalled: true, minutes: '' }), {
  role: 'Suplente', minutes: 0, countsAsPlayed: false, countsAsBenchEntry: false,
}, 'C: suplente convocado que no juega');
assert.deepEqual(canonicalHistoryProjection({ isStarter: false, isCalled: false, minutes: 63 }), {
  role: 'Fuera', minutes: null, countsAsPlayed: false, countsAsBenchEntry: false,
}, 'D-F/H: Fuera domina incluso sobre estadisticas historicas obsoletas');
assert.deepEqual(canonicalHistoryProjection({ isStarter: false, isCalled: false, minutes: 90 }), {
  role: 'Fuera', minutes: null, countsAsPlayed: false, countsAsBenchEntry: false,
}, 'E: un antiguo Titular/90 tambien queda Fuera');
assert.deepEqual(canonicalHistoryProjection({ isStarter: false, isCalled: false }), {
  role: 'Fuera', minutes: null, countsAsPlayed: false, countsAsBenchEntry: false,
}, 'F: un partido sin fila stats queda Fuera con minutos no aplicables');

assert.match(migration, /^-- PLAYER:[\s\S]*?\nbegin;/i);
assert.match(migration, /\ncommit;\s*$/i);
assert.equal((migration.match(/^begin;$/gim) || []).length, 1);
assert.equal((migration.match(/^commit;$/gim) || []).length, 1);
assert.doesNotMatch(migration, /\bdrop\s+(?:function|table)|\balter\s+table|\bcreate\s+(?:table|policy)|\bdrop\s+policy/i);
assert.doesNotMatch(migration, /\b(?:insert|update|delete|merge|truncate)\s+(?:into\s+|from\s+)?public\./i);
assert.doesNotMatch(migration, /\b(?:grant|revoke)\b/i, 'CREATE OR REPLACE conserva ACL sin reescribir permisos');

const correctedHistory = migration.match(
  /create or replace function public\.get_my_player_match_history\([\s\S]*?\n\$function\$;/i,
)?.[0] || '';
assert.ok(correctedHistory, 'history se reemplaza mediante una definicion completa');
assert.match(correctedHistory, /from scoped_matches scoped[\s\S]*?left join public\.partido_estadisticas_jugador stats/i, 'history parte de scoped_matches y stats es opcional');
assert.doesNotMatch(correctedHistory, /stats\.role/i, 'stats.role deja de tener autoridad en el historial');
assert.match(correctedHistory, /where true[\s\S]*?public\.is_player_match_publishable\(/i, 'la definicion completa conserva el gate temporal');
assert.equal((migration.match(/create or replace function public\.get_my_player_match_history/gi) || []).length, 1, 'la segunda ejecucion reemplaza por la misma definicion idempotente');
assert.doesNotMatch(migration, /cuerpo history inesperado|select scoped\.\*, stats\.role/i, 'history ya no depende de la coincidencia textual que fallo en produccion');

const correctedSummary = migration.match(
  /create or replace function public\.get_my_player_analysis_summary\(\)[\s\S]*?\n\$function\$;/i,
)?.[0] || '';
assert.ok(correctedSummary, 'summary se reemplaza mediante una definicion completa');
assert.match(correctedSummary, /published_matches as[\s\S]*?public\.is_player_match_publishable\(/i, 'summary parte de partidos publicables');
assert.match(correctedSummary, /canonical_rows as[\s\S]*?left join public\.partido_estadisticas_jugador stats/i, 'summary resuelve participacion antes de consumir stats opcionales');
assert.match(correctedSummary, /from public\.partido_alineacion_slots lineup[\s\S]*?from public\.partido_convocados callup/i, 'summary comparte XI y convocatoria canonicos');
assert.doesNotMatch(correctedSummary, /stats\.role/i, 'stats.role deja de tener autoridad en summary');
assert.match(correctedSummary, /where own_row\.is_starter or own_row\.is_called[\s\S]*?as matches/i, 'Fuera no cuenta como match de summary');
assert.match(correctedSummary, /own_row\.is_called[\s\S]*?not own_row\.is_starter[\s\S]*?played_minutes > 0[\s\S]*?as bench_entries/i, 'solo suplentes reales que juegan cuentan como entrada');
assert.equal((migration.match(/create or replace function public\.get_my_player_analysis_summary/gi) || []).length, 1, 'summary es idempotente por CREATE OR REPLACE estable');
assert.doesNotMatch(migration, /cuerpo summary inesperado|start_anchor constant text := '  with own_stats/i, 'summary ya no depende de anclas textuales');

for (const signature of [
  'public.get_my_player_analysis_overview(text,text)',
  'public.get_my_player_match_history(text,text,integer,integer)',
  'public.get_my_player_analysis_summary()',
]) assert.ok(migration.includes(signature), `falta contrato ${signature}`);

assert.match(migration, /pg_get_function_identity_arguments/i);
assert.match(migration, /pg_get_function_result/i);
assert.match(migration, /function_row\.proconfig is distinct from array\['search_path=pg_catalog'\]/i);
assert.match(migration, /not function_row\.prosecdef/i);
assert.match(migration, /function_after\.oid is distinct from function_before\.oid/i);
assert.match(migration, /to_jsonb\(function_after\) - array\['prosrc', 'proargdefaults'\]/i);

assert.match(migration, /when canonical_participation\.is_starter then 'Titular'[\s\S]*?when canonical_participation\.is_called then 'Suplente'[\s\S]*?else 'Fuera'/i);
assert.match(migration, /from public\.partido_alineacion_slots lineup[\s\S]*?lineup\.scope = 'stats'[\s\S]*?lineup\.jugador_id = own_jugador_id/i);
assert.match(migration, /from public\.partido_convocados callup[\s\S]*?callup\.jugador_id = own_jugador_id/i);
assert.match(migration, /not canonical_participation\.is_starter[\s\S]*?not canonical_participation\.is_called then null/i);
assert.match(migration, /own_row\.normalized_role <> 'fuera'[\s\S]*?as match_records/i);
assert.match(migration, /own_row\.normalized_role = 'suplente'[\s\S]*?as bench_entries/i);
assert.match(migration, /from scoped_matches scoped[\s\S]*?left join public\.partido_estadisticas_jugador stats[\s\S]*?canonical_participation/i, 'overview tambien parte de partidos del scope y trata stats como opcionales');
assert.match(correctedSummary, /count\(\*\) filter[\s\S]*?own_row\.is_starter[\s\S]*?as starts/i);
assert.match(migration, /public\.is_player_match_publishable\(/i);
assert.match(migration, /publication gate se perdio/i);
assert.match(publicationGate, /madrid_today > match_day/i, 'G: el dia del partido sigue sin ser publicable');
assert.match(publicationGate, /get_my_player_match_history/i, 'G: history permanece bajo el gate temporal');

assert.match(atomic, /desired\.role in \('Titular', 'Suplente'\)/i);
assert.doesNotMatch(atomic, /delete from public\.partido_estadisticas_jugador/i);

console.log('PLAYER outside role consistency SQL audit passed');
